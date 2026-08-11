// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const AUTH_SERVICE: &str = "com.zilobase";
const AUTH_ACCOUNT: &str = "session";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        use tauri::Manager;

        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_auth_token,
            set_auth_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
