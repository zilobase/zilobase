// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const AUTH_SERVICE: &str = "com.zilobase";
const AUTH_ACCOUNT: &str = "session";
const AUTH_OWNER_ACCOUNT: &str = "session-owner";

#[cfg(all(desktop, debug_assertions))]
fn start_development_auth_callback(app: tauri::AppHandle) -> std::io::Result<()> {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    use tauri::{Emitter, Manager};

    let listener = TcpListener::bind("127.0.0.1:1422")?;

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut request = [0; 8192];
            let Ok(size) = stream.read(&mut request) else {
                continue;
            };
            let request = String::from_utf8_lossy(&request[..size]);
            let target = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1));

            if let Some(query) = target.and_then(|target| target.strip_prefix("/auth?")) {
                let _ = app.emit(
                    "deep-link://new-url",
                    vec![format!("zilobase://auth?{query}")],
                );

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            let body = "<!doctype html><title>Zilobase</title><p>You can close this tab and return to Zilobase.</p>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    Ok(())
}

#[tauri::command]
fn get_auth_token() -> Result<Option<String>, String> {
    let entry =
        keyring::Entry::new(AUTH_SERVICE, AUTH_ACCOUNT).map_err(|error| error.to_string())?;

    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_auth_token(token: Option<String>) -> Result<(), String> {
    let entry =
        keyring::Entry::new(AUTH_SERVICE, AUTH_ACCOUNT).map_err(|error| error.to_string())?;

    match token {
        Some(token) => entry.set_password(&token),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        },
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_auth_owner() -> Result<Option<String>, String> {
    let entry =
        keyring::Entry::new(AUTH_SERVICE, AUTH_OWNER_ACCOUNT).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(owner) => Ok(Some(owner)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_auth_owner(owner: Option<String>) -> Result<(), String> {
    let entry =
        keyring::Entry::new(AUTH_SERVICE, AUTH_OWNER_ACCOUNT).map_err(|error| error.to_string())?;
    match owner {
        Some(owner) => entry.set_password(&owner),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        },
    }
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = {
        use tauri::Manager;

        builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
    };

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;

                if let Some(window) = app.get_webview_window("main") {
                    window.set_decorations(false)?;
                }
            }

            #[cfg(all(desktop, debug_assertions))]
            start_development_auth_callback(app.handle().clone())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_auth_token,
            set_auth_token,
            get_auth_owner,
            set_auth_owner
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
