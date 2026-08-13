mod diagnostics;

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const AUTH_SERVICE: &str = "com.zilobase";
const AUTH_ACCOUNT: &str = "session";
const AUTH_OWNER_ACCOUNT: &str = "session-owner";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Default)]
struct StartupState {
    renderer_ready: Arc<AtomicBool>,
}

#[cfg(all(desktop, any(not(debug_assertions), test)))]
fn describe_deep_link(value: &str) -> Option<&'static str> {
    let target = value.strip_prefix("zilobase://")?.split('?').next()?;
    (!target.is_empty()).then_some(match target {
        "auth" => "auth",
        "open" => "open",
        _ => "other",
    })
}

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
    get_keyring_value(AUTH_ACCOUNT, "session_token")
}

#[tauri::command]
fn set_auth_token(token: Option<String>) -> Result<(), String> {
    set_keyring_value(AUTH_ACCOUNT, "session_token", token)
}

#[tauri::command]
fn get_auth_owner() -> Result<Option<String>, String> {
    get_keyring_value(AUTH_OWNER_ACCOUNT, "session_owner")
}

#[tauri::command]
fn set_auth_owner(owner: Option<String>) -> Result<(), String> {
    set_keyring_value(AUTH_OWNER_ACCOUNT, "session_owner", owner)
}

#[tauri::command]
fn mark_renderer_ready(state: tauri::State<'_, StartupState>, elapsed_ms: u64) {
    state.renderer_ready.store(true, Ordering::Relaxed);
    log::info!(
        target: "zilobase::startup",
        "[diagnostics] event=renderer.app_ready status=success elapsed_ms={elapsed_ms}"
    );
}

fn get_keyring_value(account: &str, value_kind: &str) -> Result<Option<String>, String> {
    let started_at = Instant::now();
    log::info!(
        target: "zilobase::keyring",
        "[diagnostics] event=keyring.read status=started value_kind={value_kind}"
    );

    let entry = match keyring::Entry::new(AUTH_SERVICE, account) {
        Ok(entry) => entry,
        Err(error) => {
            log_keyring_failure("read", value_kind, "entry_creation", &error, started_at);
            return Err(error.to_string());
        }
    };

    match entry.get_password() {
        Ok(value) => {
            log::info!(
                target: "zilobase::keyring",
                "[diagnostics] event=keyring.read status=success value_kind={value_kind} value_present=true duration_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(Some(value))
        }
        Err(keyring::Error::NoEntry) => {
            log::info!(
                target: "zilobase::keyring",
                "[diagnostics] event=keyring.read status=success value_kind={value_kind} value_present=false duration_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(None)
        }
        Err(error) => {
            log_keyring_failure("read", value_kind, "credential_access", &error, started_at);
            Err(error.to_string())
        }
    }
}

fn set_keyring_value(
    account: &str,
    value_kind: &str,
    value: Option<String>,
) -> Result<(), String> {
    let started_at = Instant::now();
    let operation = if value.is_some() { "write" } else { "delete" };
    log::info!(
        target: "zilobase::keyring",
        "[diagnostics] event=keyring.{operation} status=started value_kind={value_kind}"
    );

    let entry = match keyring::Entry::new(AUTH_SERVICE, account) {
        Ok(entry) => entry,
        Err(error) => {
            log_keyring_failure(operation, value_kind, "entry_creation", &error, started_at);
            return Err(error.to_string());
        }
    };
    let result = match value {
        Some(value) => entry.set_password(&value),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        },
    };

    match result {
        Ok(()) => {
            log::info!(
                target: "zilobase::keyring",
                "[diagnostics] event=keyring.{operation} status=success value_kind={value_kind} duration_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(())
        }
        Err(error) => {
            log_keyring_failure(operation, value_kind, "credential_access", &error, started_at);
            Err(error.to_string())
        }
    }
}

fn log_keyring_failure(
    operation: &str,
    value_kind: &str,
    stage: &str,
    error: &keyring::Error,
    started_at: Instant,
) {
    log::error!(
        target: "zilobase::keyring",
        "[diagnostics] event=keyring.{operation} status=error value_kind={value_kind} stage={stage} error_type={} duration_ms={}",
        keyring_error_kind(error),
        started_at.elapsed().as_millis()
    );
}

fn keyring_error_kind(error: &keyring::Error) -> &'static str {
    match error {
        keyring::Error::PlatformFailure(_) => "platform_failure",
        keyring::Error::NoStorageAccess(_) => "no_storage_access",
        keyring::Error::NoEntry => "no_entry",
        keyring::Error::BadEncoding(_) => "bad_encoding",
        keyring::Error::TooLong(_, _) => "attribute_too_long",
        keyring::Error::Invalid(_, _) => "invalid_attribute",
        keyring::Error::Ambiguous(_) => "ambiguous_entry",
        _ => "unknown_keyring_error",
    }
}

fn install_panic_diagnostics() {
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        log::error!(
            target: "zilobase::panic",
            "[diagnostics] event=native.panic status=error"
        );
        log::logger().flush();
        previous_hook(panic_info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if diagnostics::diagnostics_requested() {
        match diagnostics::export_from_command_line() {
            Ok(path) => {
                println!("Zilobase diagnostics archive: {}", path.display());
                std::process::exit(0);
            }
            Err(error) => {
                eprintln!("Could not export Zilobase diagnostics: {error}");
                std::process::exit(1);
            }
        }
    }

    install_panic_diagnostics();
    let started_at = Instant::now();
    let startup_state = StartupState::default();
    let builder = tauri::Builder::default().manage(startup_state);

    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = {
        use tauri::Manager;

        builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for deep_link in args
                .iter()
                .filter_map(|argument| describe_deep_link(argument))
            {
                log::info!(
                    target: "zilobase::deep_link",
                    "[diagnostics] event=deep_link.received status=success target={deep_link}"
                );
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
    };

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(match std::env::var("ZILOBASE_LOG").as_deref() {
                    Ok("debug") | Ok("trace") => log::LevelFilter::Debug,
                    _ => log::LevelFilter::Info,
                })
                .max_file_size(5 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .filter(|metadata| {
                    metadata.target().starts_with("zilobase")
                })
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_page_load(move |_webview, payload| {
            log::info!(
                target: "zilobase::startup",
                "[diagnostics] event=webview.page_load status={:?} elapsed_ms={}",
                payload.event(),
                started_at.elapsed().as_millis()
            );
        })
        .setup(move |app| {
            log::info!(
                target: "zilobase::startup",
                "[diagnostics] event=native.setup status=success elapsed_ms={}",
                started_at.elapsed().as_millis()
            );
            diagnostics::log_runtime_environment();

            let startup_state = app.state::<StartupState>().inner().clone();
            std::thread::spawn(move || {
                std::thread::sleep(STARTUP_TIMEOUT);
                if !startup_state.renderer_ready.load(Ordering::Relaxed) {
                    log::warn!(
                        target: "zilobase::startup",
                        "[diagnostics] event=renderer.startup_timeout status=timeout elapsed_ms={}",
                        STARTUP_TIMEOUT.as_millis()
                    );
                    log::logger().flush();
                }
            });

            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                use tauri_plugin_deep_link::DeepLinkExt;

                log::info!(
                    target: "zilobase::deep_link",
                    "[diagnostics] event=deep_link.registration status=started"
                );
                if let Err(error) = app.deep_link().register_all() {
                    log::error!(
                        target: "zilobase::deep_link",
                        "[diagnostics] event=deep_link.registration status=error error_type=registration_error"
                    );
                    return Err(error.into());
                }
                log::info!(
                    target: "zilobase::deep_link",
                    "[diagnostics] event=deep_link.registration status=success"
                );

                if let Some(window) = app.get_webview_window("main") {
                    window.set_decorations(false)?;
                    log::info!(
                        target: "zilobase::startup",
                        "[diagnostics] event=linux.window_decorations status=success"
                    );
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
            set_auth_owner,
            mark_renderer_ready,
            diagnostics::record_renderer_diagnostic,
            diagnostics::get_diagnostics_info,
            diagnostics::open_diagnostics_folder,
            diagnostics::export_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::describe_deep_link;

    #[test]
    fn deep_link_diagnostics_never_include_query_values() {
        assert_eq!(
            describe_deep_link("zilobase://auth?token=secret&path=%2Fdashboard"),
            Some("auth")
        );
        assert_eq!(describe_deep_link("zilobase://open?path=%2Fdashboard"), Some("open"));
        assert_eq!(
            describe_deep_link("zilobase://person@example.com?token=secret"),
            Some("other")
        );
        assert_eq!(describe_deep_link("https://app.zilobase.com"), None);
    }
}
