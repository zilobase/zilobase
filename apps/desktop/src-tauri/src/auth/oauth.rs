use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::Mutex,
    time::Duration,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::watch,
    time::{timeout, Instant},
};
use url::Url;

mod loopback;
mod token_exchange;

use loopback::*;
use token_exchange::*;

use super::callback::{constant_time_eq, parse_callback, ParsedCallback, CALLBACK_PATH};
use crate::{
    auth::keyring::{
        get_server_keyring_value, set_server_keyring_value, LEGACY_AUTH_ACCOUNT,
        LEGACY_AUTH_OWNER_ACCOUNT,
    },
    server::{
        is_cloud_server, is_development_server, load_or_initialize_desktop_server, DesktopServer,
    },
};

const DESKTOP_CLIENT_ID: &str = "zilobase-desktop";
const CONNECTED_PATH: &str = "/desktop/connected";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_CALLBACK_REQUEST_BYTES: usize = 8 * 1024;
const MAX_AUTH_RESPONSE_BYTES: usize = 64 * 1024;
const MAX_SESSION_TOKEN_BYTES: usize = 8 * 1024;

#[derive(Default)]
pub(crate) struct DesktopOAuthState {
    active: Mutex<Option<ActiveAttempt>>,
}

impl DesktopOAuthState {
    fn begin_attempt(
        &self,
        id: String,
        cancel: watch::Sender<bool>,
    ) -> Result<(), DesktopOAuthError> {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active.is_some() {
            return Err(DesktopOAuthError::already_in_progress());
        }
        *active = Some(ActiveAttempt { id, cancel });
        Ok(())
    }

    fn cancel_attempt(&self) {
        let attempt = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take();
        if let Some(attempt) = attempt {
            let _ = attempt.cancel.send(true);
        }
    }

    fn finish_attempt(&self, attempt_id: &str) {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active
            .as_ref()
            .is_some_and(|attempt| attempt.id == attempt_id)
        {
            *active = None;
        }
    }
}

struct ActiveAttempt {
    id: String,
    cancel: watch::Sender<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopOAuthSuccess {
    status: &'static str,
}

#[derive(Debug, Serialize)]
pub(crate) struct DesktopOAuthError {
    code: &'static str,
    message: &'static str,
}

impl DesktopOAuthError {
    fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    fn already_in_progress() -> Self {
        Self::new(
            "already_in_progress",
            "A browser sign-in is already in progress.",
        )
    }

    fn browser_open_failed() -> Self {
        Self::new(
            "browser_open_failed",
            "Zilobase could not open the system browser.",
        )
    }

    fn callback_rejected() -> Self {
        Self::new(
            "callback_rejected",
            "The browser returned an invalid sign-in response.",
        )
    }

    fn callback_timeout() -> Self {
        Self::new(
            "callback_timeout",
            "Browser sign-in timed out. Please try again.",
        )
    }

    fn cancelled() -> Self {
        Self::new("cancelled", "Browser sign-in was cancelled.")
    }

    fn configuration_failed() -> Self {
        Self::new(
            "configuration_failed",
            "The selected server has invalid desktop authorization settings.",
        )
    }

    fn credential_store_failed() -> Self {
        Self::new(
            "credential_store_failed",
            "Zilobase could not securely save the desktop session.",
        )
    }

    fn issuer_mismatch() -> Self {
        Self::new(
            "issuer_mismatch",
            "The browser response came from a different Zilobase server.",
        )
    }

    fn provider_denied() -> Self {
        Self::new("access_denied", "Browser sign-in was cancelled or denied.")
    }

    fn server_sign_in_failed() -> Self {
        Self::new(
            "server_sign_in_failed",
            "The selected Zilobase server could not complete sign-in.",
        )
    }

    fn state_mismatch() -> Self {
        Self::new(
            "state_mismatch",
            "The browser sign-in response did not match this request.",
        )
    }

    fn token_exchange_failed() -> Self {
        Self::new(
            "token_exchange_failed",
            "The selected Zilobase server rejected the authorization code.",
        )
    }
}

struct OAuthRequest {
    authorization_url: Url,
    pkce_verifier: String,
    redirect_uri: String,
    state: String,
}

#[derive(Debug)]
struct ValidCallback {
    code: String,
}

#[derive(Debug, Deserialize)]
struct DesktopTokenResponse {
    access_token: String,
    expires_at: String,
    instance_id: String,
    issuer: String,
    token_type: String,
    user: DesktopTokenUser,
}

#[derive(Debug, Deserialize)]
struct DesktopTokenUser {
    id: String,
}

struct SessionCredentials {
    owner: String,
    token: String,
}

#[tauri::command]
pub(crate) async fn start_browser_authorization(
    app: AppHandle,
    state: tauri::State<'_, DesktopOAuthState>,
) -> Result<DesktopOAuthSuccess, DesktopOAuthError> {
    let attempt_id = random_urlsafe(18)?;
    let (cancel, cancel_rx) = watch::channel(false);

    state.begin_attempt(attempt_id.clone(), cancel)?;

    log::info!(
        target: "zilobase::oauth",
        "[diagnostics] event=desktop_oauth.started status=started"
    );

    let result = run_browser_authorization(&app, cancel_rx).await;
    state.finish_attempt(&attempt_id);

    match &result {
        Ok(_) => log::info!(
            target: "zilobase::oauth",
            "[diagnostics] event=desktop_oauth.completed status=success"
        ),
        Err(error) if error.code == "cancelled" => log::info!(
            target: "zilobase::oauth",
            "[diagnostics] event=desktop_oauth.completed status=cancelled"
        ),
        Err(error) if error.code == "callback_timeout" => log::warn!(
            target: "zilobase::oauth",
            "[diagnostics] event=desktop_oauth.completed status=timeout error_type=callback_timeout"
        ),
        Err(error) => log::error!(
            target: "zilobase::oauth",
            "[diagnostics] event=desktop_oauth.completed status=error error_type={}",
            error.code
        ),
    }

    focus_main_window(&app);
    result
}

#[tauri::command]
pub(crate) fn cancel_browser_authorization(
    state: tauri::State<'_, DesktopOAuthState>,
) -> Result<(), DesktopOAuthError> {
    state.cancel_attempt();
    Ok(())
}

#[tauri::command]
pub(crate) fn open_mail_authorization_url(
    app: AppHandle,
    authorization_url: String,
) -> Result<(), DesktopOAuthError> {
    let url = validate_mail_authorization_url(&authorization_url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| DesktopOAuthError::browser_open_failed())
}

fn validate_mail_authorization_url(authorization_url: &str) -> Result<Url, DesktopOAuthError> {
    let url =
        Url::parse(authorization_url).map_err(|_| DesktopOAuthError::configuration_failed())?;
    if url.scheme() != "https"
        || url.host_str() != Some("accounts.google.com")
        || url.path() != "/o/oauth2/v2/auth"
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(DesktopOAuthError::configuration_failed());
    }
    Ok(url)
}

async fn run_browser_authorization(
    app: &AppHandle,
    mut cancel: watch::Receiver<bool>,
) -> Result<DesktopOAuthSuccess, DesktopOAuthError> {
    let server = load_or_initialize_desktop_server(app)
        .map_err(|_| DesktopOAuthError::configuration_failed())?;
    let (listener, redirect_uri) = bind_loopback().await?;
    let request = build_oauth_request(&server, redirect_uri)?;
    let completion_url = hosted_completion_url(&server)?;

    app.opener()
        .open_url(request.authorization_url.as_str(), None::<&str>)
        .map_err(|_| DesktopOAuthError::browser_open_failed())?;

    let callback = wait_for_callback(
        &listener,
        &request.state,
        &server.issuer,
        &completion_url,
        &mut cancel,
        CALLBACK_TIMEOUT,
    )
    .await?;
    let credentials =
        exchange_session_credentials(&request, &callback.code, &server, &mut cancel).await?;

    persist_session_credentials(&server, &credentials.token, &credentials.owner)?;
    Ok(DesktopOAuthSuccess { status: "success" })
}

const AUTH_PAGE_STYLES: &str = r#"/* COLOR_TOKENS_START: generated by scripts/colors/sync-color-tokens.mjs; do not edit */:root{color-scheme:light;--zb-color-surface-background-canvas:#ffffff;--zb-color-surface-background-muted:#f4f4f5;--zb-color-content-text-primary:#18181b;--zb-color-content-text-secondary:#5f5f68;--zb-color-border-stroke-default:#e4e4e7;--zb-color-control-background-default:#ffffff;--zb-color-control-border-default:var(--zb-color-border-stroke-default);--zb-color-action-background-primary:#2563eb;--zb-color-action-background-primary-hover:#1d4ed8;--zb-color-action-text-on-primary:#ffffff;--zb-color-action-text-link:#1d4ed8;--zb-color-action-background-secondary:var(--zb-color-surface-background-muted);--zb-color-action-text-on-secondary:var(--zb-color-content-text-primary);--zb-color-action-background-neutral-hover:#f0f0f2}@media (prefers-color-scheme:dark){:root{color-scheme:dark;--zb-color-surface-background-canvas:#111113;--zb-color-surface-background-muted:#1f1f23;--zb-color-content-text-primary:#f4f4f5;--zb-color-content-text-secondary:#a1a1aa;--zb-color-border-stroke-default:#2c2c31;--zb-color-control-background-default:#1f1f23;--zb-color-control-border-default:var(--zb-color-border-stroke-default);--zb-color-action-background-primary:#2563eb;--zb-color-action-background-primary-hover:#1d4ed8;--zb-color-action-text-on-primary:#ffffff;--zb-color-action-text-link:#60a5fa;--zb-color-action-background-secondary:var(--zb-color-surface-background-muted);--zb-color-action-text-on-secondary:var(--zb-color-content-text-primary);--zb-color-action-background-neutral-hover:#25252a}}/* COLOR_TOKENS_END */*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:var(--zb-color-surface-background-canvas);color:var(--zb-color-content-text-primary);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;-webkit-font-smoothing:antialiased}@media (min-width:768px){body{padding:2.5rem}}main{width:100%;max-width:24rem;display:flex;flex-direction:column;gap:1.5rem}.brand{display:flex;align-items:center;gap:.5rem;font-weight:500}.logo{display:block;height:1.75rem;width:auto;color:var(--zb-color-content-text-primary)}h1{margin:0;font-size:1.125rem;line-height:1.75rem;font-weight:600}p{margin:.25rem 0 0;font-size:.75rem;line-height:1.625;font-weight:400;color:var(--zb-color-content-text-secondary)}"#;

fn random_urlsafe(byte_count: usize) -> Result<String, DesktopOAuthError> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::fill(&mut bytes).map_err(|_| DesktopOAuthError::configuration_failed())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bind_loopback, build_oauth_request, constant_time_eq, exchange_session_credentials,
        hosted_completion_url, parse_callback, validate_mail_authorization_url,
        validate_token_response, DesktopTokenResponse, DesktopTokenUser, ParsedCallback,
        CALLBACK_PATH, CONNECTED_PATH,
    };
    use crate::server::DesktopServer;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn server(api_origin: &str) -> DesktopServer {
        DesktopServer {
            api_origin: api_origin.to_string(),
            display_name: "Example".to_string(),
            instance_id: "instance-1".to_string(),
            issuer: api_origin.to_string(),
            minimum_desktop_version: "0.0.1".to_string(),
            protocol_version: 1,
            server_version: "0.0.1".to_string(),
            web_origin: api_origin.to_string(),
        }
    }

    #[test]
    fn successful_callback_returns_to_the_hosted_connected_page() {
        let selected = server("https://notes.example.com");
        let completion = hosted_completion_url(&selected).expect("completion url");

        assert_eq!(
            completion,
            format!("https://notes.example.com{CONNECTED_PATH}")
        );
        assert!(!completion.contains("code="));
        assert!(!completion.contains("oauth/complete"));
    }

    #[test]
    fn mail_authorization_only_allows_the_exact_google_endpoint() {
        assert!(validate_mail_authorization_url(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=gmail"
        )
        .is_ok());
        assert!(validate_mail_authorization_url(
            "https://accounts.google.com.evil.example/o/oauth2/v2/auth"
        )
        .is_err());
        assert!(validate_mail_authorization_url(
            "https://accounts.google.com/o/oauth2/v2/auth/extra"
        )
        .is_err());
        assert!(
            validate_mail_authorization_url("http://accounts.google.com/o/oauth2/v2/auth").is_err()
        );
    }

    #[test]
    fn authorization_request_uses_server_pkce_state_and_loopback() {
        let request = build_oauth_request(
            &server("https://notes.example.com"),
            format!("http://127.0.0.1:43123{CALLBACK_PATH}"),
        )
        .expect("request");
        let params: std::collections::HashMap<_, _> = request
            .authorization_url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();

        assert_eq!(
            request.authorization_url.origin().ascii_serialization(),
            "https://notes.example.com"
        );
        assert_eq!(request.authorization_url.path(), "/desktop/authorize");
        assert_eq!(
            params.get("client_id").map(String::as_str),
            Some("zilobase-desktop")
        );
        assert_eq!(
            params.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(params.get("state"), Some(&request.state));
        assert!(request.pkce_verifier.len() >= 43);
        assert_ne!(params.get("code_challenge"), Some(&request.pkce_verifier));
        assert!(!params.contains_key("client_secret"));
    }

    #[test]
    fn every_authorization_request_has_unique_secrets() {
        let selected = server("https://notes.example.com");
        let first =
            build_oauth_request(&selected, format!("http://127.0.0.1:43123{CALLBACK_PATH}"))
                .expect("first request");
        let second =
            build_oauth_request(&selected, format!("http://127.0.0.1:43124{CALLBACK_PATH}"))
                .expect("second request");

        assert_ne!(first.state, second.state);
        assert_ne!(first.pkce_verifier, second.pkce_verifier);
    }

    #[tokio::test]
    async fn loopback_listeners_use_ephemeral_ports() {
        let (first, first_redirect) = bind_loopback().await.expect("first listener");
        let (second, second_redirect) = bind_loopback().await.expect("second listener");

        assert_ne!(first.local_addr().expect("first address").port(), 0);
        assert_ne!(second.local_addr().expect("second address").port(), 0);
        assert_ne!(first_redirect, second_redirect);
        assert!(first
            .local_addr()
            .expect("first address")
            .ip()
            .is_loopback());
        assert!(second
            .local_addr()
            .expect("second address")
            .ip()
            .is_loopback());
    }

    #[test]
    fn duplicate_start_is_rejected_and_cancel_allows_retry() {
        let state = super::DesktopOAuthState::default();
        let (first_cancel, mut first_cancelled) = tokio::sync::watch::channel(false);
        state
            .begin_attempt("first".to_string(), first_cancel)
            .expect("first attempt");

        let (duplicate_cancel, _) = tokio::sync::watch::channel(false);
        let duplicate = state
            .begin_attempt("duplicate".to_string(), duplicate_cancel)
            .expect_err("duplicate must fail");
        assert_eq!(duplicate.code, "already_in_progress");

        state.cancel_attempt();
        assert!(*first_cancelled.borrow_and_update());
        let (retry_cancel, _) = tokio::sync::watch::channel(false);
        state
            .begin_attempt("retry".to_string(), retry_cancel)
            .expect("retry after cancellation");
    }

    #[tokio::test]
    async fn exchanges_code_and_verifier_only_with_selected_server() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock listener");
        let address = listener.local_addr().expect("mock address");
        let selected = server(&format!("http://{address}"));
        let response_issuer = selected.issuer.clone();
        let mock = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("mock connection");
            let request = read_mock_request(&mut stream).await;
            let body = format!(
                r#"{{"access_token":"zilobase-session","expires_at":"2026-08-21T00:00:00.000Z","instance_id":"instance-1","issuer":"{response_issuer}","token_type":"Bearer","user":{{"id":"user-123"}}}}"#,
            );
            let reply = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream
                .write_all(reply.as_bytes())
                .await
                .expect("mock reply");
            request
        });
        let request = build_oauth_request(
            &selected,
            "http://127.0.0.1:43123/oauth/callback".to_string(),
        )
        .expect("authorization request");
        let (_cancel_sender, mut cancel) = tokio::sync::watch::channel(false);
        let credentials = exchange_session_credentials(
            &request,
            "authorization-code-value-that-is-long-enough",
            &selected,
            &mut cancel,
        )
        .await
        .expect("session exchange");
        let received = mock.await.expect("mock server");
        let form: std::collections::HashMap<_, _> =
            url::form_urlencoded::parse(request_body(&received).as_bytes())
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect();

        assert_eq!(credentials.owner, "user-123");
        assert_eq!(credentials.token, "zilobase-session");
        assert_eq!(form.get("code_verifier"), Some(&request.pkce_verifier));
        assert_eq!(
            form.get("client_id").map(String::as_str),
            Some("zilobase-desktop")
        );
        assert!(!form.contains_key("client_secret"));
    }

    #[test]
    fn token_response_requires_matching_issuer_and_instance() {
        let selected = server("https://notes.example.com");
        let mut response = DesktopTokenResponse {
            access_token: "token".to_string(),
            expires_at: "2026-08-21T00:00:00.000Z".to_string(),
            instance_id: "instance-1".to_string(),
            issuer: "https://attacker.example.com".to_string(),
            token_type: "Bearer".to_string(),
            user: DesktopTokenUser {
                id: "user-1".to_string(),
            },
        };

        assert_eq!(
            validate_token_response(&response, &selected)
                .expect_err("issuer mismatch")
                .code,
            "issuer_mismatch"
        );

        response.issuer = selected.issuer.clone();
        response.instance_id = "other-instance".to_string();
        assert_eq!(
            validate_token_response(&response, &selected)
                .expect_err("instance mismatch")
                .code,
            "issuer_mismatch"
        );

        let cloud = server("https://api.zilobase.com");
        response.issuer = cloud.issuer.clone();
        validate_token_response(&response, &cloud)
            .expect("the built-in Cloud alias accepts the discovered Cloud identity");

        let mut local = server("http://localhost:3000");
        local.instance_id = "zilobase-dev".to_string();
        response.issuer = local.issuer.clone();
        response.instance_id = "database-instance".to_string();
        validate_token_response(&response, &local)
            .expect("the local debug alias accepts the discovered local identity");
    }

    #[test]
    fn callback_requires_matching_state_issuer_and_code() {
        let valid = b"GET /oauth/callback?code=authorization-code&state=expected&iss=https%3A%2F%2Fnotes.example.com HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert!(matches!(
            parse_callback(valid, "expected", "https://notes.example.com"),
            ParsedCallback::Valid(code) if code == "authorization-code"
        ));

        let wrong_state = b"GET /oauth/callback?code=authorization-code&state=wrong&iss=https%3A%2F%2Fnotes.example.com HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(wrong_state, "expected", "https://notes.example.com"),
            ParsedCallback::StateMismatch
        ));

        let wrong_issuer = b"GET /oauth/callback?code=authorization-code&state=expected&iss=https%3A%2F%2Fattacker.example.com HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(wrong_issuer, "expected", "https://notes.example.com"),
            ParsedCallback::IssuerMismatch
        ));
    }

    #[tokio::test]
    async fn callback_wait_honors_timeout_and_cancellation() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener");
        let (_sender, mut receiver) = tokio::sync::watch::channel(false);
        let timeout_error = super::wait_for_callback(
            &listener,
            "state",
            "https://notes.example.com",
            "https://notes.example.com/desktop/connected",
            &mut receiver,
            std::time::Duration::from_millis(10),
        )
        .await
        .expect_err("timeout");
        assert_eq!(timeout_error.code, "callback_timeout");

        let (sender, mut receiver) = tokio::sync::watch::channel(false);
        sender.send(true).expect("cancel");
        let cancelled = super::wait_for_callback(
            &listener,
            "state",
            "https://notes.example.com",
            "https://notes.example.com/desktop/connected",
            &mut receiver,
            std::time::Duration::from_secs(1),
        )
        .await
        .expect_err("cancelled");
        assert_eq!(cancelled.code, "cancelled");
    }

    #[tokio::test]
    async fn callback_reader_rejects_oversized_requests() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener");
        let address = listener.local_addr().expect("address");
        let reader = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("connection");
            super::read_http_request(&mut stream).await
        });
        let mut client = tokio::net::TcpStream::connect(address)
            .await
            .expect("client");
        client
            .write_all(&vec![b'a'; super::MAX_CALLBACK_REQUEST_BYTES + 1])
            .await
            .expect("oversized request");
        client.shutdown().await.expect("shutdown");

        assert_eq!(
            reader
                .await
                .expect("reader task")
                .expect_err("oversized callback must fail")
                .kind(),
            std::io::ErrorKind::InvalidData,
        );
    }

    #[test]
    fn callback_rejects_duplicate_security_parameters() {
        let duplicate = b"GET /oauth/callback?code=one&code=two&state=expected&iss=https%3A%2F%2Fnotes.example.com HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(duplicate, "expected", "https://notes.example.com"),
            ParsedCallback::Invalid
        ));
        assert!(constant_time_eq("same", "same"));
        assert!(!constant_time_eq("same", "different"));
    }

    async fn read_mock_request(stream: &mut tokio::net::TcpStream) -> String {
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        let (header_end, content_length) = loop {
            let size = stream.read(&mut buffer).await.expect("mock request read");
            assert!(size > 0, "request ended before headers");
            request.extend_from_slice(&buffer[..size]);
            if let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") {
                let header_end = header_end + 4;
                let headers = std::str::from_utf8(&request[..header_end]).expect("headers");
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length: ")
                            .map(str::to_owned)
                    })
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(0);
                break (header_end, content_length);
            }
        };
        while request.len() < header_end + content_length {
            let size = stream.read(&mut buffer).await.expect("mock body read");
            assert!(size > 0, "request ended before body");
            request.extend_from_slice(&buffer[..size]);
        }
        String::from_utf8(request).expect("UTF-8 request")
    }

    fn request_body(request: &str) -> &str {
        request.split_once("\r\n\r\n").expect("request body").1
    }
}
