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
use url::{Host, Url};

const CONFIG_FILE_NAME: &str = "desktop-server.json";
const CONFIG_VERSION: u8 = 1;
const DISCOVERY_PATH: &str = "/.well-known/zilobase";
const MAX_DISCOVERY_BYTES: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const SERVER_CANDIDATE_TTL: Duration = Duration::from_secs(5 * 60);
const CLOUD_INSTANCE_ID: &str = "zilobase-cloud";
const CLOUD_WEB_ORIGIN: &str = "https://app.zilobase.com";
const CLOUD_API_ORIGIN: &str = "https://api.zilobase.com";

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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopServerConfig {
    version: u8,
    server: DesktopServer,
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
    let result = commit_candidate_to_directory(&directory, &candidate.server, |old_server| {
        crate::delete_server_keyring_credentials(old_server)
    })?;
    state.discard(&candidate_id)?;
    Ok(result)
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

fn is_cloud_origin(origin: &Url) -> bool {
    let value = origin.as_str().trim_end_matches('/');
    value == CLOUD_API_ORIGIN || value == CLOUD_WEB_ORIGIN
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

fn random_candidate_id() -> Result<String, DesktopServerError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| {
        DesktopServerError::configuration("A secure server candidate could not be created.")
    })?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

async fn verify_desktop_server(value: &str) -> Result<DesktopServer, DesktopServerError> {
    let origin = parse_server_origin(value)?;
    if is_cloud_origin(&origin) {
        return Ok(cloud_server());
    }
    let discovery_url = origin
        .join(DISCOVERY_PATH)
        .map_err(|_| DesktopServerError::invalid_metadata("The discovery URL is invalid."))?;
    let client = reqwest::Client::builder()
        .connect_timeout(REQUEST_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(Policy::none())
        .user_agent(format!("Zilobase Desktop/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| {
            DesktopServerError::new(
                "network_error",
                "The server connection could not be prepared.",
            )
        })?;
    let response = client
        .get(discovery_url)
        .send()
        .await
        .map_err(classify_request_error)?;

    if response.status().is_redirection() {
        return Err(DesktopServerError::invalid_metadata(
            "The server redirected its discovery document. Enter its canonical URL instead.",
        ));
    }

    if response.status() != StatusCode::OK {
        return Err(DesktopServerError::new(
            "discovery_unavailable",
            format!(
                "This URL did not return Zilobase server metadata (HTTP {}).",
                response.status().as_u16()
            ),
        ));
    }

    if response.content_length().unwrap_or(0) > MAX_DISCOVERY_BYTES as u64 {
        return Err(DesktopServerError::invalid_metadata(
            "The server metadata response is too large.",
        ));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !content_type
        .split(';')
        .next()
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"))
    {
        return Err(DesktopServerError::invalid_metadata(
            "The server discovery response is not JSON.",
        ));
    }

    let bytes = response.bytes().await.map_err(classify_request_error)?;
    if bytes.len() > MAX_DISCOVERY_BYTES {
        return Err(DesktopServerError::invalid_metadata(
            "The server metadata response is too large.",
        ));
    }

    let discovery: DiscoveryDocument = serde_json::from_slice(&bytes)
        .map_err(|_| DesktopServerError::invalid_metadata("The server metadata is malformed."))?;
    validate_discovery_document(&origin, &discovery)?;

    Ok(discovery.server)
}

fn parse_server_origin(value: &str) -> Result<Url, DesktopServerError> {
    let value = value.trim();
    let url = Url::parse(value).map_err(|_| {
        DesktopServerError::new(
            "invalid_server_url",
            "Enter a complete server URL such as https://notes.example.com.",
        )
    })?;

    if url.cannot_be_a_base()
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DesktopServerError::new(
            "invalid_server_url",
            "Enter only the server origin, without credentials, a path, a query, or a fragment.",
        ));
    }

    match url.scheme() {
        "https" => Ok(canonical_origin(&url)),
        "http" if is_loopback_url(&url) => Ok(canonical_origin(&url)),
        "http" => Err(DesktopServerError::new(
            "https_required",
            "HTTPS is required. Plain HTTP is accepted only for a loopback development server.",
        )),
        _ => Err(DesktopServerError::new(
            "invalid_server_url",
            "The server URL must use HTTPS, or HTTP for a loopback development server.",
        )),
    }
}

fn validate_discovery_document(
    requested_origin: &Url,
    discovery: &DiscoveryDocument,
) -> Result<(), DesktopServerError> {
    let server = &discovery.server;

    if server.instance_id.trim().is_empty() || server.instance_id.len() > 128 {
        return Err(DesktopServerError::invalid_metadata(
            "The server instance identity is invalid.",
        ));
    }
    if server.display_name.trim().is_empty() || server.display_name.len() > 100 {
        return Err(DesktopServerError::invalid_metadata(
            "The server display name is invalid.",
        ));
    }
    if server.protocol_version != 1 {
        return Err(DesktopServerError::new(
            "incompatible_protocol",
            format!(
                "This server uses desktop protocol version {}. This app supports version 1.",
                server.protocol_version
            ),
        ));
    }

    let api_origin = parse_metadata_origin(&server.api_origin, "API")?;
    parse_metadata_origin(&server.web_origin, "web")?;
    if api_origin != *requested_origin {
        return Err(DesktopServerError::new(
            "canonical_origin_mismatch",
            format!(
                "This server's canonical API URL is {}. Enter that URL instead.",
                api_origin.as_str().trim_end_matches('/')
            ),
        ));
    }
    if server.issuer != server.api_origin {
        return Err(DesktopServerError::invalid_metadata(
            "The server issuer does not match its canonical API origin.",
        ));
    }

    Version::parse(&server.server_version).map_err(|_| {
        DesktopServerError::invalid_metadata("The server version is not a semantic version.")
    })?;
    let minimum = Version::parse(&server.minimum_desktop_version).map_err(|_| {
        DesktopServerError::invalid_metadata(
            "The minimum desktop version is not a semantic version.",
        )
    })?;
    let current = Version::parse(env!("CARGO_PKG_VERSION"))
        .expect("the desktop package version must be semantic");
    if current < minimum {
        return Err(DesktopServerError::new(
            "desktop_update_required",
            format!(
                "This server requires Zilobase Desktop {} or newer. Update the app and try again.",
                minimum
            ),
        ));
    }

    let expected_authorization = api_origin
        .join("/desktop/authorize")
        .expect("a canonical origin accepts an absolute path");
    let expected_token = api_origin
        .join("/api/auth/desktop/token")
        .expect("a canonical origin accepts an absolute path");
    if discovery.desktop_authorization.authorization_endpoint != expected_authorization.as_str()
        || discovery.desktop_authorization.token_endpoint != expected_token.as_str()
    {
        return Err(DesktopServerError::invalid_metadata(
            "The desktop authorization endpoints are not canonical.",
        ));
    }

    Ok(())
}

fn parse_metadata_origin(value: &str, label: &str) -> Result<Url, DesktopServerError> {
    let parsed = parse_server_origin(value).map_err(|_| {
        DesktopServerError::invalid_metadata(format!("The server {label} origin is invalid."))
    })?;
    if parsed.as_str().trim_end_matches('/') != value {
        return Err(DesktopServerError::invalid_metadata(format!(
            "The server {label} origin is not canonical."
        )));
    }
    Ok(parsed)
}

fn canonical_origin(url: &Url) -> Url {
    Url::parse(&url.origin().ascii_serialization())
        .expect("a URL with a host always has a valid origin")
}

fn is_loopback_url(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address == Ipv4Addr::LOCALHOST,
        Some(Host::Ipv6(address)) => address == Ipv6Addr::LOCALHOST,
        None => false,
    }
}

fn classify_request_error(error: reqwest::Error) -> DesktopServerError {
    let mut descriptions = vec![error.to_string().to_ascii_lowercase()];
    let mut source = error.source();
    while let Some(cause) = source {
        descriptions.push(cause.to_string().to_ascii_lowercase());
        source = cause.source();
    }
    let description = descriptions.join(" ");
    if description.contains("certificate")
        || description.contains("tls")
        || description.contains("ssl")
    {
        return DesktopServerError::new(
            "tls_error",
            "The server's TLS certificate could not be verified. Use a certificate trusted by this computer.",
        );
    }

    if error.is_timeout() {
        return DesktopServerError::new(
            "server_timeout",
            "The server did not respond within 15 seconds.",
        );
    }

    DesktopServerError::new(
        "network_error",
        "The server could not be reached. Check the URL, DNS, firewall, and server status.",
    )
}

fn cloud_server() -> DesktopServer {
    DesktopServer {
        instance_id: CLOUD_INSTANCE_ID.to_string(),
        display_name: "Zilobase Cloud".to_string(),
        issuer: CLOUD_API_ORIGIN.to_string(),
        web_origin: CLOUD_WEB_ORIGIN.to_string(),
        api_origin: CLOUD_API_ORIGIN.to_string(),
        protocol_version: 1,
        server_version: env!("CARGO_PKG_VERSION").to_string(),
        minimum_desktop_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn load_or_initialize_from_directory(
    directory: &Path,
) -> Result<DesktopServer, DesktopServerError> {
    let path = config_path(directory);
    match fs::read(&path) {
        Ok(bytes) => parse_config(&bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let server = cloud_server();
            save_to_directory(directory, &server)?;
            Ok(server)
        }
        Err(_) => Err(DesktopServerError::configuration(
            "The saved desktop server configuration could not be read.",
        )),
    }
}

fn parse_config(bytes: &[u8]) -> Result<DesktopServer, DesktopServerError> {
    if bytes.len() > MAX_DISCOVERY_BYTES {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration is too large.",
        ));
    }
    let config: DesktopServerConfig = serde_json::from_slice(bytes).map_err(|_| {
        DesktopServerError::configuration("The saved desktop server configuration is malformed.")
    })?;
    if config.version != CONFIG_VERSION {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration uses an unsupported version.",
        ));
    }
    validate_persisted_server(&config.server)?;
    Ok(config.server)
}

fn validate_persisted_server(server: &DesktopServer) -> Result<(), DesktopServerError> {
    if server.protocol_version != 1
        || server.instance_id.trim().is_empty()
        || server.display_name.trim().is_empty()
        || server.issuer != server.api_origin
        || parse_metadata_origin(&server.api_origin, "API").is_err()
        || parse_metadata_origin(&server.web_origin, "web").is_err()
        || Version::parse(&server.server_version).is_err()
        || Version::parse(&server.minimum_desktop_version).is_err()
    {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration is invalid.",
        ));
    }
    Ok(())
}

fn commit_candidate_to_directory<F>(
    directory: &Path,
    candidate: &DesktopServer,
    delete_old_credentials: F,
) -> Result<DesktopServerCommit, DesktopServerError>
where
    F: FnOnce(&DesktopServer) -> Result<(), String>,
{
    let current = load_or_initialize_from_directory(directory)?;
    let changed = !servers_refer_to_same_instance(&current, candidate);

    save_to_directory(directory, candidate)?;
    if changed {
        if delete_old_credentials(&current).is_err() {
            let _ = save_to_directory(directory, &current);
            return Err(DesktopServerError::new(
                "credential_cleanup_failed",
                "The previous server credentials could not be removed. The server was not changed.",
            ));
        }
    }

    Ok(DesktopServerCommit {
        changed,
        server: candidate.clone(),
    })
}

fn servers_refer_to_same_instance(current: &DesktopServer, candidate: &DesktopServer) -> bool {
    if current.instance_id == candidate.instance_id
        && current.issuer == candidate.issuer
        && current.api_origin == candidate.api_origin
    {
        return true;
    }

    current.instance_id == CLOUD_INSTANCE_ID
        && is_cloud_server(current)
        && candidate.api_origin == CLOUD_API_ORIGIN
        && candidate.issuer == CLOUD_API_ORIGIN
}

fn save_to_directory(directory: &Path, server: &DesktopServer) -> Result<(), DesktopServerError> {
    fs::create_dir_all(directory).map_err(|_| {
        DesktopServerError::configuration("The app configuration directory could not be created.")
    })?;
    let config = DesktopServerConfig {
        version: CONFIG_VERSION,
        server: server.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&config).map_err(|_| {
        DesktopServerError::configuration("The desktop server configuration could not be encoded.")
    })?;
    let mut temporary = NamedTempFile::new_in(directory).map_err(|_| {
        DesktopServerError::configuration(
            "A temporary desktop server configuration could not be created.",
        )
    })?;
    temporary.write_all(&bytes).map_err(|_| {
        DesktopServerError::configuration("The desktop server configuration could not be written.")
    })?;
    temporary.write_all(b"\n").map_err(|_| {
        DesktopServerError::configuration("The desktop server configuration could not be written.")
    })?;
    temporary.as_file().sync_all().map_err(|_| {
        DesktopServerError::configuration("The desktop server configuration could not be saved.")
    })?;
    temporary.persist(config_path(directory)).map_err(|_| {
        DesktopServerError::configuration("The desktop server configuration could not be saved.")
    })?;
    Ok(())
}

fn config_path(directory: &Path) -> PathBuf {
    directory.join(CONFIG_FILE_NAME)
}

#[cfg(test)]
mod tests {
    use super::{
        cloud_server, commit_candidate_to_directory, config_path,
        load_or_initialize_from_directory, parse_server_origin, save_to_directory,
        servers_refer_to_same_instance, validate_discovery_document, verify_desktop_server,
        DesktopAuthorizationEndpoints, DesktopServerCandidate, DesktopServerCandidateState,
        DiscoveryDocument, SERVER_CANDIDATE_TTL,
    };
    use std::time::Instant;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

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
    fn initializes_cloud_and_persists_server_replacements() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        assert_eq!(initial, cloud_server());
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
    fn commits_a_verified_candidate_only_after_old_credentials_are_deleted() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut replacement = initial.clone();
        replacement.instance_id = "self-hosted-instance".to_string();
        replacement.display_name = "Team Notes".to_string();
        replacement.issuer = "https://notes.example.com".to_string();
        replacement.web_origin = "https://notes.example.com".to_string();
        replacement.api_origin = "https://notes.example.com".to_string();

        let mut deleted_origin = None;
        let committed =
            commit_candidate_to_directory(directory.path(), &replacement, |old_server| {
                deleted_origin = Some(old_server.api_origin.clone());
                Ok(())
            })
            .expect("commit candidate");

        assert!(committed.changed);
        assert_eq!(deleted_origin.as_deref(), Some(initial.api_origin.as_str()));
        assert_eq!(
            load_or_initialize_from_directory(directory.path()).expect("saved server"),
            replacement
        );
    }

    #[test]
    fn rolls_back_the_server_file_when_credential_deletion_fails() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let initial = load_or_initialize_from_directory(directory.path()).expect("initial server");
        let mut replacement = initial.clone();
        replacement.instance_id = "self-hosted-instance".to_string();
        replacement.issuer = "https://notes.example.com".to_string();
        replacement.web_origin = "https://notes.example.com".to_string();
        replacement.api_origin = "https://notes.example.com".to_string();

        let error = commit_candidate_to_directory(directory.path(), &replacement, |_| {
            Err("keyring unavailable".to_string())
        })
        .expect_err("credential failure must stop replacement");

        assert_eq!(error.code, "credential_cleanup_failed");
        assert_eq!(
            load_or_initialize_from_directory(directory.path()).expect("rolled back server"),
            initial
        );
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
            assert_eq!(verified, cloud_server(), "{value}");
        }
    }
}
