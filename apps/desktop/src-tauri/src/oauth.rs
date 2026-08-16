use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::watch,
    time::{timeout, Instant},
};
use url::Url;

use crate::{
    desktop_server::{is_cloud_server, load_or_initialize_desktop_server, DesktopServer},
    get_server_keyring_value, set_server_keyring_value, LEGACY_AUTH_ACCOUNT,
    LEGACY_AUTH_OWNER_ACCOUNT,
};

const DESKTOP_CLIENT_ID: &str = "zilobase-desktop";
const CALLBACK_PATH: &str = "/oauth/callback";
const COMPLETION_PATH: &str = "/oauth/complete";
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

enum ParsedCallback {
    Ignore,
    Invalid,
    IssuerMismatch,
    ProviderDenied,
    ProviderError,
    StateMismatch,
    Valid(String),
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

async fn run_browser_authorization(
    app: &AppHandle,
    mut cancel: watch::Receiver<bool>,
) -> Result<DesktopOAuthSuccess, DesktopOAuthError> {
    let server = load_or_initialize_desktop_server(app)
        .map_err(|_| DesktopOAuthError::configuration_failed())?;
    let (listener, redirect_uri) = bind_loopback().await?;
    let listener = Arc::new(listener);
    let request = build_oauth_request(&server, redirect_uri)?;

    app.opener()
        .open_url(request.authorization_url.as_str(), None::<&str>)
        .map_err(|_| DesktopOAuthError::browser_open_failed())?;

    let callback = wait_for_callback(
        listener.as_ref(),
        &request.state,
        &server.issuer,
        &mut cancel,
        CALLBACK_TIMEOUT,
    )
    .await?;
    tokio::spawn(serve_completion_page(listener));
    let credentials =
        exchange_session_credentials(&request, &callback.code, &server, &mut cancel).await?;

    persist_session_credentials(&server, &credentials.token, &credentials.owner)?;
    Ok(DesktopOAuthSuccess { status: "success" })
}

async fn bind_loopback() -> Result<(TcpListener, String), DesktopOAuthError> {
    let ipv4 = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0);
    let (listener, host) = match TcpListener::bind(ipv4).await {
        Ok(listener) => (listener, "127.0.0.1".to_string()),
        Err(_) => {
            let ipv6 = SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), 0);
            let listener = TcpListener::bind(ipv6)
                .await
                .map_err(|_| DesktopOAuthError::callback_rejected())?;
            (listener, "[::1]".to_string())
        }
    };
    let port = listener
        .local_addr()
        .map_err(|_| DesktopOAuthError::callback_rejected())?
        .port();

    Ok((listener, format!("http://{host}:{port}{CALLBACK_PATH}")))
}

fn build_oauth_request(
    server: &DesktopServer,
    redirect_uri: String,
) -> Result<OAuthRequest, DesktopOAuthError> {
    let state = random_urlsafe(32)?;
    let pkce_verifier = random_urlsafe(64)?;
    let pkce_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(pkce_verifier.as_bytes()));
    let mut authorization_url = Url::parse(&server.api_origin)
        .and_then(|origin| origin.join("/desktop/authorize"))
        .map_err(|_| DesktopOAuthError::configuration_failed())?;

    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", DESKTOP_CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("state", &state)
        .append_pair("code_challenge", &pkce_challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(OAuthRequest {
        authorization_url,
        pkce_verifier,
        redirect_uri,
        state,
    })
}

async fn wait_for_callback(
    listener: &TcpListener,
    expected_state: &str,
    expected_issuer: &str,
    cancel: &mut watch::Receiver<bool>,
    callback_timeout: Duration,
) -> Result<ValidCallback, DesktopOAuthError> {
    let deadline = Instant::now() + callback_timeout;
    let mut saw_state_mismatch = false;

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(if saw_state_mismatch {
                DesktopOAuthError::state_mismatch()
            } else {
                DesktopOAuthError::callback_timeout()
            });
        }

        let accepted = tokio::select! {
            changed = cancel.changed() => {
                if changed.is_ok() && *cancel.borrow() {
                    return Err(DesktopOAuthError::cancelled());
                }
                continue;
            }
            result = timeout(remaining, listener.accept()) => {
                match result {
                    Ok(Ok(value)) => value,
                    Ok(Err(_)) => return Err(DesktopOAuthError::callback_rejected()),
                    Err(_) => return Err(if saw_state_mismatch {
                        DesktopOAuthError::state_mismatch()
                    } else {
                        DesktopOAuthError::callback_timeout()
                    }),
                }
            }
        };

        let (mut stream, _) = accepted;
        let request = match timeout(CALLBACK_READ_TIMEOUT, read_http_request(&mut stream)).await {
            Ok(Ok(request)) => request,
            _ => {
                let _ =
                    write_plain_response(&mut stream, "400 Bad Request", "Invalid request.").await;
                continue;
            }
        };

        match parse_callback(&request, expected_state, expected_issuer) {
            ParsedCallback::Ignore => {
                let _ = write_plain_response(&mut stream, "404 Not Found", "Not found.").await;
            }
            ParsedCallback::Invalid => {
                let _ = write_html_response(&mut stream, "400 Bad Request", &failure_html()).await;
                return Err(DesktopOAuthError::callback_rejected());
            }
            ParsedCallback::IssuerMismatch => {
                let _ = write_html_response(&mut stream, "400 Bad Request", &failure_html()).await;
                return Err(DesktopOAuthError::issuer_mismatch());
            }
            ParsedCallback::ProviderDenied => {
                let _ = write_html_response(&mut stream, "400 Bad Request", &denied_html()).await;
                return Err(DesktopOAuthError::provider_denied());
            }
            ParsedCallback::ProviderError => {
                let _ = write_html_response(&mut stream, "400 Bad Request", &failure_html()).await;
                return Err(DesktopOAuthError::server_sign_in_failed());
            }
            ParsedCallback::StateMismatch => {
                saw_state_mismatch = true;
                let _ =
                    write_plain_response(&mut stream, "400 Bad Request", "Invalid sign-in state.")
                        .await;
            }
            ParsedCallback::Valid(code) => {
                write_redirect_response(&mut stream, COMPLETION_PATH)
                    .await
                    .map_err(|_| DesktopOAuthError::callback_rejected())?;
                return Ok(ValidCallback { code });
            }
        }
    }
}

async fn serve_completion_page(listener: Arc<TcpListener>) {
    let deadline = Instant::now() + CALLBACK_READ_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return;
        }
        let Ok(Ok((mut stream, _))) = timeout(remaining, listener.accept()).await else {
            return;
        };
        let Ok(Ok(request)) = timeout(CALLBACK_READ_TIMEOUT, read_http_request(&mut stream)).await
        else {
            continue;
        };
        if is_completion_request(&request) {
            let _ = write_html_response(&mut stream, "200 OK", &completion_html()).await;
            return;
        }
        let _ = write_plain_response(&mut stream, "404 Not Found", "Not found.").await;
    }
}

fn is_completion_request(request: &[u8]) -> bool {
    let Some((method, target)) = request_target(request) else {
        return false;
    };
    method == "GET" && target == COMPLETION_PATH
}

fn request_target(request: &[u8]) -> Option<(&str, String)> {
    let request = std::str::from_utf8(request).ok()?;
    let mut parts = request.lines().next()?.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    let version = parts.next()?;
    if parts.next().is_some() || !version.starts_with("HTTP/1.") {
        return None;
    }
    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    Some((method, url.path().to_owned()))
}

async fn read_http_request(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut request = Vec::with_capacity(1024);
    let mut buffer = [0_u8; 1024];

    loop {
        let size = stream.read(&mut buffer).await?;
        if size == 0 {
            break;
        }
        request.extend_from_slice(&buffer[..size]);
        if request.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
        if request.len() > MAX_CALLBACK_REQUEST_BYTES {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "callback request is too large",
            ));
        }
    }

    if request.len() > MAX_CALLBACK_REQUEST_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "callback request is too large",
        ));
    }
    Ok(request)
}

fn parse_callback(request: &[u8], expected_state: &str, expected_issuer: &str) -> ParsedCallback {
    let Ok(request) = std::str::from_utf8(request) else {
        return ParsedCallback::Invalid;
    };
    let Some(request_line) = request.lines().next() else {
        return ParsedCallback::Invalid;
    };
    let mut parts = request_line.split_whitespace();
    let (Some(method), Some(target), Some(version)) = (parts.next(), parts.next(), parts.next())
    else {
        return ParsedCallback::Invalid;
    };
    if parts.next().is_some() || !version.starts_with("HTTP/1.") {
        return ParsedCallback::Invalid;
    }

    let Ok(url) = Url::parse(&format!("http://127.0.0.1{target}")) else {
        return ParsedCallback::Invalid;
    };
    if url.path() != CALLBACK_PATH {
        return ParsedCallback::Ignore;
    }
    if method != "GET" {
        return ParsedCallback::Invalid;
    }

    let state = single_query_parameter(&url, "state");
    let Some(state) = state else {
        return ParsedCallback::StateMismatch;
    };
    if !constant_time_eq(&state, expected_state) {
        return ParsedCallback::StateMismatch;
    }

    let issuer = single_query_parameter(&url, "iss");
    if issuer.as_deref() != Some(expected_issuer) {
        return ParsedCallback::IssuerMismatch;
    }

    if let Some(error) = single_query_parameter(&url, "error") {
        return if error == "access_denied" {
            ParsedCallback::ProviderDenied
        } else {
            ParsedCallback::ProviderError
        };
    }

    match single_query_parameter(&url, "code") {
        Some(code) if !code.is_empty() && code.len() <= 512 => ParsedCallback::Valid(code),
        _ => ParsedCallback::Invalid,
    }
}

fn single_query_parameter(url: &Url, name: &str) -> Option<String> {
    let mut values = url
        .query_pairs()
        .filter_map(|(key, value)| (key == name).then(|| value.into_owned()));
    let value = values.next()?;

    values.next().is_none().then_some(value)
}

async fn exchange_session_credentials(
    request: &OAuthRequest,
    code: &str,
    server: &DesktopServer,
    cancel: &mut watch::Receiver<bool>,
) -> Result<SessionCredentials, DesktopOAuthError> {
    let token_endpoint = Url::parse(&server.api_origin)
        .and_then(|origin| origin.join("/api/auth/desktop/token"))
        .map_err(|_| DesktopOAuthError::configuration_failed())?;
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| DesktopOAuthError::token_exchange_failed())?;
    let response = cancellable(
        cancel,
        client
            .post(token_endpoint)
            .form(&[
                ("client_id", DESKTOP_CLIENT_ID),
                ("code", code),
                ("code_verifier", request.pkce_verifier.as_str()),
                ("grant_type", "authorization_code"),
                ("redirect_uri", request.redirect_uri.as_str()),
            ])
            .send(),
        DesktopOAuthError::token_exchange_failed(),
    )
    .await?;

    if !response.status().is_success()
        || response.content_length().unwrap_or(0) > MAX_AUTH_RESPONSE_BYTES as u64
    {
        return Err(DesktopOAuthError::token_exchange_failed());
    }

    let response_bytes = cancellable(
        cancel,
        response.bytes(),
        DesktopOAuthError::token_exchange_failed(),
    )
    .await?;
    if response_bytes.len() > MAX_AUTH_RESPONSE_BYTES {
        return Err(DesktopOAuthError::token_exchange_failed());
    }

    let response: DesktopTokenResponse = serde_json::from_slice(&response_bytes)
        .map_err(|_| DesktopOAuthError::token_exchange_failed())?;
    validate_token_response(&response, server)?;

    Ok(SessionCredentials {
        owner: response.user.id,
        token: response.access_token,
    })
}

fn validate_token_response(
    response: &DesktopTokenResponse,
    server: &DesktopServer,
) -> Result<(), DesktopOAuthError> {
    if !constant_time_eq(&response.issuer, &server.issuer)
        || (!is_cloud_server(server) && response.instance_id != server.instance_id)
    {
        return Err(DesktopOAuthError::issuer_mismatch());
    }
    if response.token_type != "Bearer"
        || response.access_token.is_empty()
        || response.access_token.len() > MAX_SESSION_TOKEN_BYTES
        || response.user.id.is_empty()
        || response.user.id.len() > 256
        || response.expires_at.is_empty()
        || response.expires_at.len() > 64
    {
        return Err(DesktopOAuthError::token_exchange_failed());
    }

    Ok(())
}

async fn cancellable<T, E, F>(
    cancel: &mut watch::Receiver<bool>,
    future: F,
    failure: DesktopOAuthError,
) -> Result<T, DesktopOAuthError>
where
    F: std::future::Future<Output = Result<T, E>>,
{
    tokio::select! {
        changed = cancel.changed() => {
            if changed.is_ok() && *cancel.borrow() {
                Err(DesktopOAuthError::cancelled())
            } else {
                Err(failure)
            }
        }
        result = future => result.map_err(|_| failure),
    }
}

fn persist_session_credentials(
    server: &DesktopServer,
    token: &str,
    owner: &str,
) -> Result<(), DesktopOAuthError> {
    let previous_owner =
        get_server_keyring_value(server, LEGACY_AUTH_OWNER_ACCOUNT, "session_owner")
            .map_err(|_| DesktopOAuthError::credential_store_failed())?;

    set_server_keyring_value(
        server,
        LEGACY_AUTH_OWNER_ACCOUNT,
        "session_owner",
        Some(owner.to_string()),
    )
    .map_err(|_| DesktopOAuthError::credential_store_failed())?;

    if set_server_keyring_value(
        server,
        LEGACY_AUTH_ACCOUNT,
        "session_token",
        Some(token.to_string()),
    )
    .is_err()
    {
        let _ = set_server_keyring_value(
            server,
            LEGACY_AUTH_OWNER_ACCOUNT,
            "session_owner",
            previous_owner,
        );
        return Err(DesktopOAuthError::credential_store_failed());
    }

    Ok(())
}

async fn write_html_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> std::io::Result<()> {
    write_response(stream, status, "text/html; charset=utf-8", body).await
}

async fn write_plain_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> std::io::Result<()> {
    write_response(stream, status, "text/plain; charset=utf-8", body).await
}

async fn write_redirect_response(stream: &mut TcpStream, location: &str) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 303 See Other\r\nLocation: {location}\r\nContent-Length: 0\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

async fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &str,
) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

fn completion_html() -> String {
    auth_page_html(
        "Return to Zilobase",
        "The app is finishing sign-in. You can close this tab.",
    )
}

fn failure_html() -> String {
    auth_page_html(
        "Sign-in could not be completed",
        "Return to Zilobase and try again.",
    )
}

fn denied_html() -> String {
    auth_page_html(
        "Sign-in cancelled",
        "You can close this tab and return to Zilobase.",
    )
}

fn auth_page_html(title: &str, description: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>{AUTH_PAGE_STYLES}</style>
</head>
<body>
<main>
<div class="brand">{ZILOBASE_MARK}<span>Zilobase</span></div>
<div>
<h1>{title}</h1>
<p>{description}</p>
</div>
</main>
</body>
</html>"#
    )
}

const ZILOBASE_MARK: &str = r#"<svg class="logo" viewBox="0 0 248 225" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M57.6094 140H10C4.47716 140 0 135.523 0 130V95C0 89.4772 4.47715 85 10 85H112.609L57.6094 140ZM238 85C243.523 85 248 89.4772 248 95V130C248 135.523 243.523 140 238 140H135.391L190.391 85H238Z" fill="currentColor"/><rect y="170" width="248" height="55" rx="10" fill="currentColor"/><rect width="248" height="55" rx="10" fill="currentColor"/></svg>"#;

// Keep in sync with apps/server/src/features/desktop-auth/routes.ts AUTH_PAGE_STYLES.
const AUTH_PAGE_STYLES: &str = r#":root{color-scheme:light;--background:#fff;--foreground:oklch(0.145 0 0);--muted:oklch(0.556 0 0);--border:oklch(0.922 0 0);--input:oklch(0.922 0 0)}@media (prefers-color-scheme:dark){:root{color-scheme:dark;--background:#0d0d0f;--foreground:#fff;--muted:#71717a;--border:#1e1e1e;--input:#27272a}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:var(--background);color:var(--foreground);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;-webkit-font-smoothing:antialiased}@media (min-width:768px){body{padding:2.5rem}}main{width:100%;max-width:24rem;display:flex;flex-direction:column;gap:1.5rem}.brand{display:flex;align-items:center;gap:.5rem;font-weight:500}.logo{display:block;height:1.75rem;width:auto;color:var(--foreground)}h1{margin:0;font-size:1.125rem;line-height:1.75rem;font-weight:600}p{margin:.25rem 0 0;font-size:.75rem;line-height:1.625;font-weight:400;color:var(--muted)}"#;

fn random_urlsafe(byte_count: usize) -> Result<String, DesktopOAuthError> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::fill(&mut bytes).map_err(|_| DesktopOAuthError::configuration_failed())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    left.len() == right.len() && left.as_bytes().ct_eq(right.as_bytes()).into()
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
        parse_callback, validate_token_response, DesktopTokenResponse, DesktopTokenUser,
        ParsedCallback, CALLBACK_PATH,
    };
    use crate::desktop_server::DesktopServer;
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
    fn system_browser_pages_match_auth_screen_type() {
        let page = super::completion_html();
        assert!(page.contains("<span>Zilobase</span>"));
        assert!(page.contains("font-size:1.125rem"));
        assert!(page.contains("font-weight:600"));
        assert!(page.contains("font-size:.75rem"));
        assert!(page.contains("Return to Zilobase"));
        assert!(page.contains("The app is finishing sign-in."));
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
