use super::*;

pub(super) fn build_capture_streams(
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

pub(super) fn find_capture_device(
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

pub(super) fn build_input_stream(
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
    let stream_config = config.into();
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

pub(super) fn supports_native_loopback(device: &cpal::Device) -> bool {
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

pub(super) fn is_loopback_device(name: &str) -> bool {
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
