mod desktop_server;
mod diagnostics;
mod meeting_capture;
mod oauth;

use sha2::{Digest, Sha256};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const AUTH_SERVICE: &str = "com.zilobase";
const LEGACY_AUTH_ACCOUNT: &str = "session";
const LEGACY_AUTH_OWNER_ACCOUNT: &str = "session-owner";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const MIN_WINDOW_OPACITY: f64 = 0.6;

#[derive(Clone, Default)]
struct StartupState {
    renderer_ready: Arc<AtomicBool>,
}

#[cfg(all(desktop, any(not(debug_assertions), test)))]
fn describe_deep_link(value: &str) -> Option<&'static str> {
    let target = value.strip_prefix("zilobase://")?.split('?').next()?;
    (!target.is_empty()).then_some(match target {
        "connect" => "connect",
        "open" => "open",
        _ => "other",
    })
}

#[tauri::command]
fn get_auth_token(app: AppHandle) -> Result<Option<String>, String> {
    let server = load_credential_server(&app)?;
    get_server_keyring_value(&server, LEGACY_AUTH_ACCOUNT, "session_token")
}

#[tauri::command]
fn set_auth_token(app: AppHandle, token: Option<String>) -> Result<(), String> {
    let server = load_credential_server(&app)?;
    set_server_keyring_value(&server, LEGACY_AUTH_ACCOUNT, "session_token", token)
}

#[tauri::command]
fn get_auth_owner(app: AppHandle) -> Result<Option<String>, String> {
    let server = load_credential_server(&app)?;
    get_server_keyring_value(&server, LEGACY_AUTH_OWNER_ACCOUNT, "session_owner")
}

#[tauri::command]
fn set_auth_owner(app: AppHandle, owner: Option<String>) -> Result<(), String> {
    let server = load_credential_server(&app)?;
    set_server_keyring_value(&server, LEGACY_AUTH_OWNER_ACCOUNT, "session_owner", owner)
}

#[tauri::command]
fn mark_renderer_ready(state: tauri::State<'_, StartupState>, elapsed_ms: u64) {
    state.renderer_ready.store(true, Ordering::Relaxed);
    log::info!(
        target: "zilobase::startup",
        "[diagnostics] event=renderer.app_ready status=success elapsed_ms={elapsed_ms}"
    );
}

#[tauri::command]
fn set_window_opacity(window: tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    let opacity = validate_window_opacity(opacity)?;
    set_native_window_opacity(&window, opacity)
}

fn validate_window_opacity(opacity: f64) -> Result<f64, String> {
    if opacity.is_finite() && (MIN_WINDOW_OPACITY..=1.0).contains(&opacity) {
        Ok(opacity)
    } else {
        Err(format!(
            "Window opacity must be between {MIN_WINDOW_OPACITY} and 1."
        ))
    }
}

#[cfg(target_os = "macos")]
fn set_native_window_opacity(window: &tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    let ns_window: &objc2_app_kit::NSWindow = unsafe { &*ns_window.cast() };
    ns_window.setAlphaValue(opacity);
    Ok(())
}

#[cfg(target_os = "linux")]
fn set_native_window_opacity(window: &tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    use gtk::prelude::WidgetExt;

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    gtk_window.set_opacity(opacity);
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn set_native_window_opacity(
    _window: &tauri::WebviewWindow,
    _opacity: f64,
) -> Result<(), String> {
    Err("Window translucency is not supported on this platform.".to_string())
}

#[cfg(windows)]
fn set_native_window_opacity(window: &tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    let alpha = (opacity * 255.0).round() as u8;
    unsafe {
        let extended_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, extended_style | WS_EX_LAYERED as i32);
        if SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA) == 0 {
            return Err("Windows could not update the window opacity.".to_string());
        }
    }
    Ok(())
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

fn set_keyring_value(account: &str, value_kind: &str, value: Option<String>) -> Result<(), String> {
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
            log_keyring_failure(
                operation,
                value_kind,
                "credential_access",
                &error,
                started_at,
            );
            Err(error.to_string())
        }
    }
}

fn load_credential_server(app: &AppHandle) -> Result<desktop_server::DesktopServer, String> {
    desktop_server::load_or_initialize_desktop_server(app)
        .map_err(|_| "The selected desktop server could not be loaded.".to_string())
}

pub(crate) fn get_server_keyring_value(
    server: &desktop_server::DesktopServer,
    legacy_account: &str,
    value_kind: &str,
) -> Result<Option<String>, String> {
    let account = scoped_keyring_account(server, legacy_account);
    let scoped = get_keyring_value(&account, value_kind)?;

    if scoped.is_some() || !desktop_server::is_cloud_server(server) {
        return Ok(scoped);
    }

    let legacy = get_keyring_value(legacy_account, value_kind)?;
    if let Some(value) = legacy {
        set_keyring_value(&account, value_kind, Some(value.clone()))?;
        set_keyring_value(legacy_account, value_kind, None)?;
        log::info!(
            target: "zilobase::keyring",
            "[diagnostics] event=keyring.migration status=success value_kind={value_kind}"
        );
        return Ok(Some(value));
    }

    Ok(None)
}

pub(crate) fn set_server_keyring_value(
    server: &desktop_server::DesktopServer,
    legacy_account: &str,
    value_kind: &str,
    value: Option<String>,
) -> Result<(), String> {
    set_keyring_value(
        &scoped_keyring_account(server, legacy_account),
        value_kind,
        value,
    )
}

pub(crate) fn delete_server_keyring_credentials(
    server: &desktop_server::DesktopServer,
) -> Result<(), String> {
    let mut first_error = None;
    for (account, value_kind) in [
        (LEGACY_AUTH_ACCOUNT, "session_token"),
        (LEGACY_AUTH_OWNER_ACCOUNT, "session_owner"),
    ] {
        if let Err(error) = set_server_keyring_value(server, account, value_kind, None) {
            first_error.get_or_insert(error);
        }
        if desktop_server::is_cloud_server(server) {
            if let Err(error) = set_keyring_value(account, value_kind, None) {
                first_error.get_or_insert(error);
            }
        }
    }

    first_error.map_or(Ok(()), Err)
}

fn scoped_keyring_account(server: &desktop_server::DesktopServer, legacy_account: &str) -> String {
    let digest = Sha256::digest(format!("{}\0{}", server.issuer, server.instance_id).as_bytes());
    format!("{legacy_account}:{digest:x}")
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
    let builder = tauri::Builder::default()
        .manage(startup_state)
        .manage(desktop_server::DesktopServerCandidateState::default())
        .manage(meeting_capture::MeetingCaptureManager::default())
        .manage(oauth::DesktopOAuthState::default());

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
                if app.deep_link().register_all().is_err() {
                    log::error!(
                        target: "zilobase::deep_link",
                        "[diagnostics] event=deep_link.registration status=error error_type=registration_error"
                    );
                } else {
                    log::info!(
                        target: "zilobase::deep_link",
                        "[diagnostics] event=deep_link.registration status=success"
                    );
                }

                if let Some(window) = app.get_webview_window("main") {
                    window.set_decorations(false)?;
                    log::info!(
                        target: "zilobase::startup",
                        "[diagnostics] event=linux.window_decorations status=success"
                    );
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_auth_token,
            set_auth_token,
            get_auth_owner,
            set_auth_owner,
            mark_renderer_ready,
            set_window_opacity,
            desktop_server::initialize_desktop_server,
            desktop_server::prepare_desktop_server_candidate,
            desktop_server::discard_desktop_server_candidate,
            desktop_server::commit_desktop_server_candidate,
            desktop_server::list_desktop_server_profiles,
            desktop_server::switch_desktop_server_profile,
            desktop_server::update_desktop_server_profile_snapshot,
            desktop_server::remove_desktop_server_profile,
            oauth::start_browser_authorization,
            oauth::cancel_browser_authorization,
            diagnostics::record_renderer_diagnostic,
            diagnostics::get_diagnostics_info,
            diagnostics::open_diagnostics_folder,
            diagnostics::export_diagnostics,
            meeting_capture::meeting_capture_list_devices,
            meeting_capture::meeting_capture_permissions,
            meeting_capture::meeting_capture_start,
            meeting_capture::meeting_capture_pause,
            meeting_capture::meeting_capture_resume,
            meeting_capture::meeting_capture_refresh_transport,
            meeting_capture::meeting_capture_stop,
            meeting_capture::meeting_capture_state,
            meeting_capture::meeting_capture_recoverable_sessions,
            meeting_capture::meeting_capture_delete_local_file,
            meeting_capture::meeting_capture_open_local_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{describe_deep_link, validate_window_opacity};

    #[test]
    fn deep_link_diagnostics_never_include_query_values() {
        assert_eq!(
            describe_deep_link("zilobase://open?path=%2Frecents"),
            Some("open")
        );
        assert_eq!(
            describe_deep_link("zilobase://connect?server=https%3A%2F%2Fsecret.test"),
            Some("connect")
        );
        assert_eq!(
            describe_deep_link("zilobase://unknown?value=secret"),
            Some("other")
        );
        assert_eq!(describe_deep_link("https://app.zilobase.com"), None);
    }

    #[test]
    fn window_opacity_stays_within_the_readable_range() {
        assert_eq!(validate_window_opacity(0.6), Ok(0.6));
        assert_eq!(validate_window_opacity(1.0), Ok(1.0));
        assert!(validate_window_opacity(0.59).is_err());
        assert!(validate_window_opacity(1.01).is_err());
        assert!(validate_window_opacity(f64::NAN).is_err());
    }
}
