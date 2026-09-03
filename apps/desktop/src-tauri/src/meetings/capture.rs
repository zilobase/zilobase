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

mod devices;
mod transport;

use devices::*;
use transport::*;

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
            if elapsed_samples.is_multiple_of(TARGET_SAMPLE_RATE as u64 * 5) {
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
        bytes.extend(std::iter::repeat_n(1_u8, FRAME_SAMPLES * 2 * 5));
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
