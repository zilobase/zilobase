//! Native meeting audio capture.
//!
//! The stream/conversion pipeline adapts the small, active parts of Meetily's
//! CPAL capture design. Audio never enters the webview: callbacks feed a bounded
//! native channel, frames are mixed/resampled here, and a WAV checkpoint is kept
//! for crash recovery and the native transcription transport.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs::{self, File},
    io::{BufWriter, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tungstenite::{
    client::IntoClientRequest,
    http::{header::SEC_WEBSOCKET_PROTOCOL, HeaderValue},
    stream::MaybeTlsStream,
    WebSocket,
};

const TARGET_SAMPLE_RATE: u32 = 24_000;
const FRAME_SAMPLES: usize = 480;
const MAX_CAPTURE_MS: u64 = 3 * 60 * 60 * 1_000;
const AUDIO_CHANNEL_CAPACITY: usize = 128;
const TRANSPORT_CHANNEL_CAPACITY: usize = 1_500;
const CAPTURE_DIRECTORY: &str = "meeting-recordings";

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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverableMeetingCapture {
    meeting_id: String,
    started_at_epoch_ms: u64,
    elapsed_ms: u64,
    sample_rate: u32,
    audio_path: String,
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
    Pause,
    Resume,
    RefreshTransport { ticket: String, url: String },
    Stop,
}

enum TransportCommand {
    Frame { samples: Vec<f32>, sequence: u64 },
}

struct TransportWorker {
    commands: mpsc::SyncSender<TransportCommand>,
    refresh: mpsc::Sender<(String, String)>,
    stop: mpsc::Sender<()>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
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
    control_capture(&manager, CaptureControl::Pause)
}

#[tauri::command]
pub fn meeting_capture_resume(
    manager: State<'_, MeetingCaptureManager>,
) -> Result<MeetingCaptureStatus, String> {
    control_capture(&manager, CaptureControl::Resume)
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

#[tauri::command]
pub fn meeting_capture_recoverable_sessions(
    app: AppHandle,
) -> Result<Vec<RecoverableMeetingCapture>, String> {
    let base = capture_base_directory(&app)?;
    if !base.exists() {
        return Ok(Vec::new());
    }
    let mut sessions = Vec::new();
    for entry in fs::read_dir(&base)
        .map_err(|error| format!("Could not inspect meeting checkpoints: {error}"))?
        .flatten()
    {
        let checkpoint = entry.path().join("checkpoint.json");
        let Ok(bytes) = fs::read(checkpoint) else {
            continue;
        };
        if let Ok(session) = serde_json::from_slice::<RecoverableMeetingCapture>(&bytes) {
            if Path::new(&session.audio_path).exists() {
                sessions.push(session);
            }
        }
    }
    sessions.sort_by_key(|session| std::cmp::Reverse(session.started_at_epoch_ms));
    Ok(sessions)
}

#[tauri::command]
pub fn meeting_capture_delete_local_file(app: AppHandle, meeting_id: String) -> Result<(), String> {
    validate_meeting_id(&meeting_id)?;
    let directory = capture_base_directory(&app)?.join(meeting_id);
    if directory.exists() {
        fs::remove_dir_all(directory)
            .map_err(|error| format!("Could not delete the local meeting audio: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn meeting_capture_open_local_file(app: AppHandle, meeting_id: String) -> Result<(), String> {
    validate_meeting_id(&meeting_id)?;
    let audio_path = capture_base_directory(&app)?
        .join(meeting_id)
        .join("meeting-audio.wav");
    if !audio_path.exists() {
        return Err("No local audio checkpoint exists for this meeting".into());
    }
    app.opener()
        .open_path(audio_path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| format!("Could not open the local meeting audio: {error}"))
}

fn control_capture(
    manager: &State<'_, MeetingCaptureManager>,
    control: CaptureControl,
) -> Result<MeetingCaptureStatus, String> {
    let session_guard = manager
        .session
        .lock()
        .map_err(|_| "Meeting capture state is unavailable".to_string())?;
    let session = session_guard
        .as_ref()
        .ok_or_else(|| "No meeting capture is active".to_string())?;
    session
        .control
        .send(control)
        .map_err(|_| "The meeting capture worker has stopped".to_string())?;
    // The worker owns the authoritative transition; allow it one scheduling turn.
    thread::sleep(Duration::from_millis(5));
    session
        .status
        .lock()
        .map_err(|_| "Meeting capture status is unavailable".to_string())
        .map(|status| status.clone())
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
    let transport_tx = transport.map(spawn_transport_worker);
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
                CaptureControl::Pause => {
                    paused.store(true, Ordering::Release);
                    update_phase(&app, &status, CapturePhase::Paused);
                }
                CaptureControl::Resume => {
                    paused.store(false, Ordering::Release);
                    next_mix_at = Instant::now() + Duration::from_millis(100);
                    update_phase(&app, &status, CapturePhase::Recording);
                }
                CaptureControl::RefreshTransport { ticket, url } => {
                    if let Some(worker) = transport_tx.as_ref() {
                        let _ = worker.refresh.send((url, ticket));
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
                if let Err(error) = worker.commands.try_send(TransportCommand::Frame {
                    samples: frame.clone(),
                    sequence,
                }) {
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
    if let Some(worker) = transport_tx {
        let _ = worker.stop.send(());
    }
    let _ = wav.finalize();
    let elapsed_ms = elapsed_samples * 1_000 / TARGET_SAMPLE_RATE as u64;
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

fn downmix_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    samples
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

#[cfg(test)]
fn resample_linear(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let target_len = (samples.len() as f64 / ratio).floor() as usize;
    (0..target_len)
        .map(|index| {
            let position = index as f64 * ratio;
            let lower = position.floor() as usize;
            let upper = (lower + 1).min(samples.len() - 1);
            let fraction = (position - lower as f64) as f32;
            samples[lower] + (samples[upper] - samples[lower]) * fraction
        })
        .collect()
}

#[derive(Default)]
struct StreamingLinearResampler {
    from_rate: u32,
    input: VecDeque<f32>,
    position: f64,
}

impl StreamingLinearResampler {
    fn process(&mut self, samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
        if from_rate == to_rate {
            return samples.to_vec();
        }
        if self.from_rate != from_rate {
            self.from_rate = from_rate;
            self.input.clear();
            self.position = 0.0;
        }
        self.input.extend(samples.iter().copied());
        let ratio = from_rate as f64 / to_rate as f64;
        let mut output = Vec::new();
        while self.position + 1.0 < self.input.len() as f64 {
            let lower = self.position.floor() as usize;
            let upper = lower + 1;
            let fraction = (self.position - lower as f64) as f32;
            let left = self.input.get(lower).copied().unwrap_or_default();
            let right = self.input.get(upper).copied().unwrap_or(left);
            output.push(left + (right - left) * fraction);
            self.position += ratio;
        }
        let consumed = self.position.floor() as usize;
        self.input.drain(..consumed.min(self.input.len()));
        self.position -= consumed as f64;
        output
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
    protocol: String,
    socket: Option<WebSocket<MaybeTlsStream<std::net::TcpStream>>>,
    url: String,
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
            protocol: format!("zilobase.meeting-audio.v1, zilobase.meeting-audio.auth.{ticket}"),
            socket: None,
            url,
        })
    }

    fn update_credentials(&mut self, url: String, ticket: String) {
        self.url = url;
        self.protocol = format!("zilobase.meeting-audio.v1, zilobase.meeting-audio.auth.{ticket}");
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
        self.socket = Some(socket);
        Ok(())
    }

    fn send_frame(&mut self, sequence: u64, samples: &[f32]) -> Result<(), String> {
        let mut bytes = Vec::with_capacity(8 + samples.len() * 2);
        bytes.extend_from_slice(&sequence.to_le_bytes());
        for sample in samples {
            let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            bytes.extend_from_slice(&pcm.to_le_bytes());
        }

        for attempt in 0..2 {
            if self.socket.is_none() {
                self.connect()?;
            }
            let result = self
                .socket
                .as_mut()
                .expect("meeting audio socket was connected")
                .send(tungstenite::Message::Binary(bytes.clone().into()));
            if result.is_ok() {
                return Ok(());
            }
            self.socket = None;
            if attempt == 0 {
                thread::sleep(Duration::from_millis(100));
            }
        }
        Err("Meeting transcription disconnected; local recording continues".into())
    }

    fn close(&mut self) {
        if let Some(mut socket) = self.socket.take() {
            let _ = socket.close(None);
        }
    }
}

fn spawn_transport_worker(mut transport: MeetingAudioTransport) -> TransportWorker {
    let (commands, receiver) = mpsc::sync_channel(TRANSPORT_CHANNEL_CAPACITY);
    let (refresh, refresh_receiver) = mpsc::channel();
    let (stop, stop_receiver) = mpsc::channel();
    let _ = thread::Builder::new()
        .name("meeting-audio-transport".into())
        .spawn(move || {
            loop {
                match stop_receiver.try_recv() {
                    Ok(()) | Err(mpsc::TryRecvError::Disconnected) => break,
                    Err(mpsc::TryRecvError::Empty) => {}
                }
                while let Ok((url, ticket)) = refresh_receiver.try_recv() {
                    transport.update_credentials(url, ticket);
                }
                let command = match receiver.recv_timeout(Duration::from_millis(100)) {
                    Ok(command) => command,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                match command {
                    TransportCommand::Frame { samples, sequence } => {
                        let _ = transport.send_frame(sequence, &samples);
                    }
                }
            }
            transport.close();
        });
    TransportWorker {
        commands,
        refresh,
        stop,
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

fn validate_meeting_id(meeting_id: &str) -> Result<(), String> {
    if meeting_id.is_empty()
        || meeting_id.len() > 128
        || !meeting_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Invalid meeting identifier".into());
    }
    Ok(())
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

fn capture_base_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join(CAPTURE_DIRECTORY))
        .map_err(|error| format!("Could not locate application storage: {error}"))
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn write_checkpoint(path: &Path, checkpoint: &RecoverableMeetingCapture) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(checkpoint)
        .map_err(|error| format!("Could not serialize meeting checkpoint: {error}"))?;
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write meeting checkpoint: {error}"))?;
    fs::rename(temporary, path)
        .map_err(|error| format!("Could not commit meeting checkpoint: {error}"))
}

struct CheckpointWav {
    channels: u16,
    writer: BufWriter<File>,
    samples_written: u32,
}

impl CheckpointWav {
    fn create(path: &Path, stereo: bool) -> Result<Self, String> {
        let file = File::create(path)
            .map_err(|error| format!("Could not create the meeting audio file: {error}"))?;
        let mut result = Self {
            channels: if stereo { 2 } else { 1 },
            writer: BufWriter::new(file),
            samples_written: 0,
        };
        result.write_header()?;
        Ok(result)
    }

    fn write_sources(
        &mut self,
        microphone: &[f32],
        system: &[f32],
        microphone_active: bool,
        system_active: bool,
    ) -> Result<(), String> {
        for index in 0..microphone.len().max(system.len()) {
            if self.channels == 2 {
                self.write_sample(*microphone.get(index).unwrap_or(&0.0))?;
                self.write_sample(*system.get(index).unwrap_or(&0.0))?;
            } else if microphone_active {
                self.write_sample(*microphone.get(index).unwrap_or(&0.0))?;
            } else if system_active {
                self.write_sample(*system.get(index).unwrap_or(&0.0))?;
            }
        }
        let frames = microphone.len().max(system.len()) as u32;
        self.samples_written = self
            .samples_written
            .saturating_add(frames.saturating_mul(self.channels as u32));
        Ok(())
    }

    fn write_sample(&mut self, sample: f32) -> Result<(), String> {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        self.writer
            .write_all(&pcm.to_le_bytes())
            .map_err(|error| format!("Could not checkpoint meeting audio: {error}"))
    }

    fn flush_checkpoint(&mut self) -> Result<(), String> {
        self.update_lengths()?;
        self.writer
            .flush()
            .map_err(|error| format!("Could not flush meeting audio: {error}"))
    }

    fn finalize(mut self) -> Result<(), String> {
        self.flush_checkpoint()
    }

    fn write_header(&mut self) -> Result<(), String> {
        self.writer
            .write_all(b"RIFF\0\0\0\0WAVEfmt \x10\0\0\0\x01\0")
            .and_then(|_| self.writer.write_all(&self.channels.to_le_bytes()))
            .and_then(|_| self.writer.write_all(&TARGET_SAMPLE_RATE.to_le_bytes()))
            .and_then(|_| {
                self.writer
                    .write_all(&(TARGET_SAMPLE_RATE * self.channels as u32 * 2).to_le_bytes())
            })
            .and_then(|_| self.writer.write_all(&(self.channels * 2).to_le_bytes()))
            .and_then(|_| self.writer.write_all(&16_u16.to_le_bytes()))
            .and_then(|_| self.writer.write_all(b"data\0\0\0\0"))
            .map_err(|error| format!("Could not initialize the meeting WAV file: {error}"))
    }

    fn update_lengths(&mut self) -> Result<(), String> {
        let data_bytes = self.samples_written.saturating_mul(2);
        self.writer
            .seek(SeekFrom::Start(4))
            .and_then(|_| {
                self.writer
                    .write_all(&(36_u32.saturating_add(data_bytes)).to_le_bytes())
            })
            .and_then(|_| self.writer.seek(SeekFrom::Start(40)))
            .and_then(|_| self.writer.write_all(&data_bytes.to_le_bytes()))
            .and_then(|_| self.writer.seek(SeekFrom::End(0)))
            .map(|_| ())
            .map_err(|error| format!("Could not update the meeting WAV header: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        downmix_to_mono, is_loopback_device, resample_linear, validate_meeting_id,
        StreamingLinearResampler,
    };

    #[test]
    fn downmixes_interleaved_stereo_frames() {
        assert_eq!(downmix_to_mono(&[1.0, -1.0, 0.5, 0.5], 2), vec![0.0, 0.5]);
    }

    #[test]
    fn resamples_to_the_transcription_rate() {
        let source = vec![0.25; 480];
        let result = resample_linear(&source, 48_000, 24_000);
        assert_eq!(result.len(), 240);
        assert!(result.iter().all(|sample| *sample == 0.25));
    }

    #[test]
    fn streaming_resampling_preserves_fractional_state_between_chunks() {
        let mut resampler = StreamingLinearResampler::default();
        let first = resampler.process(&vec![0.25; 241], 48_000, 24_000);
        let second = resampler.process(&vec![0.25; 239], 48_000, 24_000);
        assert_eq!(first.len() + second.len(), 240);
        assert!(first.iter().chain(&second).all(|sample| *sample == 0.25));
    }

    #[test]
    fn detects_common_system_audio_inputs() {
        assert!(is_loopback_device("BlackHole 2ch"));
        assert!(is_loopback_device("Monitor of Built-in Audio"));
        assert!(!is_loopback_device("MacBook Pro Speakers"));
    }

    #[test]
    fn rejects_path_traversal_meeting_ids() {
        assert!(validate_meeting_id("meeting-123").is_ok());
        assert!(validate_meeting_id("../meeting").is_err());
    }
}
