//! Native meeting audio capture.
//!
//! The stream/conversion pipeline adapts the small, active parts of Meetily's
//! CPAL capture design. Audio never enters the webview: callbacks feed a bounded
//! native channel, frames are mixed/resampled here, and a WAV checkpoint is kept
//! for crash recovery and the native transcription transport.

use super::{
    audio::{downmix_to_mono, StreamingLinearResampler},
    recovery::{
        capture_base_directory, epoch_ms, validate_meeting_id, write_checkpoint, CheckpointWav,
    },
};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::ErrorKind,
    net::TcpStream,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};
use tungstenite::{
    client::IntoClientRequest,
    http::{header::SEC_WEBSOCKET_PROTOCOL, HeaderValue},
    protocol::{frame::coding::CloseCode, CloseFrame},
    stream::MaybeTlsStream,
    WebSocket,
};

pub(super) const TARGET_SAMPLE_RATE: u32 = 24_000;
const FRAME_SAMPLES: usize = 480;
const TRANSPORT_BATCH_SAMPLES: usize = FRAME_SAMPLES * 5;
const MAX_CAPTURE_MS: u64 = 3 * 60 * 60 * 1_000;
const AUDIO_CHANNEL_CAPACITY: usize = 128;
const TRANSPORT_CHANNEL_CAPACITY: usize = 1_500;
const TRANSPORT_REPLAY_CAPACITY: usize = 1_500;
const MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS: u8 = 6;
const MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE: u16 = 4_400;
const TRANSCRIPTION_STABLE_CONNECTION: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingAudioDevice {
    backend: &'static str,
    capture_mode: CaptureMode,
    id: String,
    name: String,
    kind: AudioDeviceKind,
    is_default: bool,
    is_system_capture_candidate: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum CaptureMode {
    Microphone,
    NativeLoopback,
    VirtualInput,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum AudioDeviceKind {
    Microphone,
    System,
    Output,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingCapturePermissions {
    microphone: &'static str,
    system_audio: &'static str,
    system_audio_supported: bool,
    detail: &'static str,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingCaptureConfig {
    meeting_id: String,
    audio_websocket_url: Option<String>,
    audio_ticket: Option<String>,
    microphone_device_id: Option<String>,
    system_device_id: Option<String>,
    #[serde(default = "default_true")]
    capture_microphone: bool,
    #[serde(default)]
    capture_system_audio: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MeetingCaptureStatus {
    active_sources: Vec<AudioSource>,
    meeting_id: Option<String>,
    phase: CapturePhase,
    elapsed_ms: u64,
    sample_rate: u32,
    checkpoint_path: Option<String>,
    error: Option<String>,
    warnings: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
enum CapturePhase {
    Idle,
    Starting,
    Recording,
    Paused,
    Stopped,
    Error,
}

impl Default for MeetingCaptureStatus {
    fn default() -> Self {
        Self {
            active_sources: Vec::new(),
            meeting_id: None,
            phase: CapturePhase::Idle,
            elapsed_ms: 0,
            sample_rate: TARGET_SAMPLE_RATE,
            checkpoint_path: None,
            error: None,
            warnings: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MeetingAudioLevel {
    rms: f32,
    peak: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MeetingTranscriptDraft {
    item_id: String,
    meeting_id: String,
    source: AudioSource,
    start_ms: u64,
    text: String,
    updated_at: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetingAudioServerEvent {
    item_id: Option<String>,
    message: Option<String>,
    next_sequences: Option<HashMap<AudioSource, u64>>,
    source: Option<AudioSource>,
    start_ms: Option<u64>,
    text: Option<String>,
    token: Option<String>,
    #[serde(rename = "type")]
    kind: String,
    updated_at: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverableMeetingCapture {
    pub(super) meeting_id: String,
    pub(super) started_at_epoch_ms: u64,
    pub(super) elapsed_ms: u64,
    pub(super) sample_rate: u32,
    pub(super) audio_path: String,
}

#[derive(Default)]
pub struct MeetingCaptureManager {
    session: Mutex<Option<CaptureSession>>,
    last_status: Mutex<MeetingCaptureStatus>,
}

struct CaptureSession {
    control: mpsc::Sender<CaptureControl>,
    worker: thread::JoinHandle<()>,
    status: Arc<Mutex<MeetingCaptureStatus>>,
}

enum CaptureControl {
    Pause {
        response: mpsc::SyncSender<Result<(), String>>,
    },
    Resume {
        response: mpsc::SyncSender<Result<(), String>>,
    },
    RefreshTransport {
        ticket: String,
        url: String,
    },
    Stop,
}

enum TransportCommand {
    Frame {
        samples: Vec<f32>,
        sequence: u64,
        source: AudioSource,
    },
}

enum TransportControl {
    Pause {
        response: mpsc::SyncSender<Result<(), String>>,
    },
    Resume {
        response: mpsc::SyncSender<Result<(), String>>,
    },
    RefreshCredentials {
        ticket: String,
        url: String,
    },
    Stop {
        duration_ms: u64,
        response: mpsc::SyncSender<Result<(), String>>,
    },
}

struct TransportWorker {
    commands: mpsc::SyncSender<TransportCommand>,
    control: mpsc::Sender<TransportControl>,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
enum AudioSource {
    Microphone,
    System,
}

struct AudioChunk {
    source: AudioSource,
    samples: Vec<f32>,
    sample_rate: u32,
}

struct CaptureStreams {
    active_sources: Vec<AudioSource>,
    streams: Vec<cpal::Stream>,
    warnings: Vec<String>,
}

#[tauri::command]
pub fn meeting_capture_list_devices() -> Result<Vec<MeetingAudioDevice>, String> {
    let host = cpal::default_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let default_output = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let mut devices = Vec::new();

    let inputs = host
        .input_devices()
        .map_err(|error| format!("Could not enumerate input devices: {error}"))?;
    for device in inputs {
        if let (Ok(description), Ok(id)) = (device.description(), device.id()) {
            let name = description.name().to_string();
            let id = id.to_string();
            let virtual_input = is_loopback_device(&name);
            let native_loopback = supports_native_loopback(&device) && !virtual_input;
            let system_candidate = virtual_input || native_loopback;
            devices.push(MeetingAudioDevice {
                backend: "cpal",
                capture_mode: if virtual_input {
                    CaptureMode::VirtualInput
                } else if native_loopback {
                    CaptureMode::NativeLoopback
                } else {
                    CaptureMode::Microphone
                },
                id: id.clone(),
                name,
                kind: if system_candidate {
                    AudioDeviceKind::System
                } else {
                    AudioDeviceKind::Microphone
                },
                is_default: if system_candidate {
                    default_output.as_deref() == Some(id.as_str())
                } else {
                    default_input.as_deref() == Some(id.as_str())
                },
                is_system_capture_candidate: system_candidate,
            });
        }
    }

    let outputs = host
        .output_devices()
        .map_err(|error| format!("Could not enumerate output devices: {error}"))?;
    for device in outputs {
        if let (Ok(description), Ok(id)) = (device.description(), device.id()) {
            let id = id.to_string();
            if devices.iter().any(|device| device.id == id) {
                continue;
            }
            let native_loopback = supports_native_loopback(&device);
            devices.push(MeetingAudioDevice {
                backend: "cpal",
                capture_mode: CaptureMode::NativeLoopback,
                id: id.clone(),
                name: description.name().to_string(),
                kind: if native_loopback {
                    AudioDeviceKind::System
                } else {
                    AudioDeviceKind::Output
                },
                is_default: default_output.as_deref() == Some(id.as_str()),
                is_system_capture_candidate: native_loopback,
            });
        }
    }

    Ok(devices)
}

#[tauri::command]
pub fn meeting_capture_permissions() -> MeetingCapturePermissions {
    let has_loopback = meeting_capture_list_devices()
        .map(|devices| {
            devices
                .iter()
                .any(|device| device.is_system_capture_candidate)
        })
        .unwrap_or(false);

    MeetingCapturePermissions {
        microphone: "prompt-on-start",
        system_audio: if has_loopback {
            "prompt-on-start"
        } else {
            "unavailable"
        },
        system_audio_supported: has_loopback,
        detail: "Microphone access may prompt on start. System audio uses native output loopback where supported and a monitor or virtual input elsewhere.",
    }
}

#[tauri::command]
pub fn meeting_capture_start(
    app: AppHandle,
    manager: State<'_, MeetingCaptureManager>,
    config: MeetingCaptureConfig,
) -> Result<MeetingCaptureStatus, String> {
    validate_config(&config)?;
    let mut session_guard = manager
        .session
        .lock()
        .map_err(|_| "Meeting capture state is unavailable".to_string())?;
    if session_guard.is_some() {
        return Err("Another meeting is already being captured on this device".into());
    }

    let base_directory = capture_base_directory(&app)?;
    let meeting_directory = base_directory.join(&config.meeting_id);
    fs::create_dir_all(&meeting_directory)
        .map_err(|error| format!("Could not create the meeting checkpoint: {error}"))?;
    let audio_path = meeting_directory.join("meeting-audio.wav");
    let checkpoint_path = meeting_directory.join("checkpoint.json");
    let status = Arc::new(Mutex::new(MeetingCaptureStatus {
        active_sources: Vec::new(),
        meeting_id: Some(config.meeting_id.clone()),
        phase: CapturePhase::Starting,
        elapsed_ms: 0,
        sample_rate: TARGET_SAMPLE_RATE,
        checkpoint_path: Some(audio_path.to_string_lossy().into_owned()),
        error: None,
        warnings: Vec::new(),
    }));
    let (control_tx, control_rx) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let worker_status = status.clone();
    let worker_app = app.clone();
    let worker = thread::Builder::new()
        .name("meeting-audio-capture".into())
        .spawn(move || {
            run_capture(
                worker_app,
                config,
                audio_path,
                checkpoint_path,
                worker_status,
                control_rx,
                ready_tx,
            );
        })
        .map_err(|error| format!("Could not start the audio worker: {error}"))?;

    if let Err(error) = ready_rx
        .recv_timeout(Duration::from_secs(8))
        .map_err(|_| "Audio capture did not start in time".to_string())?
    {
        let _ = worker.join();
        return Err(error);
    }

    let current = status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())?
        .clone();
    *manager
        .last_status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())? = current.clone();
    *session_guard = Some(CaptureSession {
        control: control_tx,
        worker,
        status,
    });
    Ok(current)
}

#[tauri::command]
pub fn meeting_capture_pause(
    manager: State<'_, MeetingCaptureManager>,
) -> Result<MeetingCaptureStatus, String> {
    control_capture(&manager, |response| CaptureControl::Pause { response })
}

#[tauri::command]
pub fn meeting_capture_resume(
    manager: State<'_, MeetingCaptureManager>,
) -> Result<MeetingCaptureStatus, String> {
    control_capture(&manager, |response| CaptureControl::Resume { response })
}

#[tauri::command]
pub fn meeting_capture_refresh_transport(
    manager: State<'_, MeetingCaptureManager>,
    audio_websocket_url: String,
    audio_ticket: String,
) -> Result<(), String> {
    MeetingAudioTransport::from_parts(audio_websocket_url.clone(), audio_ticket.clone())?;
    let guard = manager
        .session
        .lock()
        .map_err(|_| "Meeting capture state is unavailable".to_string())?;
    guard
        .as_ref()
        .ok_or_else(|| "No meeting capture is active".to_string())?
        .control
        .send(CaptureControl::RefreshTransport {
            ticket: audio_ticket,
            url: audio_websocket_url,
        })
        .map_err(|_| "The meeting capture worker has stopped".to_string())
}

#[tauri::command]
pub fn meeting_capture_stop(
    manager: State<'_, MeetingCaptureManager>,
) -> Result<MeetingCaptureStatus, String> {
    let session = manager
        .session
        .lock()
        .map_err(|_| "Meeting capture state is unavailable".to_string())?
        .take()
        .ok_or_else(|| "No meeting capture is active".to_string())?;
    session
        .control
        .send(CaptureControl::Stop)
        .map_err(|_| "The meeting capture worker has stopped".to_string())?;
    session
        .worker
        .join()
        .map_err(|_| "The meeting capture worker exited unexpectedly".to_string())?;
    let status = session
        .status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())?
        .clone();
    *manager
        .last_status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())? = status.clone();
    Ok(status)
}

#[tauri::command]
pub fn meeting_capture_state(
    manager: State<'_, MeetingCaptureManager>,
) -> Result<MeetingCaptureStatus, String> {
    let session_guard = manager
        .session
        .lock()
        .map_err(|_| "Meeting capture state is unavailable".to_string())?;
    if let Some(session) = session_guard.as_ref() {
        return session
            .status
            .lock()
            .map_err(|_| "Meeting capture status is unavailable".to_string())
            .map(|status| status.clone());
    }
    manager
        .last_status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())
        .map(|status| status.clone())
}

fn control_capture<F>(
    manager: &State<'_, MeetingCaptureManager>,
    create_control: F,
) -> Result<MeetingCaptureStatus, String>
where
    F: FnOnce(mpsc::SyncSender<Result<(), String>>) -> CaptureControl,
{
    let session_guard = manager
        .session
        .lock()
        .map_err(|_| "Meeting capture state is unavailable".to_string())?;
    let session = session_guard
        .as_ref()
        .ok_or_else(|| "No meeting capture is active".to_string())?;
    let (response_tx, response_rx) = mpsc::sync_channel(1);
    session
        .control
        .send(create_control(response_tx))
        .map_err(|_| "The meeting capture worker has stopped".to_string())?;
    response_rx
        .recv_timeout(Duration::from_secs(20))
        .map_err(|_| "Meeting transcription control timed out".to_string())??;
    session
        .status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())
        .map(|status| status.clone())
}

fn request_transport_control<F>(
    worker: Option<&TransportWorker>,
    create_control: F,
) -> Result<(), String>
where
    F: FnOnce(mpsc::SyncSender<Result<(), String>>) -> TransportControl,
{
    let Some(worker) = worker else {
        return Ok(());
    };
    let (response, completed) = mpsc::sync_channel(1);
    worker
        .control
        .send(create_control(response))
        .map_err(|_| "Meeting transcription worker stopped".to_string())?;
    completed
        .recv_timeout(Duration::from_secs(20))
        .map_err(|_| "Meeting transcription control timed out".to_string())?
}

fn run_capture(
    app: AppHandle,
    config: MeetingCaptureConfig,
    audio_path: PathBuf,
    checkpoint_path: PathBuf,
    status: Arc<Mutex<MeetingCaptureStatus>>,
    control_rx: mpsc::Receiver<CaptureControl>,
    ready_tx: mpsc::SyncSender<Result<(), String>>,
) {
    let transport = match MeetingAudioTransport::from_config(&config) {
        Ok(transport) => transport,
        Err(error) => {
            set_error(&app, &status, error.clone());
            let _ = ready_tx.send(Err(error));
            return;
        }
    };
    let (audio_tx, audio_rx) = mpsc::sync_channel(AUDIO_CHANNEL_CAPACITY);
    let (stream_error_tx, stream_error_rx) = mpsc::channel();
    let paused = Arc::new(AtomicBool::new(false));
    let stream_result = build_capture_streams(&config, audio_tx, stream_error_tx, paused.clone());
    let capture_streams = match stream_result {
        Ok(streams) => streams,
        Err(error) => {
            set_error(&app, &status, error.clone());
            let _ = ready_tx.send(Err(error));
            return;
        }
    };
    let transport_tx = transport.map(|mut transport| {
        transport.active_sources = capture_streams.active_sources.clone();
        spawn_transport_worker(app.clone(), config.meeting_id.clone(), transport)
    });
    if let Ok(mut current) = status.lock() {
        current.active_sources = capture_streams.active_sources.clone();
        current.warnings = capture_streams.warnings.clone();
    }
    for warning in &capture_streams.warnings {
        let _ = app.emit(
            "meeting-capture-warning",
            serde_json::json!({ "code": "source_unavailable", "message": warning }),
        );
    }
    let stereo = capture_streams.active_sources.len() > 1;
    let mut wav = match CheckpointWav::create(&audio_path, stereo) {
        Ok(wav) => wav,
        Err(error) => {
            set_error(&app, &status, error.clone());
            let _ = ready_tx.send(Err(error));
            return;
        }
    };

    update_phase(&app, &status, CapturePhase::Recording);
    let _ = ready_tx.send(Ok(()));
    let started_at = epoch_ms();
    let mut mic = VecDeque::new();
    let mut system = VecDeque::new();
    let mut microphone_resampler = StreamingLinearResampler::default();
    let mut system_resampler = StreamingLinearResampler::default();
    let microphone_active = capture_streams
        .active_sources
        .contains(&AudioSource::Microphone);
    let system_active = capture_streams
        .active_sources
        .contains(&AudioSource::System);
    let active_source_count = capture_streams.active_sources.len() as f32;
    let mut next_mix_at = Instant::now() + Duration::from_millis(100);
    let mut elapsed_samples = 0_u64;
    let mut transport_lagging = false;
    let mut stopping = false;
    while !stopping && elapsed_samples * 1_000 / (TARGET_SAMPLE_RATE as u64) < MAX_CAPTURE_MS {
        if let Ok(error) = stream_error_rx.try_recv() {
            set_error(&app, &status, error);
            break;
        }
        while let Ok(control) = control_rx.try_recv() {
            match control {
                CaptureControl::Pause { response } => {
                    let result =
                        request_transport_control(transport_tx.as_ref(), |transport_response| {
                            TransportControl::Pause {
                                response: transport_response,
                            }
                        });
                    if result.is_ok() {
                        paused.store(true, Ordering::Release);
                        update_phase(&app, &status, CapturePhase::Paused);
                    }
                    let _ = response.send(result);
                }
                CaptureControl::Resume { response } => {
                    let result =
                        request_transport_control(transport_tx.as_ref(), |transport_response| {
                            TransportControl::Resume {
                                response: transport_response,
                            }
                        });
                    if result.is_ok() {
                        paused.store(false, Ordering::Release);
                        next_mix_at = Instant::now() + Duration::from_millis(100);
                        update_phase(&app, &status, CapturePhase::Recording);
                    }
                    let _ = response.send(result);
                }
                CaptureControl::RefreshTransport { ticket, url } => {
                    if let Some(worker) = transport_tx.as_ref() {
                        let _ = worker
                            .control
                            .send(TransportControl::RefreshCredentials { ticket, url });
                    }
                }
                CaptureControl::Stop => stopping = true,
            }
        }
        if stopping {
            break;
        }

        if let Ok(chunk) = audio_rx.recv_timeout(Duration::from_millis(20)) {
            let (resampler, destination) = match chunk.source {
                AudioSource::Microphone => (&mut microphone_resampler, &mut mic),
                AudioSource::System => (&mut system_resampler, &mut system),
            };
            let resampled =
                resampler.process(&chunk.samples, chunk.sample_rate, TARGET_SAMPLE_RATE);
            destination.extend(resampled);
        }
        if paused.load(Ordering::Acquire) {
            mic.clear();
            system.clear();
            continue;
        }

        while Instant::now() >= next_mix_at {
            next_mix_at += Duration::from_millis(20);
            let mut microphone_frame = Vec::with_capacity(FRAME_SAMPLES);
            let mut system_frame = Vec::with_capacity(FRAME_SAMPLES);
            let mut frame = Vec::with_capacity(FRAME_SAMPLES);
            for _ in 0..FRAME_SAMPLES {
                let mic_sample = if microphone_active {
                    mic.pop_front().unwrap_or(0.0)
                } else {
                    0.0
                };
                let system_sample = if system_active {
                    system.pop_front().unwrap_or(0.0)
                } else {
                    0.0
                };
                microphone_frame.push(mic_sample);
                system_frame.push(system_sample);
                frame.push(((mic_sample + system_sample) / active_source_count).tanh());
            }
            if let Err(error) = wav.write_sources(
                &microphone_frame,
                &system_frame,
                microphone_active,
                system_active,
            ) {
                set_error(&app, &status, error);
                stopping = true;
                break;
            }
            if let Some(worker) = transport_tx.as_ref() {
                let sequence = elapsed_samples / FRAME_SAMPLES as u64;
                let frames = [
                    (
                        AudioSource::Microphone,
                        &microphone_frame,
                        microphone_active,
                    ),
                    (AudioSource::System, &system_frame, system_active),
                ];
                let result = frames
                    .into_iter()
                    .filter(|(_, _, active)| *active)
                    .try_for_each(|(source, samples, _)| {
                        worker.commands.try_send(TransportCommand::Frame {
                            samples: samples.clone(),
                            sequence,
                            source,
                        })
                    });
                if let Err(error) = result {
                    if !transport_lagging {
                        let _ = app.emit(
                            "meeting-capture-warning",
                            serde_json::json!({
                                "code": "transcription_transport_unavailable",
                                "message": format!("Transcription is falling behind ({error}); local recording is still complete."),
                            }),
                        );
                    }
                    transport_lagging = true;
                } else {
                    transport_lagging = false;
                }
            }
            elapsed_samples += FRAME_SAMPLES as u64;
            let elapsed_ms = elapsed_samples * 1_000 / TARGET_SAMPLE_RATE as u64;
            update_elapsed(&status, elapsed_ms);
            emit_level(&app, &frame);
            if elapsed_samples % (TARGET_SAMPLE_RATE as u64 * 5) == 0 {
                let checkpoint = RecoverableMeetingCapture {
                    meeting_id: config.meeting_id.clone(),
                    started_at_epoch_ms: started_at,
                    elapsed_ms,
                    sample_rate: TARGET_SAMPLE_RATE,
                    audio_path: audio_path.to_string_lossy().into_owned(),
                };
                let _ = write_checkpoint(&checkpoint_path, &checkpoint);
                let _ = wav.flush_checkpoint();
            }
        }
    }

    drop(capture_streams.streams);
    let elapsed_ms = elapsed_samples * 1_000 / TARGET_SAMPLE_RATE as u64;
    if let Some(worker) = transport_tx {
        let (response, completed) = mpsc::sync_channel(1);
        if worker
            .control
            .send(TransportControl::Stop {
                duration_ms: elapsed_ms,
                response,
            })
            .is_ok()
        {
            if let Ok(Err(error)) = completed.recv_timeout(Duration::from_secs(25)) {
                push_warning(&app, &status, error);
            }
        }
    }
    let _ = wav.finalize();
    let checkpoint = RecoverableMeetingCapture {
        meeting_id: config.meeting_id,
        started_at_epoch_ms: started_at,
        elapsed_ms,
        sample_rate: TARGET_SAMPLE_RATE,
        audio_path: audio_path.to_string_lossy().into_owned(),
    };
    let _ = write_checkpoint(&checkpoint_path, &checkpoint);
    if !matches!(
        status.lock().map(|value| value.phase),
        Ok(CapturePhase::Error)
    ) {
        update_phase(&app, &status, CapturePhase::Stopped);
    }
}

fn build_capture_streams(
    config: &MeetingCaptureConfig,
    sender: mpsc::SyncSender<AudioChunk>,
    error_sender: mpsc::Sender<String>,
    paused: Arc<AtomicBool>,
) -> Result<CaptureStreams, String> {
    let host = cpal::default_host();
    let mut streams = Vec::new();
    let mut active_sources = Vec::new();
    let mut warnings = Vec::new();
    if config.capture_microphone {
        let microphone = find_capture_device(
            &host,
            config.microphone_device_id.as_deref(),
            AudioSource::Microphone,
        )
        .and_then(|device| {
            build_input_stream(
                &device,
                AudioSource::Microphone,
                sender.clone(),
                error_sender.clone(),
                paused.clone(),
            )
        });
        match microphone {
            Ok(stream) => {
                streams.push(stream);
                active_sources.push(AudioSource::Microphone);
            }
            Err(error) => warnings.push(format!(
                "Microphone capture is unavailable ({error}); continuing with system audio."
            )),
        }
    }
    if config.capture_system_audio {
        let system = (|| {
            let device = find_capture_device(
                &host,
                config.system_device_id.as_deref(),
                AudioSource::System,
            )?;
            let capture = |device: &cpal::Device| {
                let description = device.description().map_err(|error| {
                    format!("Could not describe the system-audio device: {error}")
                })?;
                if device.supports_input()
                    && !supports_native_loopback(device)
                    && !is_loopback_device(description.name())
                {
                    return Err(format!(
                        "{} is an input device, not a capturable loopback or monitor input",
                        description.name()
                    ));
                }
                build_input_stream(
                    device,
                    AudioSource::System,
                    sender.clone(),
                    error_sender.clone(),
                    paused.clone(),
                )
            };
            match capture(&device) {
                Ok(stream) => Ok(stream),
                Err(primary_error) if !device.supports_input() => {
                    let fallback = host
                        .input_devices()
                        .map_err(|error| format!("Could not enumerate fallback inputs: {error}"))?
                        .find(|candidate| {
                            candidate
                                .description()
                                .is_ok_and(|description| is_loopback_device(description.name()))
                        })
                        .ok_or(primary_error.clone())?;
                    capture(&fallback).map_err(|fallback_error| {
                        format!("{primary_error}; fallback failed: {fallback_error}")
                    })
                }
                Err(error) => Err(error),
            }
        })();
        match system {
            Ok(stream) => {
                streams.push(stream);
                active_sources.push(AudioSource::System);
            }
            Err(error) => warnings.push(format!(
                "System audio is unavailable ({error}); continuing with microphone audio."
            )),
        }
    }
    if streams.is_empty() {
        return Err(warnings.join(" "));
    }
    Ok(CaptureStreams {
        active_sources,
        streams,
        warnings,
    })
}

fn find_capture_device(
    host: &cpal::Host,
    id: Option<&str>,
    source: AudioSource,
) -> Result<cpal::Device, String> {
    let Some(id) = id else {
        return match source {
            AudioSource::Microphone => host.default_input_device(),
            AudioSource::System => host.default_output_device(),
        }
        .ok_or_else(|| "No default audio device is available".to_string());
    };
    host.devices()
        .map_err(|error| format!("Could not enumerate audio devices: {error}"))?
        .find(|device| {
            device
                .id()
                .is_ok_and(|device_id| device_id.to_string() == id)
        })
        .ok_or_else(|| "The selected audio device is no longer available".to_string())
}

fn build_input_stream(
    device: &cpal::Device,
    source: AudioSource,
    sender: mpsc::SyncSender<AudioChunk>,
    error_sender: mpsc::Sender<String>,
    paused: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    let description = device
        .description()
        .map_err(|error| format!("Could not describe the audio device: {error}"))?;
    let config = if device.supports_input() {
        device.default_input_config()
    } else {
        device.default_output_config()
    }
    .map_err(|error| format!("Could not configure {}: {error}", description.name()))?;
    let sample_rate = config.sample_rate();
    let channels = config.channels() as usize;
    let stream_config = config.clone().into();
    let error_name = description.name().to_string();
    let error_callback = move |error| {
        log::error!(target: "zilobase::meeting_capture", "Audio stream error for {error_name}: {error}");
        let _ = error_sender.send(format!(
            "The audio device {error_name} disconnected or stopped: {error}"
        ));
    };
    let callback = move |samples: Vec<f32>| {
        if paused.load(Ordering::Acquire) {
            return;
        }
        let mono = downmix_to_mono(&samples, channels);
        let _ = sender.try_send(AudioChunk {
            source: match source {
                AudioSource::Microphone => AudioSource::Microphone,
                AudioSource::System => AudioSource::System,
            },
            samples: mono,
            sample_rate,
        });
    };

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            stream_config,
            move |data: &[f32], _| callback(data.to_vec()),
            error_callback,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            stream_config,
            move |data: &[i16], _| {
                callback(
                    data.iter()
                        .map(|sample| *sample as f32 / i16::MAX as f32)
                        .collect(),
                )
            },
            error_callback,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            stream_config,
            move |data: &[u16], _| {
                callback(
                    data.iter()
                        .map(|sample| (*sample as f32 / u16::MAX as f32) * 2.0 - 1.0)
                        .collect(),
                )
            },
            error_callback,
            None,
        ),
        format => return Err(format!("Unsupported audio sample format: {format:?}")),
    }
    .map_err(|error| format!("Could not build the audio input stream: {error}"))?;
    stream
        .play()
        .map_err(|error| format!("Could not start the audio input stream: {error}"))?;
    Ok(stream)
}

fn emit_level(app: &AppHandle, frame: &[f32]) {
    let rms = (frame.iter().map(|sample| sample * sample).sum::<f32>() / frame.len() as f32).sqrt();
    let peak = frame
        .iter()
        .map(|sample| sample.abs())
        .fold(0.0_f32, f32::max);
    let _ = app.emit("meeting-capture-level", MeetingAudioLevel { rms, peak });
}

fn update_phase(app: &AppHandle, status: &Arc<Mutex<MeetingCaptureStatus>>, phase: CapturePhase) {
    if let Ok(mut current) = status.lock() {
        current.phase = phase;
        if phase == CapturePhase::Stopped {
            current.active_sources.clear();
        }
        let _ = app.emit("meeting-capture-state", current.clone());
    }
}

fn update_elapsed(status: &Arc<Mutex<MeetingCaptureStatus>>, elapsed_ms: u64) {
    if let Ok(mut current) = status.lock() {
        current.elapsed_ms = elapsed_ms;
    }
}

fn set_error(app: &AppHandle, status: &Arc<Mutex<MeetingCaptureStatus>>, error: String) {
    if let Ok(mut current) = status.lock() {
        current.phase = CapturePhase::Error;
        current.error = Some(error);
        let _ = app.emit("meeting-capture-state", current.clone());
    }
}

fn push_warning(app: &AppHandle, status: &Arc<Mutex<MeetingCaptureStatus>>, warning: String) {
    if let Ok(mut current) = status.lock() {
        current.warnings.push(warning.clone());
        let _ = app.emit(
            "meeting-capture-warning",
            serde_json::json!({
                "code": "transcription_transport_unavailable",
                "message": warning,
            }),
        );
    }
}

fn validate_config(config: &MeetingCaptureConfig) -> Result<(), String> {
    validate_meeting_id(&config.meeting_id)?;
    if !config.capture_microphone && !config.capture_system_audio {
        return Err("Enable microphone or system-audio capture".into());
    }
    if config.audio_websocket_url.is_some() != config.audio_ticket.is_some() {
        return Err("Meeting audio URL and ticket must be provided together".into());
    }
    Ok(())
}

struct MeetingAudioTransport {
    active_sources: Vec<AudioSource>,
    connected_at: Option<Instant>,
    disabled: bool,
    pending: HashMap<AudioSource, PendingMeetingAudio>,
    protocol: String,
    reconnect_attempts: u8,
    replay_frames: VecDeque<MeetingAudioPacket>,
    socket: Option<WebSocket<MaybeTlsStream<std::net::TcpStream>>>,
    url: String,
}

#[derive(Clone)]
struct MeetingAudioPacket {
    bytes: Vec<u8>,
    end_sequence: u64,
    sequence: u64,
    source: AudioSource,
}

#[derive(Default)]
struct PendingMeetingAudio {
    samples: Vec<f32>,
    sequence: Option<u64>,
}

impl MeetingAudioTransport {
    fn from_config(config: &MeetingCaptureConfig) -> Result<Option<Self>, String> {
        match (&config.audio_websocket_url, &config.audio_ticket) {
            (Some(url), Some(ticket)) => Self::from_parts(url.clone(), ticket.clone()).map(Some),
            (None, None) => Ok(None),
            _ => Err("Meeting audio URL and ticket must be provided together".into()),
        }
    }

    fn from_parts(url: String, ticket: String) -> Result<Self, String> {
        let parsed = url::Url::parse(&url)
            .map_err(|_| "The meeting audio WebSocket URL is invalid".to_string())?;
        if !matches!(parsed.scheme(), "ws" | "wss") {
            return Err("Meeting audio transport must use WebSocket".into());
        }
        Ok(Self {
            active_sources: Vec::new(),
            connected_at: None,
            disabled: false,
            pending: HashMap::new(),
            protocol: format!("zilobase.meeting-audio.v2, zilobase.meeting-audio.auth.{ticket}"),
            reconnect_attempts: 0,
            replay_frames: VecDeque::with_capacity(TRANSPORT_REPLAY_CAPACITY),
            socket: None,
            url,
        })
    }

    fn update_credentials(&mut self, url: String, ticket: String) {
        self.url = url;
        self.protocol = format!("zilobase.meeting-audio.v2, zilobase.meeting-audio.auth.{ticket}");
    }

    fn connect(&mut self) -> Result<(), String> {
        let mut request = self
            .url
            .as_str()
            .into_client_request()
            .map_err(|error| format!("Could not create meeting audio request: {error}"))?;
        request.headers_mut().insert(
            SEC_WEBSOCKET_PROTOCOL,
            HeaderValue::from_str(&self.protocol)
                .map_err(|_| "Meeting audio ticket is invalid".to_string())?,
        );
        let (socket, _) = tungstenite::connect(request)
            .map_err(|error| format!("Could not connect meeting transcription: {error}"))?;
        let mut socket = socket;
        set_transport_read_timeout(&mut socket)?;
        self.socket = Some(socket);
        self.connected_at = Some(Instant::now());
        Ok(())
    }

    fn connect_ready(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        self.connect()?;
        self.send_control(serde_json::json!({
            "sources": &self.active_sources,
            "type": "recording.configure",
        }))?;
        let events = match self.wait_for_event("meeting.ready") {
            Ok(events) => events,
            Err(error) => {
                self.socket = None;
                self.connected_at = None;
                return Err(error);
            }
        };
        self.apply_ready_watermark(&events)?;
        Ok(events)
    }

    fn send_frame(
        &mut self,
        source: AudioSource,
        sequence: u64,
        samples: &[f32],
    ) -> Result<Vec<MeetingAudioServerEvent>, String> {
        if self.disabled {
            return Ok(Vec::new());
        }
        let discontinuous = self.pending.get(&source).is_some_and(|pending| {
            pending.sequence.is_some_and(|start| {
                start.saturating_add((pending.samples.len() / FRAME_SAMPLES) as u64) != sequence
            })
        });
        let mut events = if discontinuous {
            self.flush_frame(source)?
        } else {
            Vec::new()
        };
        let pending = self.pending.entry(source).or_default();
        pending.sequence.get_or_insert(sequence);
        pending.samples.extend_from_slice(samples);
        if pending.samples.len() < TRANSPORT_BATCH_SAMPLES {
            return Ok(events);
        }
        events.extend(self.flush_frame(source)?);
        Ok(events)
    }

    fn flush_frame(&mut self, source: AudioSource) -> Result<Vec<MeetingAudioServerEvent>, String> {
        if self.disabled {
            self.pending.remove(&source);
            return Ok(Vec::new());
        }
        let pending = self.pending.remove(&source).unwrap_or_default();
        if pending.samples.is_empty() {
            return Ok(Vec::new());
        }
        let sequence = pending.sequence.unwrap_or_default();
        let samples = pending.samples;
        let mut bytes = Vec::with_capacity(9 + samples.len() * 2);
        bytes.extend_from_slice(&sequence.to_le_bytes());
        bytes.push(meeting_audio_source_code(source));
        for sample in &samples {
            let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            bytes.extend_from_slice(&pcm.to_le_bytes());
        }

        let frame_count = samples.len().div_ceil(FRAME_SAMPLES) as u64;
        let end_sequence = sequence
            .checked_add(frame_count.saturating_sub(1))
            .ok_or_else(|| "Meeting audio sequence overflowed".to_string())?;
        let packet = MeetingAudioPacket {
            bytes,
            end_sequence,
            sequence,
            source,
        };
        let mut events = Vec::new();

        for attempt in 0..2 {
            if self.reconnect_attempts >= MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS {
                self.disabled = true;
                return Err("Meeting transcription is unavailable after repeated reconnects; local recording continues".into());
            }
            if self.socket.is_none() {
                match self.connect_ready() {
                    Ok(ready_events) => events.extend(ready_events),
                    Err(error) => {
                        self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
                        if self.reconnect_attempts >= MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS {
                            self.disabled = true;
                        }
                        return Err(error);
                    }
                }
            }
            if self.connected_at.is_some_and(|connected_at| {
                connected_at.elapsed() >= TRANSCRIPTION_STABLE_CONNECTION
            }) {
                self.reconnect_attempts = 0;
            }
            let result = self
                .socket
                .as_mut()
                .expect("meeting audio socket was connected")
                .send(tungstenite::Message::Binary(packet.bytes.clone().into()));
            if result.is_ok() {
                self.remember_packet(packet);
                events.extend(self.read_server_events());
                return Ok(events);
            }
            self.socket = None;
            self.connected_at = None;
            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
            if attempt == 0 {
                thread::sleep(Duration::from_millis(100));
            }
        }
        Err("Meeting transcription disconnected; local recording continues".into())
    }

    fn flush_frames(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let mut events = Vec::new();
        for source in self.active_sources.clone() {
            events.extend(self.flush_frame(source)?);
        }
        Ok(events)
    }

    fn pause(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let mut events = self.flush_frames()?;
        if self.disabled {
            return Ok(events);
        }
        if self.socket.is_none() {
            events.extend(self.connect_ready()?);
        }
        self.send_control(serde_json::json!({ "type": "recording.pause" }))?;
        events.extend(self.wait_for_event("recording.paused")?);
        Ok(events)
    }

    fn resume(&mut self) -> Result<Vec<MeetingAudioServerEvent>, String> {
        if self.disabled {
            return Ok(Vec::new());
        }
        if self.socket.is_none() {
            return self.connect_ready();
        } else {
            self.send_control(serde_json::json!({ "type": "recording.resume" }))?;
        }
        match self.wait_for_event("meeting.ready") {
            Ok(events) => {
                self.apply_ready_watermark(&events)?;
                Ok(events)
            }
            Err(_error) if self.socket.is_none() && !self.disabled => self.connect_ready(),
            Err(error) => Err(error),
        }
    }

    fn stop(&mut self, duration_ms: u64) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let mut events = match self.flush_frames() {
            Ok(events) => events,
            Err(_error) if self.disabled => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        if self.disabled {
            return Ok(events);
        }
        if self.socket.is_none() {
            events.extend(self.connect_ready()?);
        }
        self.send_control(serde_json::json!({
            "durationMs": duration_ms,
            "type": "recording.stop",
        }))?;
        events.extend(self.wait_for_event("recording.flush.completed")?);
        Ok(events)
    }

    fn send_control(&mut self, value: serde_json::Value) -> Result<(), String> {
        let result = self
            .socket
            .as_mut()
            .ok_or_else(|| "Meeting transcription is disconnected".to_string())?
            .send(tungstenite::Message::Text(value.to_string().into()));
        if let Err(error) = result {
            self.socket = None;
            self.connected_at = None;
            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
            return Err(format!("Could not control meeting transcription: {error}"));
        }
        Ok(())
    }

    fn wait_for_event(&mut self, expected: &str) -> Result<Vec<MeetingAudioServerEvent>, String> {
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut collected = Vec::new();
        loop {
            let events = self.read_server_events();
            for event in events {
                if event.kind == "recording.error" {
                    return Err(event
                        .message
                        .unwrap_or_else(|| "Meeting transcription failed".into()));
                }
                let complete = event.kind == expected;
                collected.push(event);
                if complete {
                    return Ok(collected);
                }
            }
            if self.disabled || self.socket.is_none() {
                return Err("Meeting transcription connection closed".into());
            }
            if Instant::now() >= deadline {
                return Err(format!("Timed out waiting for {expected}"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn apply_ready_watermark(&mut self, events: &[MeetingAudioServerEvent]) -> Result<(), String> {
        let Some(next_sequences) = events
            .iter()
            .rev()
            .find(|event| event.kind == "meeting.ready")
            .and_then(|event| event.next_sequences.as_ref())
        else {
            return Ok(());
        };
        self.replay_frames = self
            .replay_frames
            .drain(..)
            .filter_map(|packet| {
                let next_sequence = next_sequences.get(&packet.source).copied().unwrap_or(0);
                trim_meeting_audio_packet(packet, next_sequence)
            })
            .collect();
        let socket = self
            .socket
            .as_mut()
            .ok_or_else(|| "Meeting transcription connection closed".to_string())?;
        for packet in &self.replay_frames {
            socket
                .send(tungstenite::Message::Binary(packet.bytes.clone().into()))
                .map_err(|error| format!("Could not replay meeting audio: {error}"))?;
        }
        Ok(())
    }

    fn remember_packet(&mut self, packet: MeetingAudioPacket) {
        self.replay_frames.push_back(packet);
        if self.replay_frames.len() > TRANSPORT_REPLAY_CAPACITY {
            self.replay_frames.pop_front();
        }
    }

    fn close(&mut self, reason: &'static str) {
        let _ = self.flush_frames();
        if let Some(mut socket) = self.socket.take() {
            let _ = socket.close(Some(CloseFrame {
                code: CloseCode::Normal,
                reason: reason.into(),
            }));
        }
    }

    fn read_server_events(&mut self) -> Vec<MeetingAudioServerEvent> {
        let mut events = Vec::new();
        let mut connection_closed = false;
        if let Some(socket) = self.socket.as_mut() {
            loop {
                match socket.read() {
                    Ok(tungstenite::Message::Text(text)) => {
                        if let Ok(event) = serde_json::from_str::<MeetingAudioServerEvent>(&text) {
                            events.push(event);
                        }
                    }
                    Ok(tungstenite::Message::Close(frame)) => {
                        if frame.is_some_and(|frame| {
                            u16::from(frame.code) == MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE
                        }) {
                            self.disabled = true;
                        } else {
                            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
                        }
                        self.socket = None;
                        self.connected_at = None;
                        break;
                    }
                    Ok(_) => {}
                    Err(tungstenite::Error::Io(error))
                        if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) =>
                    {
                        break;
                    }
                    Err(
                        tungstenite::Error::ConnectionClosed | tungstenite::Error::AlreadyClosed,
                    ) => {
                        connection_closed = true;
                        break;
                    }
                    Err(_) => {
                        connection_closed = true;
                        break;
                    }
                }
            }
        }
        if connection_closed {
            self.socket = None;
            self.connected_at = None;
            self.reconnect_attempts = self.reconnect_attempts.saturating_add(1);
        }
        if let Some(ticket) = events
            .iter()
            .rev()
            .find(|event| event.kind == "recording.ticket")
            .and_then(|event| event.token.clone())
        {
            self.update_credentials(self.url.clone(), ticket);
        }
        events
    }
}

fn trim_meeting_audio_packet(
    packet: MeetingAudioPacket,
    next_sequence: u64,
) -> Option<MeetingAudioPacket> {
    if packet.end_sequence < next_sequence {
        return None;
    }
    if packet.sequence >= next_sequence {
        return Some(packet);
    }
    let skipped_frames = usize::try_from(next_sequence - packet.sequence).ok()?;
    let skipped_bytes = skipped_frames.checked_mul(FRAME_SAMPLES * 2)?;
    let pcm = packet.bytes.get(9 + skipped_bytes..)?;
    if pcm.is_empty() {
        return None;
    }
    let mut bytes = Vec::with_capacity(9 + pcm.len());
    bytes.extend_from_slice(&next_sequence.to_le_bytes());
    bytes.push(meeting_audio_source_code(packet.source));
    bytes.extend_from_slice(pcm);
    Some(MeetingAudioPacket {
        bytes,
        end_sequence: packet.end_sequence,
        sequence: next_sequence,
        source: packet.source,
    })
}

fn meeting_audio_source_code(source: AudioSource) -> u8 {
    match source {
        AudioSource::Microphone => 0,
        AudioSource::System => 1,
    }
}

fn spawn_transport_worker(
    app: AppHandle,
    meeting_id: String,
    mut transport: MeetingAudioTransport,
) -> TransportWorker {
    let (commands, receiver) = mpsc::sync_channel(TRANSPORT_CHANNEL_CAPACITY);
    let (control, control_receiver) = mpsc::channel();
    let _ = thread::Builder::new()
        .name("meeting-audio-transport".into())
        .spawn(move || {
            let mut paused = false;
            let mut stopping = false;
            loop {
                while let Ok(message) = control_receiver.try_recv() {
                    if matches!(
                        &message,
                        TransportControl::Pause { .. } | TransportControl::Stop { .. }
                    ) {
                        drain_transport_frames(&app, &meeting_id, &mut transport, &receiver);
                    }
                    apply_transport_control(
                        &app,
                        &meeting_id,
                        &mut transport,
                        &mut paused,
                        &mut stopping,
                        message,
                    );
                }
                if stopping {
                    break;
                }
                if paused {
                    match control_receiver.recv_timeout(Duration::from_millis(100)) {
                        Ok(message) => {
                            if matches!(&message, TransportControl::Stop { .. }) {
                                drain_transport_frames(
                                    &app,
                                    &meeting_id,
                                    &mut transport,
                                    &receiver,
                                );
                            }
                            apply_transport_control(
                                &app,
                                &meeting_id,
                                &mut transport,
                                &mut paused,
                                &mut stopping,
                                message,
                            );
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    continue;
                }
                let command = match receiver.recv_timeout(Duration::from_millis(100)) {
                    Ok(command) => command,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                match command {
                    TransportCommand::Frame {
                        samples,
                        sequence,
                        source,
                    } => {
                        if let Ok(events) = transport.send_frame(source, sequence, &samples) {
                            emit_transport_events(&app, &meeting_id, events);
                        }
                    }
                }
            }
            transport.close("Meeting stopped");
        });
    TransportWorker { commands, control }
}

fn set_transport_read_timeout(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) -> Result<(), String> {
    let timeout = Some(Duration::from_millis(1));
    match socket.get_mut() {
        MaybeTlsStream::Plain(stream) => stream.set_read_timeout(timeout),
        MaybeTlsStream::Rustls(stream) => stream.sock.set_read_timeout(timeout),
        _ => Ok(()),
    }
    .map_err(|error| format!("Could not configure meeting transcription: {error}"))
}

fn apply_transport_control(
    app: &AppHandle,
    meeting_id: &str,
    transport: &mut MeetingAudioTransport,
    paused: &mut bool,
    stopping: &mut bool,
    control: TransportControl,
) {
    match control {
        TransportControl::Pause { response } => {
            let result = transport.pause();
            if let Ok(events) = &result {
                *paused = true;
                emit_transport_events(app, meeting_id, events.clone());
            }
            let _ = response.send(result.map(|_| ()));
        }
        TransportControl::Resume { response } => {
            let result = transport.resume();
            if let Ok(events) = &result {
                *paused = false;
                emit_transport_events(app, meeting_id, events.clone());
            }
            let _ = response.send(result.map(|_| ()));
        }
        TransportControl::RefreshCredentials { ticket, url } => {
            transport.update_credentials(url, ticket);
        }
        TransportControl::Stop {
            duration_ms,
            response,
        } => {
            let result = transport.stop(duration_ms);
            if let Ok(events) = &result {
                emit_transport_events(app, meeting_id, events.clone());
            }
            *stopping = true;
            let _ = response.send(result.map(|_| ()));
        }
    }
}

fn emit_transport_events(app: &AppHandle, meeting_id: &str, events: Vec<MeetingAudioServerEvent>) {
    for event in events {
        if event.kind != "transcript.delta" {
            continue;
        }
        let Some(item_id) = event.item_id else {
            continue;
        };
        let Some(source) = event.source else { continue };
        let Some(start_ms) = event.start_ms else {
            continue;
        };
        let Some(text) = event.text else { continue };
        let Some(updated_at) = event.updated_at else {
            continue;
        };
        let _ = app.emit(
            "meeting-capture-transcript",
            MeetingTranscriptDraft {
                item_id,
                meeting_id: meeting_id.to_string(),
                source,
                start_ms,
                text,
                updated_at,
            },
        );
    }
}

fn drain_transport_frames(
    app: &AppHandle,
    meeting_id: &str,
    transport: &mut MeetingAudioTransport,
    receiver: &mpsc::Receiver<TransportCommand>,
) {
    while let Ok(TransportCommand::Frame {
        samples,
        sequence,
        source,
    }) = receiver.try_recv()
    {
        if let Ok(events) = transport.send_frame(source, sequence, &samples) {
            emit_transport_events(app, meeting_id, events);
        }
    }
}

fn supports_native_loopback(device: &cpal::Device) -> bool {
    #[cfg(target_os = "macos")]
    {
        device.supports_output() && !device.supports_input()
    }
    #[cfg(windows)]
    {
        device.supports_output()
    }
    #[cfg(target_os = "linux")]
    {
        device
            .id()
            .is_ok_and(|id| id.host() == cpal::HostId::PipeWire)
            && device.supports_output()
    }
    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = device;
        false
    }
}

fn is_loopback_device(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    [
        "loopback",
        "monitor",
        "blackhole",
        "stereo mix",
        "what u hear",
        "vb-audio",
    ]
    .iter()
    .any(|marker| name.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::{
        is_loopback_device, meeting_audio_source_code, trim_meeting_audio_packet, AudioSource,
        MeetingAudioPacket, MeetingAudioServerEvent, MeetingAudioTransport, FRAME_SAMPLES,
    };

    #[test]
    fn detects_common_system_audio_inputs() {
        assert!(is_loopback_device("BlackHole 2ch"));
        assert!(is_loopback_device("Monitor of Built-in Audio"));
        assert!(!is_loopback_device("MacBook Pro Speakers"));
    }

    #[test]
    fn transport_accepts_rotated_ticket_credentials() {
        let mut transport = MeetingAudioTransport::from_parts(
            "ws://localhost/meeting-audio".into(),
            "first".into(),
        )
        .unwrap();
        let event: MeetingAudioServerEvent =
            serde_json::from_str(r#"{"type":"recording.ticket","token":"second"}"#).unwrap();
        transport.update_credentials(
            "ws://localhost/meeting-audio?meeting=two".into(),
            event.token.unwrap(),
        );
        assert_eq!(transport.url, "ws://localhost/meeting-audio?meeting=two");
        assert!(transport.protocol.ends_with("auth.second"));
    }

    #[test]
    fn transport_replay_keeps_the_unacknowledged_tail_of_a_batch() {
        let mut bytes = Vec::from(20_u64.to_le_bytes());
        bytes.push(meeting_audio_source_code(AudioSource::Microphone));
        bytes.extend(std::iter::repeat(1_u8).take(FRAME_SAMPLES * 2 * 5));
        let packet = MeetingAudioPacket {
            bytes,
            end_sequence: 24,
            sequence: 20,
            source: AudioSource::Microphone,
        };

        let trimmed = trim_meeting_audio_packet(packet, 22).unwrap();
        assert_eq!(trimmed.sequence, 22);
        assert_eq!(trimmed.end_sequence, 24);
        assert_eq!(trimmed.bytes.len(), 9 + FRAME_SAMPLES * 2 * 3);
    }
}
