use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};

mod meetings;
use meetings::{capture, recovery, AppHandle, State};

fn main() {
    let mut args = std::env::args().skip(1);
    let operation = args.next();
    if operation.as_deref() == Some("--capture-service") {
        let Some(directory) = args.next() else {
            std::process::exit(64)
        };
        if args.next().is_some() {
            std::process::exit(64)
        }
        run_capture_service(PathBuf::from(directory));
        return;
    }
    std::process::exit(64);
}

fn run_capture_service(local_data_directory: PathBuf) {
    let output = Arc::new(Mutex::new(io::stdout()));
    let app = AppHandle::new(local_data_directory, output.clone());
    let manager = capture::MeetingCaptureManager::default();
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(command) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let id = command
            .get("id")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let result = run_capture_command(&app, &manager, &command);
        let response = match result {
            Ok(value) => json!({ "id": id, "ok": true, "value": value }),
            Err(message) => json!({ "id": id, "ok": false, "error": message }),
        };
        let Ok(mut writer) = output.lock() else { break };
        if writeln!(writer, "{response}")
            .and_then(|_| writer.flush())
            .is_err()
        {
            break;
        }
    }
    let _ = capture::meeting_capture_stop(State::new(&manager));
}

fn run_capture_command(
    app: &AppHandle,
    manager: &capture::MeetingCaptureManager,
    command: &Value,
) -> Result<Value, String> {
    let payload = command.get("payload").cloned().unwrap_or(Value::Null);
    match command
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "list-devices" => serde_json::to_value(capture::meeting_capture_list_devices()?)
            .map_err(|_| "Could not serialize audio devices".to_string()),
        "permissions" => serde_json::to_value(capture::meeting_capture_permissions())
            .map_err(|_| "Could not serialize audio permissions".to_string()),
        "start" => {
            let config = serde_json::from_value(payload)
                .map_err(|_| "Invalid meeting capture configuration".to_string())?;
            serde_json::to_value(capture::meeting_capture_start(
                app.clone(),
                State::new(manager),
                config,
            )?)
            .map_err(|_| "Could not serialize capture state".to_string())
        }
        "pause" => serde_json::to_value(capture::meeting_capture_pause(State::new(manager))?)
            .map_err(|_| "Could not serialize capture state".to_string()),
        "resume" => serde_json::to_value(capture::meeting_capture_resume(State::new(manager))?)
            .map_err(|_| "Could not serialize capture state".to_string()),
        "stop" => serde_json::to_value(capture::meeting_capture_stop(State::new(manager))?)
            .map_err(|_| "Could not serialize capture state".to_string()),
        "state" => serde_json::to_value(capture::meeting_capture_state(State::new(manager))?)
            .map_err(|_| "Could not serialize capture state".to_string()),
        "refresh-transport" => {
            let url = payload
                .get("audioWebsocketUrl")
                .and_then(Value::as_str)
                .ok_or_else(|| "Missing meeting audio URL".to_string())?;
            let ticket = payload
                .get("audioTicket")
                .and_then(Value::as_str)
                .ok_or_else(|| "Missing meeting audio ticket".to_string())?;
            capture::meeting_capture_refresh_transport(
                State::new(manager),
                url.to_string(),
                ticket.to_string(),
            )?;
            Ok(Value::Null)
        }
        "recoverable" => {
            serde_json::to_value(recovery::meeting_capture_recoverable_sessions(app.clone())?)
                .map_err(|_| "Could not serialize meeting recordings".to_string())
        }
        "delete-local" => {
            let meeting_id = payload
                .get("meetingId")
                .and_then(Value::as_str)
                .ok_or_else(|| "Missing meeting identifier".to_string())?;
            recovery::meeting_capture_delete_local_file(app.clone(), meeting_id.to_string())?;
            Ok(Value::Null)
        }
        "open-local" => {
            let meeting_id = payload
                .get("meetingId")
                .and_then(Value::as_str)
                .ok_or_else(|| "Missing meeting identifier".to_string())?;
            Ok(Value::String(recovery::meeting_capture_open_local_file(
                app.clone(),
                meeting_id.to_string(),
            )?))
        }
        _ => Err("Unknown capture command".to_string()),
    }
}
