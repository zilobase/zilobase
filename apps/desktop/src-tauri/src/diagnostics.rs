use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    env,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const APP_IDENTIFIER: &str = "com.zilobase";
const MAX_ARCHIVED_LOGS: usize = 4;
const MAX_ARCHIVED_LOG_BYTES: u64 = 6 * 1024 * 1024;
const SAFE_NUMERIC_FIELDS: [&str; 3] = ["duration_ms", "elapsed_ms", "http_status"];
const SAFE_BOOLEAN_FIELDS: [&str; 6] = [
    "offline_supported",
    "owner_present",
    "session_present",
    "token_present",
    "user_present",
    "value_present",
];
const SAFE_STATUS_VALUES: [&str; 7] = [
    "complete", "disabled", "error", "missing", "started", "success", "timeout",
];
const SAFE_PLATFORM_VALUES: [&str; 4] = ["linux", "macos", "windows", "unknown"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    log_directory: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsManifest {
    schema_version: u8,
    generated_at_unix_seconds: u64,
    app_version: &'static str,
    build_commit: &'static str,
    operating_system: &'static str,
    architecture: &'static str,
    package_kind: &'static str,
    linux_distribution: Option<String>,
    display_server: &'static str,
    archived_log_files: Vec<String>,
}

pub fn diagnostics_requested() -> bool {
    has_diagnostics_arg(env::args_os())
}

pub fn export_from_command_line() -> Result<PathBuf, String> {
    let log_dir = default_log_dir().ok_or("Could not determine the Zilobase log directory")?;
    let output_dir = env::current_dir().unwrap_or_else(|_| env::temp_dir());
    export_archive(&log_dir, &output_dir)
}

pub fn log_runtime_environment() {
    log::info!(
        target: "zilobase::diagnostics",
        "[diagnostics] event=native.environment app_version={} build_commit={} os={} arch={} package={} display_server={} linux_distribution={}",
        env!("CARGO_PKG_VERSION"),
        build_commit(),
        env::consts::OS,
        env::consts::ARCH,
        package_kind(),
        display_server(),
        linux_distribution().as_deref().unwrap_or("unknown"),
    );
}

#[tauri::command]
pub fn record_renderer_diagnostic(
    event: String,
    fields: BTreeMap<String, Value>,
    level: String,
) -> Result<(), String> {
    let message = format_renderer_diagnostic(&event, &fields)
        .ok_or("The diagnostic event contains unsupported fields")?;

    match level.as_str() {
        "error" => log::error!(target: "zilobase::renderer", "{message}"),
        "info" => log::info!(target: "zilobase::renderer", "{message}"),
        "warn" => log::warn!(target: "zilobase::renderer", "{message}"),
        _ => return Err("Unsupported diagnostic level".to_string()),
    }
    Ok(())
}

#[tauri::command]
pub fn get_diagnostics_info(app: AppHandle) -> Result<DiagnosticsInfo, String> {
    let log_dir = app.path().app_log_dir().map_err(|_| "Log directory is unavailable")?;
    fs::create_dir_all(&log_dir).map_err(|_| "Could not create the log directory")?;
    Ok(DiagnosticsInfo {
        log_directory: log_dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn open_diagnostics_folder(app: AppHandle) -> Result<(), String> {
    let log_dir = app.path().app_log_dir().map_err(|_| "Log directory is unavailable")?;
    fs::create_dir_all(&log_dir).map_err(|_| "Could not create the log directory")?;
    app.opener()
        .open_path(log_dir.to_string_lossy().into_owned(), None::<String>)
        .map_err(|_| "Could not open the log directory")?;
    log::info!(
        target: "zilobase::diagnostics",
        "[diagnostics] event=diagnostics.log_folder_opened status=success"
    );
    Ok(())
}

#[tauri::command]
pub fn export_diagnostics(app: AppHandle) -> Result<String, String> {
    let log_dir = app.path().app_log_dir().map_err(|_| "Log directory is unavailable")?;
    let output_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| env::temp_dir());

    log::info!(
        target: "zilobase::diagnostics",
        "[diagnostics] event=diagnostics.export status=started"
    );
    log::logger().flush();

    match export_archive(&log_dir, &output_dir) {
        Ok(path) => {
            log::info!(
                target: "zilobase::diagnostics",
                "[diagnostics] event=diagnostics.export status=success"
            );
            Ok(path.to_string_lossy().into_owned())
        }
        Err(error) => {
            log::error!(
                target: "zilobase::diagnostics",
                "[diagnostics] event=diagnostics.export status=error error_type=archive_error"
            );
            Err(error)
        }
    }
}

fn export_archive(log_dir: &Path, output_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(output_dir).map_err(|_| "Could not create the diagnostics destination")?;

    let log_files = recent_log_files(log_dir);
    let archived_log_files = log_files
        .iter()
        .filter_map(|path| path.file_name()?.to_str().map(str::to_owned))
        .collect::<Vec<_>>();
    let manifest = DiagnosticsManifest {
        schema_version: 1,
        generated_at_unix_seconds: unix_seconds(),
        app_version: env!("CARGO_PKG_VERSION"),
        build_commit: build_commit(),
        operating_system: env::consts::OS,
        architecture: env::consts::ARCH,
        package_kind: package_kind(),
        linux_distribution: linux_distribution(),
        display_server: display_server(),
        archived_log_files,
    };

    let archive_path = output_dir.join(format!(
        "zilobase-diagnostics-{}-{}.zip",
        unix_seconds(),
        std::process::id()
    ));
    let archive = File::create(&archive_path)
        .map_err(|_| "Could not create the diagnostics archive")?;
    let mut writer = ZipWriter::new(archive);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let manifest_json = serde_json::to_vec_pretty(&manifest)
        .map_err(|_| "Could not serialize diagnostics metadata")?;

    writer
        .start_file("diagnostics.json", options)
        .map_err(|_| "Could not write diagnostics metadata")?;
    writer
        .write_all(&manifest_json)
        .map_err(|_| "Could not write diagnostics metadata")?;

    for path in log_files {
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let source = match File::open(&path) {
            Ok(source) => source,
            Err(_) => continue,
        };
        writer
            .start_file(format!("logs/{file_name}"), options)
            .map_err(|_| "Could not add a log file to the diagnostics archive")?;
        io::copy(&mut source.take(MAX_ARCHIVED_LOG_BYTES), &mut writer)
            .map_err(|_| "Could not copy a log file into the diagnostics archive")?;
    }

    writer
        .finish()
        .map_err(|_| "Could not finish the diagnostics archive")?;
    Ok(archive_path)
}

fn recent_log_files(log_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return Vec::new();
    };
    let mut files = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("zilobase") && name.ends_with(".log"))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH)
    });
    files.into_iter().rev().take(MAX_ARCHIVED_LOGS).collect()
}

fn default_log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir().map(|path| path.join("Library/Logs").join(APP_IDENTIFIER));
    }

    #[cfg(not(target_os = "macos"))]
    {
        dirs::data_local_dir().map(|path| path.join(APP_IDENTIFIER).join("logs"))
    }
}

fn package_kind() -> &'static str {
    if env::var_os("APPIMAGE").is_some() || env::var_os("APPDIR").is_some() {
        "appimage"
    } else if env::var_os("FLATPAK_ID").is_some() {
        "flatpak"
    } else if env::var_os("SNAP").is_some() {
        "snap"
    } else {
        "installed_or_unknown"
    }
}

fn display_server() -> &'static str {
    match env::var("XDG_SESSION_TYPE")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "wayland" => "wayland",
        "x11" => "x11",
        _ if env::var_os("WAYLAND_DISPLAY").is_some() => "wayland",
        _ if env::var_os("DISPLAY").is_some() => "x11",
        _ => "unknown",
    }
}

fn linux_distribution() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let release = fs::read_to_string("/etc/os-release").ok()?;
        let id = os_release_value(&release, "ID")?;
        let version = os_release_value(&release, "VERSION_ID");
        return Some(match version {
            Some(version) => format!("{id}-{version}"),
            None => id,
        });
    }

    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

fn os_release_value(contents: &str, key: &str) -> Option<String> {
    let raw = contents.lines().find_map(|line| line.strip_prefix(&format!("{key}=")))?;
    let value = raw.trim_matches('"');
    (!value.is_empty()
        && value.len() <= 40
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        }))
    .then(|| value.to_string())
}

fn format_renderer_diagnostic(event: &str, fields: &BTreeMap<String, Value>) -> Option<String> {
    if !is_safe_event_name(event) {
        return None;
    }
    let mut parts = vec![format!("[diagnostics] event={event}")];
    for (key, value) in fields {
        let Some(value) = safe_renderer_field(key, value) else {
            continue;
        };
        parts.push(format!("{key}={value}"));
    }
    Some(parts.join(" "))
}

fn safe_renderer_field(key: &str, value: &Value) -> Option<String> {
    if SAFE_NUMERIC_FIELDS.contains(&key) {
        let value = value.as_f64()?;
        if !value.is_finite() || value < 0.0 || value > u64::MAX as f64 {
            return None;
        }
        return Some((value.round() as u64).to_string());
    }
    if SAFE_BOOLEAN_FIELDS.contains(&key) {
        return value.as_bool().map(|value| value.to_string());
    }
    if key == "status" {
        let value = value.as_str()?;
        return SAFE_STATUS_VALUES.contains(&value).then(|| value.to_string());
    }
    if key == "platform" {
        let value = value.as_str()?;
        return SAFE_PLATFORM_VALUES.contains(&value).then(|| value.to_string());
    }
    if key == "error_type" || key == "value_kind" {
        let value = value.as_str()?;
        return is_safe_identifier(value).then(|| value.to_string());
    }
    None
}

fn is_safe_event_name(value: &str) -> bool {
    value.len() <= 64
        && value
            .bytes()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase())
        && value.bytes().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, b'.' | b'_' | b'-')
        })
}

fn is_safe_identifier(value: &str) -> bool {
    value.len() <= 48
        && value
            .bytes()
            .next()
            .is_some_and(|character| character.is_ascii_alphabetic())
        && value.bytes().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-')
        })
}

fn build_commit() -> &'static str {
    option_env!("GITHUB_SHA").unwrap_or("unknown")
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn has_diagnostics_arg<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    args.into_iter()
        .any(|argument| argument.as_ref() == "--diagnostics")
}

#[cfg(test)]
mod tests {
    use super::{format_renderer_diagnostic, has_diagnostics_arg, os_release_value};
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn recognizes_only_the_explicit_diagnostics_flag() {
        assert!(has_diagnostics_arg(["zilobase-client", "--diagnostics"]));
        assert!(!has_diagnostics_arg(["zilobase-client", "--diagnostics-path"]));
    }

    #[test]
    fn os_release_metadata_is_bounded_and_sanitized() {
        let contents = "ID=ubuntu\nVERSION_ID=\"24.04;token=secret\"\n";
        assert_eq!(os_release_value(contents, "ID").as_deref(), Some("ubuntu"));
        assert_eq!(os_release_value(contents, "VERSION_ID"), None);
    }

    #[test]
    fn renderer_diagnostics_drop_every_unapproved_field() {
        let fields = BTreeMap::from([
            ("duration_ms".to_string(), json!(42.4)),
            ("email".to_string(), json!("person@example.com")),
            ("status".to_string(), json!("success")),
            ("token".to_string(), json!("secret")),
            ("token_present".to_string(), json!(true)),
            ("url".to_string(), json!("zilobase://auth?token=secret")),
        ]);
        assert_eq!(
            format_renderer_diagnostic("keyring.initialization", &fields).as_deref(),
            Some("[diagnostics] event=keyring.initialization duration_ms=42 status=success token_present=true")
        );
    }

    #[test]
    fn renderer_diagnostics_reject_unsafe_event_names() {
        assert_eq!(
            format_renderer_diagnostic("bad event token=secret", &BTreeMap::new()),
            None
        );
    }
}
