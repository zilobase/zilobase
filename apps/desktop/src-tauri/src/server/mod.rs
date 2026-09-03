use std::{
    collections::HashMap,
    error::Error as StdError,
    fs,
    io::Write,
    net::{Ipv4Addr, Ipv6Addr},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

use reqwest::{header::CONTENT_TYPE, redirect::Policy, StatusCode};
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;
use url::Url;

mod config;
mod discovery;

use config::*;
use discovery::*;

const CONFIG_FILE_NAME: &str = "desktop-server.json";
const DEV_CONFIG_FILE_NAME: &str = "desktop-server.dev.json";
const CONFIG_VERSION: u8 = 2;
const LEGACY_CONFIG_VERSION: u8 = 1;
const MAX_PROFILE_WORKSPACES: usize = 50;
const DISCOVERY_PATH: &str = "/.well-known/zilobase";
const MAX_DISCOVERY_BYTES: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const SERVER_CANDIDATE_TTL: Duration = Duration::from_secs(5 * 60);
const CLOUD_INSTANCE_ID: &str = "zilobase-cloud";
const CLOUD_WEB_ORIGIN: &str = "https://app.zilobase.com";
const CLOUD_API_ORIGIN: &str = "https://api.zilobase.com";
const DEV_INSTANCE_ID: &str = "zilobase-dev";
const DEFAULT_DEV_API_ORIGIN: &str = "http://localhost:3000";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServer {
    pub instance_id: String,
    pub display_name: String,
    pub issuer: String,
    pub web_origin: String,
    pub api_origin: String,
    pub protocol_version: u8,
    pub server_version: String,
    pub minimum_desktop_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryDocument {
    #[serde(flatten)]
    server: DesktopServer,
    desktop_authorization: DesktopAuthorizationEndpoints,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthorizationEndpoints {
    authorization_endpoint: String,
    token_endpoint: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServerWorkspaceSnapshot {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopServerProfile {
    server: DesktopServer,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_active_workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    workspaces: Vec<DesktopServerWorkspaceSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_used_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopServerConfig {
    version: u8,
    active_instance_id: String,
    profiles: Vec<DesktopServerProfile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyDesktopServerConfig {
    #[allow(dead_code)]
    version: u8,
    server: DesktopServer,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServerProfileView {
    pub server: DesktopServer,
    pub last_active_workspace_id: Option<String>,
    pub last_path: Option<String>,
    pub workspaces: Vec<DesktopServerWorkspaceSnapshot>,
    pub last_used_at: Option<String>,
    pub has_credentials: bool,
    pub active: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServerProfileList {
    pub active_instance_id: String,
    pub profiles: Vec<DesktopServerProfileView>,
}

#[derive(Clone, Debug)]
struct DesktopServerCandidate {
    id: String,
    server: DesktopServer,
    verified_at: Instant,
}

#[derive(Default)]
pub(crate) struct DesktopServerCandidateState {
    candidates: Mutex<HashMap<String, DesktopServerCandidate>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedDesktopServer {
    candidate_id: String,
    server: DesktopServer,
}

#[derive(Debug, Serialize)]
pub(crate) struct DesktopServerCommit {
    changed: bool,
    server: DesktopServer,
}

#[derive(Debug, Serialize)]
pub(crate) struct DesktopServerError {
    code: &'static str,
    message: String,
}

impl DesktopServerError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn configuration(message: impl Into<String>) -> Self {
        Self::new("server_configuration_error", message)
    }

    fn invalid_metadata(message: impl Into<String>) -> Self {
        Self::new("invalid_server_metadata", message)
    }
}

#[tauri::command]
pub(crate) fn initialize_desktop_server(
    app: AppHandle,
) -> Result<DesktopServer, DesktopServerError> {
    load_or_initialize_desktop_server(&app)
}

#[tauri::command]
pub(crate) async fn prepare_desktop_server_candidate(
    state: tauri::State<'_, DesktopServerCandidateState>,
    server_url: String,
) -> Result<PreparedDesktopServer, DesktopServerError> {
    let server = verify_desktop_server(&server_url).await?;
    let candidate = DesktopServerCandidate {
        id: random_candidate_id()?,
        server,
        verified_at: Instant::now(),
    };
    let prepared = PreparedDesktopServer {
        candidate_id: candidate.id.clone(),
        server: candidate.server.clone(),
    };
    let mut candidates = state.candidates.lock().map_err(|_| {
        DesktopServerError::configuration("The server candidate could not be saved.")
    })?;
    candidates.retain(|_, candidate| candidate.verified_at.elapsed() <= SERVER_CANDIDATE_TTL);
    if candidates.len() >= 8 {
        candidates.clear();
    }
    candidates.insert(candidate.id.clone(), candidate);
    Ok(prepared)
}

#[tauri::command]
pub(crate) fn discard_desktop_server_candidate(
    state: tauri::State<'_, DesktopServerCandidateState>,
    candidate_id: String,
) -> Result<(), DesktopServerError> {
    state.discard(&candidate_id)
}

#[tauri::command]
pub(crate) fn commit_desktop_server_candidate(
    app: AppHandle,
    state: tauri::State<'_, DesktopServerCandidateState>,
    candidate_id: String,
) -> Result<DesktopServerCommit, DesktopServerError> {
    let candidate = state.get(&candidate_id)?;
    let directory = app.path().app_config_dir().map_err(|_| {
        DesktopServerError::configuration("The app configuration directory is unavailable.")
    })?;
    let result = commit_candidate_to_directory(&directory, &candidate.server)?;
    state.discard(&candidate_id)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn list_desktop_server_profiles(
    app: AppHandle,
) -> Result<DesktopServerProfileList, DesktopServerError> {
    let directory = app_config_directory(&app)?;
    let config = load_or_initialize_config(&directory)?;
    Ok(profile_list_from_config(&config))
}

#[tauri::command]
pub(crate) fn switch_desktop_server_profile(
    app: AppHandle,
    instance_id: String,
    api_origin: String,
    workspace_id: Option<String>,
    path: Option<String>,
) -> Result<DesktopServer, DesktopServerError> {
    let directory = app_config_directory(&app)?;
    let mut config = load_or_initialize_config(&directory)?;
    let index = find_profile_index(&config, &instance_id, &api_origin).ok_or_else(|| {
        DesktopServerError::new(
            "server_profile_not_found",
            "That saved server is no longer available on this device.",
        )
    })?;
    if let Some(workspace_id) = sanitize_optional_text(workspace_id, 128) {
        config.profiles[index].last_active_workspace_id = Some(workspace_id);
    }
    if let Some(path) = sanitize_optional_path(path) {
        config.profiles[index].last_path = Some(path);
    }
    let server = config.profiles[index].server.clone();
    config.active_instance_id = server.instance_id.clone();
    write_config(&directory, &config)?;
    Ok(server)
}

#[tauri::command]
pub(crate) fn update_desktop_server_profile_snapshot(
    app: AppHandle,
    workspaces: Vec<DesktopServerWorkspaceSnapshot>,
    last_active_workspace_id: Option<String>,
    last_path: Option<String>,
) -> Result<(), DesktopServerError> {
    let directory = app_config_directory(&app)?;
    let mut config = load_or_initialize_config(&directory)?;
    let index = active_profile_index(&config).ok_or_else(|| {
        DesktopServerError::configuration("The active desktop server profile is missing.")
    })?;
    let profile = &mut config.profiles[index];
    profile.workspaces = sanitize_workspace_snapshots(workspaces);
    profile.last_active_workspace_id = sanitize_optional_text(last_active_workspace_id, 128);
    profile.last_path = sanitize_optional_path(last_path);
    profile.last_used_at = Some(unix_timestamp_secs());
    write_config(&directory, &config)
}

#[tauri::command]
pub(crate) fn remove_desktop_server_profile(
    app: AppHandle,
    instance_id: String,
    api_origin: String,
) -> Result<DesktopServer, DesktopServerError> {
    let directory = app_config_directory(&app)?;
    remove_profile_from_directory(&directory, &instance_id, &api_origin, |server| {
        crate::auth::keyring::delete_server_keyring_credentials(server)
    })
}

pub(crate) fn load_or_initialize_desktop_server(
    app: &AppHandle,
) -> Result<DesktopServer, DesktopServerError> {
    let directory = app.path().app_config_dir().map_err(|_| {
        DesktopServerError::configuration("The app configuration directory is unavailable.")
    })?;

    load_or_initialize_from_directory(&directory)
}

pub(crate) fn is_cloud_server(server: &DesktopServer) -> bool {
    server.api_origin == CLOUD_API_ORIGIN && server.issuer == CLOUD_API_ORIGIN
}

pub(crate) fn is_development_server(server: &DesktopServer) -> bool {
    if !cfg!(debug_assertions) {
        return false;
    }

    let development = development_server();
    server.api_origin == development.api_origin && server.issuer == development.issuer
}

impl DesktopServerCandidateState {
    fn get(&self, candidate_id: &str) -> Result<DesktopServerCandidate, DesktopServerError> {
        let mut candidates = self.candidates.lock().map_err(|_| {
            DesktopServerError::configuration("The server candidate could not be loaded.")
        })?;
        let candidate = candidates.get(candidate_id).cloned();
        if candidate
            .as_ref()
            .is_some_and(|candidate| candidate.verified_at.elapsed() <= SERVER_CANDIDATE_TTL)
        {
            return Ok(candidate.expect("the candidate was checked above"));
        }
        candidates.remove(candidate_id);
        Err(DesktopServerError::new(
            "server_candidate_expired",
            "Verify the server again before changing connections.",
        ))
    }

    fn discard(&self, candidate_id: &str) -> Result<(), DesktopServerError> {
        let mut candidates = self.candidates.lock().map_err(|_| {
            DesktopServerError::configuration("The server candidate could not be cleared.")
        })?;
        candidates.remove(candidate_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        cloud_server, commit_candidate_to_directory, config_file_name, config_path, default_server,
        development_server, find_profile_index, is_development_server, load_or_initialize_config,
        load_or_initialize_from_directory, parse_config, parse_server_origin,
        remove_profile_from_directory, save_to_directory, servers_refer_to_same_instance,
        validate_discovery_document, verify_desktop_server, write_config,
        DesktopAuthorizationEndpoints, DesktopServerCandidate, DesktopServerCandidateState,
        DesktopServerWorkspaceSnapshot, DiscoveryDocument, DEV_CONFIG_FILE_NAME,
        SERVER_CANDIDATE_TTL,
    };
    use std::time::Instant;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn debug_replaces_saved_cloud_with_the_local_default() {
        #[cfg(debug_assertions)]
        {
            let directory = tempfile::tempdir().expect("temporary directory");
            save_to_directory(directory.path(), &cloud_server()).expect("save cloud");
            let loaded =
                load_or_initialize_from_directory(directory.path()).expect("remap saved cloud");
            assert_eq!(loaded, default_server());
        }
    }

    #[test]
    fn debug_defaults_to_local_api_without_touching_release_cloud_config() {
        #[cfg(debug_assertions)]
        {
            assert_eq!(default_server(), development_server());
            assert_ne!(default_server(), cloud_server());
            assert_eq!(config_file_name(), DEV_CONFIG_FILE_NAME);
            assert_eq!(
                development_server().api_origin,
                std::env::var("VITE_API_URL")
                    .ok()
                    .map(|value| value.trim().trim_end_matches('/').to_string())
                    .filter(|value| !value.is_empty() && value != "/api")
                    .unwrap_or_else(|| super::DEFAULT_DEV_API_ORIGIN.to_string()),
            );
        }
        #[cfg(not(debug_assertions))]
        {
            assert_eq!(default_server(), cloud_server());
            assert_eq!(config_file_name(), super::CONFIG_FILE_NAME);
        }
    }

    #[test]
    fn debug_recognizes_a_discovered_local_server_after_its_instance_id_changes() {
        #[cfg(debug_assertions)]
        {
            let mut discovered = development_server();
            discovered.instance_id = "database-instance".to_string();
            assert!(is_development_server(&discovered));

            discovered.api_origin = "https://notes.example.com".to_string();
            discovered.issuer = discovered.api_origin.clone();
            assert!(!is_development_server(&discovered));
        }
    }

    #[test]
    fn accepts_https_and_only_loopback_http_origins() {
        for value in [
            "https://notes.example.com",
            "https://notes.example.com/",
            "http://localhost:8787",
            "http://127.0.0.1:8787",
            "http://[::1]:8787",
        ] {
            assert!(parse_server_origin(value).is_ok(), "{value}");
        }

        for value in [
            "http://example.com",
            "http://192.168.1.5:8787",
            "https://user:password@example.com",
            "https://example.com/subpath",
            "https://example.com?query=value",
            "https://example.com#fragment",
            "file:///tmp/server",
            "not a URL",
        ] {
            assert!(parse_server_origin(value).is_err(), "{value}");
        }
    }

    #[test]
    fn initializes_default_and_persists_server_replacements() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        assert_eq!(initial, default_server());
        assert!(config_path(directory.path()).is_file());

        let mut replacement = cloud_server();
        replacement.instance_id = "self-hosted-instance".to_string();
        replacement.display_name = "Team Notes".to_string();
        replacement.issuer = "https://notes.example.com".to_string();
        replacement.web_origin = "https://notes.example.com".to_string();
        replacement.api_origin = "https://notes.example.com".to_string();
        save_to_directory(directory.path(), &replacement).expect("save replacement");

        let restored =
            load_or_initialize_from_directory(directory.path()).expect("restored server");
        assert_eq!(restored, replacement);
    }

    #[test]
    fn commits_a_verified_candidate_without_dropping_the_previous_profile() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut replacement = initial.clone();
        replacement.instance_id = "self-hosted-instance".to_string();
        replacement.display_name = "Team Notes".to_string();
        replacement.issuer = "https://notes.example.com".to_string();
        replacement.web_origin = "https://notes.example.com".to_string();
        replacement.api_origin = "https://notes.example.com".to_string();

        let committed = commit_candidate_to_directory(directory.path(), &replacement)
            .expect("commit candidate");

        assert!(committed.changed);
        assert_eq!(
            load_or_initialize_from_directory(directory.path()).expect("saved server"),
            replacement
        );
        let config = load_or_initialize_config(directory.path()).expect("profiles");
        assert_eq!(config.profiles.len(), 2);
        assert!(config
            .profiles
            .iter()
            .any(|profile| profile.server == initial));
        assert!(config
            .profiles
            .iter()
            .any(|profile| profile.server == replacement));
    }

    #[test]
    fn migrates_legacy_single_server_config() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let server = default_server();
        let legacy = serde_json::json!({
            "version": 1,
            "server": server,
        });
        std::fs::write(
            config_path(directory.path()),
            serde_json::to_vec_pretty(&legacy).expect("legacy json"),
        )
        .expect("write legacy config");

        let (config, migrated) =
            parse_config(&std::fs::read(config_path(directory.path())).expect("read legacy"))
                .expect("parse legacy");
        assert!(migrated);
        assert_eq!(config.version, 2);
        assert_eq!(config.profiles.len(), 1);
        assert_eq!(config.profiles[0].server, server);
        assert_eq!(
            load_or_initialize_from_directory(directory.path()).expect("migrated active"),
            server
        );
    }

    #[test]
    fn switches_between_saved_profiles() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut other = initial.clone();
        other.instance_id = "self-hosted-instance".to_string();
        other.display_name = "Team Notes".to_string();
        other.issuer = "https://notes.example.com".to_string();
        other.web_origin = "https://notes.example.com".to_string();
        other.api_origin = "https://notes.example.com".to_string();
        commit_candidate_to_directory(directory.path(), &other).expect("add profile");

        let mut config = load_or_initialize_config(directory.path()).expect("config");
        let index = find_profile_index(&config, &initial.instance_id, &initial.api_origin)
            .expect("initial profile");
        config.active_instance_id = config.profiles[index].server.instance_id.clone();
        write_config(directory.path(), &config).expect("switch");

        assert_eq!(
            load_or_initialize_from_directory(directory.path()).expect("switched"),
            initial
        );
    }

    #[test]
    fn remove_deletes_only_the_requested_profile() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut other = initial.clone();
        other.instance_id = "self-hosted-instance".to_string();
        other.display_name = "Team Notes".to_string();
        other.issuer = "https://notes.example.com".to_string();
        other.web_origin = "https://notes.example.com".to_string();
        other.api_origin = "https://notes.example.com".to_string();
        commit_candidate_to_directory(directory.path(), &other).expect("add profile");

        let mut deleted_origin = None;
        let active = remove_profile_from_directory(
            directory.path(),
            &other.instance_id,
            &other.api_origin,
            |server| {
                deleted_origin = Some(server.api_origin.clone());
                Ok(())
            },
        )
        .expect("remove profile");

        assert_eq!(deleted_origin.as_deref(), Some(other.api_origin.as_str()));
        assert_eq!(active, initial);
        let config = load_or_initialize_config(directory.path()).expect("remaining");
        assert_eq!(config.profiles.len(), 1);
        assert_eq!(config.profiles[0].server, initial);
    }

    #[test]
    fn remove_keeps_the_profile_when_credential_deletion_fails() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut other = initial.clone();
        other.instance_id = "self-hosted-instance".to_string();
        other.issuer = "https://notes.example.com".to_string();
        other.web_origin = "https://notes.example.com".to_string();
        other.api_origin = "https://notes.example.com".to_string();
        commit_candidate_to_directory(directory.path(), &other).expect("add profile");

        let error = remove_profile_from_directory(
            directory.path(),
            &other.instance_id,
            &other.api_origin,
            |_| Err("keyring unavailable".to_string()),
        )
        .expect_err("credential failure must stop remove");

        assert_eq!(error.code, "credential_cleanup_failed");
        let config = load_or_initialize_config(directory.path()).expect("unchanged");
        assert_eq!(config.profiles.len(), 2);
        assert_eq!(
            load_or_initialize_from_directory(directory.path()).expect("still active"),
            other
        );
    }

    #[test]
    fn snapshot_fields_round_trip_on_the_active_profile() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let server = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut config = load_or_initialize_config(directory.path()).expect("config");
        let index = find_profile_index(&config, &server.instance_id, &server.api_origin)
            .expect("active profile");
        config.profiles[index].workspaces = vec![DesktopServerWorkspaceSnapshot {
            id: "workspace-1".to_string(),
            name: "Acme".to_string(),
        }];
        config.profiles[index].last_active_workspace_id = Some("workspace-1".to_string());
        config.profiles[index].last_path = Some("/recents".to_string());
        write_config(directory.path(), &config).expect("write snapshot");

        let restored = load_or_initialize_config(directory.path()).expect("restored");
        assert_eq!(restored.profiles[0].workspaces[0].name, "Acme");
        assert_eq!(
            restored.profiles[0].last_active_workspace_id.as_deref(),
            Some("workspace-1")
        );
        assert_eq!(restored.profiles[0].last_path.as_deref(), Some("/recents"));
    }

    #[test]
    fn candidate_handles_are_independent_and_expire() {
        let state = DesktopServerCandidateState::default();
        let current = cloud_server();
        let fresh = DesktopServerCandidate {
            id: "fresh".to_string(),
            server: current.clone(),
            verified_at: Instant::now(),
        };
        let expired = DesktopServerCandidate {
            id: "expired".to_string(),
            server: current,
            verified_at: Instant::now() - SERVER_CANDIDATE_TTL - std::time::Duration::from_secs(1),
        };
        {
            let mut candidates = state.candidates.lock().expect("candidate lock");
            candidates.insert(fresh.id.clone(), fresh);
            candidates.insert(expired.id.clone(), expired);
        }

        assert!(state.get("fresh").is_ok());
        assert_eq!(
            state.get("expired").expect_err("expired candidate").code,
            "server_candidate_expired"
        );
        assert!(state.get("fresh").is_ok());
    }

    #[test]
    fn cloud_alias_matches_discovered_cloud_but_custom_instance_ids_remain_strict() {
        let cloud = cloud_server();
        let mut discovered_cloud = cloud.clone();
        discovered_cloud.instance_id = "cloud-database-instance".to_string();
        assert!(servers_refer_to_same_instance(&cloud, &discovered_cloud));

        let mut first = cloud.clone();
        first.instance_id = "instance-1".to_string();
        first.api_origin = "https://notes.example.com".to_string();
        first.issuer = first.api_origin.clone();
        first.web_origin = first.api_origin.clone();
        let mut second = first.clone();
        second.instance_id = "instance-2".to_string();
        assert!(!servers_refer_to_same_instance(&first, &second));
    }

    #[test]
    fn rejects_corrupt_configuration_without_silently_switching_to_cloud() {
        let directory = tempfile::tempdir().expect("temporary directory");
        std::fs::write(config_path(directory.path()), b"{not-json").expect("write corrupt config");

        let error = load_or_initialize_from_directory(directory.path())
            .expect_err("corrupt configuration must fail");
        assert_eq!(error.code, "server_configuration_error");
    }

    #[test]
    fn rejects_incompatible_protocols_and_required_desktop_updates() {
        let origin = parse_server_origin("https://notes.example.com").expect("origin");
        let mut discovery = DiscoveryDocument {
            server: super::DesktopServer {
                instance_id: "instance-1".to_string(),
                display_name: "Team Notes".to_string(),
                issuer: "https://notes.example.com".to_string(),
                web_origin: "https://notes.example.com".to_string(),
                api_origin: "https://notes.example.com".to_string(),
                protocol_version: 2,
                server_version: "1.0.0".to_string(),
                minimum_desktop_version: "0.0.1".to_string(),
            },
            desktop_authorization: DesktopAuthorizationEndpoints {
                authorization_endpoint: "https://notes.example.com/desktop/authorize".to_string(),
                token_endpoint: "https://notes.example.com/api/auth/desktop/token".to_string(),
            },
        };

        let protocol_error = validate_discovery_document(&origin, &discovery)
            .expect_err("protocol mismatch must fail");
        assert_eq!(protocol_error.code, "incompatible_protocol");

        discovery.server.protocol_version = 1;
        discovery.server.minimum_desktop_version = "999.0.0".to_string();
        let update_error = validate_discovery_document(&origin, &discovery)
            .expect_err("required update must fail");
        assert_eq!(update_error.code, "desktop_update_required");
    }

    #[tokio::test]
    async fn verifies_discovery_over_loopback_http() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener");
        let address = listener.local_addr().expect("listener address");
        let origin = format!("http://{address}");
        let response_origin = origin.clone();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("connection");
            let mut request = vec![0_u8; 2048];
            let size = stream.read(&mut request).await.expect("request");
            let request = String::from_utf8_lossy(&request[..size]);
            assert!(request.starts_with("GET /.well-known/zilobase HTTP/1.1"));

            let body = serde_json::json!({
                "instanceId": "instance-1",
                "displayName": "Local Zilobase",
                "issuer": response_origin,
                "webOrigin": response_origin,
                "apiOrigin": response_origin,
                "protocolVersion": 1,
                "serverVersion": env!("CARGO_PKG_VERSION"),
                "minimumDesktopVersion": env!("CARGO_PKG_VERSION"),
                "desktopAuthorization": {
                    "authorizationEndpoint": format!("{response_origin}/desktop/authorize"),
                    "tokenEndpoint": format!("{response_origin}/api/auth/desktop/token"),
                },
            })
            .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len(),
            );
            stream
                .write_all(response.as_bytes())
                .await
                .expect("response");
        });

        let verified = verify_desktop_server(&origin)
            .await
            .expect("verified server");
        server.await.expect("mock server");

        assert_eq!(verified.instance_id, "instance-1");
        assert_eq!(verified.api_origin, origin);
    }

    #[tokio::test]
    async fn accepts_built_in_cloud_origins_without_discovery() {
        for value in [
            super::CLOUD_API_ORIGIN,
            super::CLOUD_WEB_ORIGIN,
            "https://api.zilobase.com/",
            "https://app.zilobase.com/",
        ] {
            let verified = verify_desktop_server(value)
                .await
                .unwrap_or_else(|error| panic!("{value}: {error:?}"));
            #[cfg(debug_assertions)]
            assert_eq!(verified, development_server(), "{value}");
            #[cfg(not(debug_assertions))]
            assert_eq!(verified, cloud_server(), "{value}");
        }
    }
}
