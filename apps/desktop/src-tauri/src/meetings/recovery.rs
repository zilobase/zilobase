use std::{
    fs::{self, File},
    io::{BufWriter, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use super::capture::{RecoverableMeetingCapture, TARGET_SAMPLE_RATE};

const CAPTURE_DIRECTORY: &str = "meeting-recordings";

#[tauri::command]
pub(crate) fn meeting_capture_recoverable_sessions(
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
pub(crate) fn meeting_capture_delete_local_file(
    app: AppHandle,
    meeting_id: String,
) -> Result<(), String> {
    validate_meeting_id(&meeting_id)?;
    let directory = capture_base_directory(&app)?.join(meeting_id);
    if directory.exists() {
        fs::remove_dir_all(directory)
            .map_err(|error| format!("Could not delete the local meeting audio: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn meeting_capture_open_local_file(
    app: AppHandle,
    meeting_id: String,
) -> Result<(), String> {
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

pub(super) fn validate_meeting_id(meeting_id: &str) -> Result<(), String> {
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

pub(super) fn capture_base_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join(CAPTURE_DIRECTORY))
        .map_err(|error| format!("Could not locate application storage: {error}"))
}

pub(super) fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub(super) fn write_checkpoint(
    path: &Path,
    checkpoint: &RecoverableMeetingCapture,
) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(checkpoint)
        .map_err(|error| format!("Could not serialize meeting checkpoint: {error}"))?;
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write meeting checkpoint: {error}"))?;
    fs::rename(temporary, path)
        .map_err(|error| format!("Could not commit meeting checkpoint: {error}"))
}

pub(super) struct CheckpointWav {
    channels: u16,
    writer: BufWriter<File>,
    samples_written: u32,
}

impl CheckpointWav {
    pub(super) fn create(path: &Path, stereo: bool) -> Result<Self, String> {
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

    pub(super) fn write_sources(
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

    pub(super) fn flush_checkpoint(&mut self) -> Result<(), String> {
        self.update_lengths()?;
        self.writer
            .flush()
            .map_err(|error| format!("Could not flush meeting audio: {error}"))
    }

    pub(super) fn finalize(mut self) -> Result<(), String> {
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
    use super::validate_meeting_id;

    #[test]
    fn rejects_path_traversal_meeting_ids() {
        assert!(validate_meeting_id("meeting-123").is_ok());
        assert!(validate_meeting_id("../meeting").is_err());
    }
}
