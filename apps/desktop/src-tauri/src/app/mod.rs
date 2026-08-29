mod window;

use crate::auth::{keyring, oauth};
use crate::diagnostics;
use crate::meetings::capture as meeting_capture;
use crate::meetings::recovery as meeting_recovery;
use crate::server as desktop_server;

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

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

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
fn mark_renderer_ready(state: tauri::State<'_, StartupState>, elapsed_ms: u64) {
    state.renderer_ready.store(true, Ordering::Relaxed);
    log::info!(
        target: "zilobase::startup",
        "[diagnostics] event=renderer.app_ready status=success elapsed_ms={elapsed_ms}"
    );
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
            keyring::get_auth_token,
            keyring::set_auth_token,
            keyring::get_auth_owner,
            keyring::set_auth_owner,
            mark_renderer_ready,
            window::set_window_opacity,
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
            meeting_recovery::meeting_capture_recoverable_sessions,
            meeting_recovery::meeting_capture_delete_local_file,
            meeting_recovery::meeting_capture_open_local_file
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
}
