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

use crate::{get_keyring_value, set_keyring_value, AUTH_ACCOUNT, AUTH_OWNER_ACCOUNT};

const GOOGLE_AUTHORIZATION_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const HOSTED_API_URL: &str = "https://api.zilobase.com";
const DEVELOPMENT_API_URL: &str = "http://127.0.0.1:3000";
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
            "Zilobase could not open the browser.",
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

    fn configuration_missing() -> Self {
        Self::new(
            "configuration_missing",
            "Google sign-in is not configured for this desktop build.",
        )
    }

    fn credential_store_failed() -> Self {
        Self::new(
            "credential_store_failed",
            "Zilobase could not securely save the desktop session.",
        )
    }

    fn provider_denied() -> Self {
        Self::new("provider_denied", "Google sign-in was cancelled or denied.")
    }

    fn provider_error() -> Self {
        Self::new(
            "provider_error",
            "Google could not complete the sign-in request.",
        )
    }

    fn server_sign_in_failed() -> Self {
        Self::new(
            "server_sign_in_failed",
            "Zilobase could not finish creating the desktop session.",
        )
    }

    fn server_configuration_missing() -> Self {
        Self::new(
            "server_configuration_missing",
            "The Zilobase server does not accept this desktop OAuth client.",
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
            "Google could not finish the sign-in request.",
        )
    }
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    id_token: Option<String>,
}

#[derive(Serialize)]
struct ZilobaseSignInRequest<'a> {
    provider: &'static str,
    #[serde(rename = "idToken")]
    id_token: ZilobaseIdToken<'a>,
    #[serde(rename = "disableRedirect")]
    disable_redirect: bool,
}

#[derive(Serialize)]
struct ZilobaseIdToken<'a> {
    token: &'a str,
    nonce: &'a str,
}

#[derive(Deserialize)]
struct ZilobaseSignInResponse {
    user: ZilobaseUser,
}

#[derive(Deserialize)]
struct ZilobaseUser {
    id: String,
}

struct OAuthRequest {
    authorization_url: Url,
    nonce: String,
    pkce_verifier: String,
    redirect_uri: String,
    state: String,
}

struct ValidCallback {
    code: String,
}

struct OAuthEndpoints {
    google_token: Url,
    zilobase_sign_in: Url,
}

struct SessionCredentials {
    owner: String,
    token: String,
}

enum ParsedCallback {
    Ignore,
    Invalid,
    ProviderDenied,
    ProviderError,
    StateMismatch,
    Valid(String),
}

#[tauri::command]
pub(crate) async fn start_google_oauth(
    app: AppHandle,
    state: tauri::State<'_, DesktopOAuthState>,
) -> Result<DesktopOAuthSuccess, DesktopOAuthError> {
    let client_id = google_desktop_client_id()?;
    let attempt_id = random_urlsafe(18)?;
    let (cancel, cancel_rx) = watch::channel(false);

    state.begin_attempt(attempt_id.clone(), cancel)?;

    log::info!(
        target: "zilobase::oauth",
        "[diagnostics] event=desktop_oauth.started status=started"
    );

    let result = run_google_oauth(&app, &client_id, cancel_rx).await;
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
pub(crate) fn cancel_google_oauth(
    state: tauri::State<'_, DesktopOAuthState>,
) -> Result<(), DesktopOAuthError> {
    state.cancel_attempt();
    Ok(())
}

async fn run_google_oauth(
    app: &AppHandle,
    client_id: &str,
    mut cancel: watch::Receiver<bool>,
) -> Result<DesktopOAuthSuccess, DesktopOAuthError> {
    let (listener, redirect_uri) = bind_loopback().await?;
    let listener = Arc::new(listener);
    let request = build_oauth_request(client_id, redirect_uri)?;

    app.opener()
        .open_url(request.authorization_url.as_str(), None::<&str>)
        .map_err(|_| DesktopOAuthError::browser_open_failed())?;

    let callback = wait_for_callback(listener.as_ref(), &request.state, &mut cancel).await?;
    tokio::spawn(serve_completion_page(listener));
    let result = complete_sign_in(client_id, &request, &callback.code, &mut cancel).await;

    result?;
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
    client_id: &str,
    redirect_uri: String,
) -> Result<OAuthRequest, DesktopOAuthError> {
    let state = random_urlsafe(32)?;
    let nonce = random_urlsafe(32)?;
    let pkce_verifier = random_urlsafe(64)?;
    let pkce_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(pkce_verifier.as_bytes()));
    let mut authorization_url = Url::parse(GOOGLE_AUTHORIZATION_URL)
        .map_err(|_| DesktopOAuthError::configuration_missing())?;

    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", &state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &pkce_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "online")
        .append_pair("include_granted_scopes", "true");

    Ok(OAuthRequest {
        authorization_url,
        nonce,
        pkce_verifier,
        redirect_uri,
        state,
    })
}

async fn wait_for_callback(
    listener: &TcpListener,
    expected_state: &str,
    cancel: &mut watch::Receiver<bool>,
) -> Result<ValidCallback, DesktopOAuthError> {
    let deadline = Instant::now() + CALLBACK_TIMEOUT;
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

        match parse_callback(&request, expected_state) {
            ParsedCallback::Ignore => {
                let _ = write_plain_response(&mut stream, "404 Not Found", "Not found.").await;
            }
            ParsedCallback::Invalid => {
                let _ = write_html_response(&mut stream, "400 Bad Request", failure_html()).await;
                return Err(DesktopOAuthError::callback_rejected());
            }
            ParsedCallback::ProviderDenied => {
                let _ = write_html_response(&mut stream, "400 Bad Request", denied_html()).await;
                return Err(DesktopOAuthError::provider_denied());
            }
            ParsedCallback::ProviderError => {
                let _ = write_html_response(&mut stream, "400 Bad Request", failure_html()).await;
                return Err(DesktopOAuthError::provider_error());
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
            let _ = write_html_response(&mut stream, "200 OK", completion_html()).await;
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

fn parse_callback(request: &[u8], expected_state: &str) -> ParsedCallback {
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

    let state = url
        .query_pairs()
        .find_map(|(key, value)| (key == "state").then(|| value.into_owned()));
    let Some(state) = state else {
        return ParsedCallback::StateMismatch;
    };
    if !constant_time_eq(&state, expected_state) {
        return ParsedCallback::StateMismatch;
    }

    let error = url
        .query_pairs()
        .find_map(|(key, value)| (key == "error").then(|| value.into_owned()));
    if let Some(error) = error {
        return if error == "access_denied" {
            ParsedCallback::ProviderDenied
        } else {
            ParsedCallback::ProviderError
        };
    }

    let code = url
        .query_pairs()
        .find_map(|(key, value)| (key == "code").then(|| value.into_owned()));
    match code {
        Some(code) if !code.is_empty() && code.len() <= 4096 => ParsedCallback::Valid(code),
        _ => ParsedCallback::Invalid,
    }
}

async fn complete_sign_in(
    client_id: &str,
    request: &OAuthRequest,
    code: &str,
    cancel: &mut watch::Receiver<bool>,
) -> Result<(), DesktopOAuthError> {
    let endpoints = oauth_endpoints()?;
    let credentials =
        exchange_session_credentials(client_id, request, code, cancel, &endpoints).await?;
    persist_session_credentials(&credentials.token, &credentials.owner)
}

fn oauth_endpoints() -> Result<OAuthEndpoints, DesktopOAuthError> {
    let google_token =
        Url::parse(GOOGLE_TOKEN_URL).map_err(|_| DesktopOAuthError::configuration_missing())?;
    let zilobase_sign_in = desktop_api_url()?
        .join("/api/auth/sign-in/social")
        .map_err(|_| DesktopOAuthError::server_sign_in_failed())?;
    Ok(OAuthEndpoints {
        google_token,
        zilobase_sign_in,
    })
}

async fn exchange_session_credentials(
    client_id: &str,
    request: &OAuthRequest,
    code: &str,
    cancel: &mut watch::Receiver<bool>,
    endpoints: &OAuthEndpoints,
) -> Result<SessionCredentials, DesktopOAuthError> {
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| DesktopOAuthError::token_exchange_failed())?;
    let token_request = client.post(endpoints.google_token.clone()).form(&[
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", request.pkce_verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", request.redirect_uri.as_str()),
    ]);
    let token_response = cancellable(
        cancel,
        token_request.send(),
        DesktopOAuthError::token_exchange_failed(),
    )
    .await?;
    if !token_response.status().is_success() {
        return Err(DesktopOAuthError::token_exchange_failed());
    }
    if token_response.content_length().unwrap_or(0) > MAX_AUTH_RESPONSE_BYTES as u64 {
        return Err(DesktopOAuthError::token_exchange_failed());
    }
    let token_bytes = cancellable(
        cancel,
        token_response.bytes(),
        DesktopOAuthError::token_exchange_failed(),
    )
    .await?;
    if token_bytes.len() > MAX_AUTH_RESPONSE_BYTES {
        return Err(DesktopOAuthError::token_exchange_failed());
    }
    let token_response: GoogleTokenResponse = serde_json::from_slice(&token_bytes)
        .map_err(|_| DesktopOAuthError::token_exchange_failed())?;
    let id_token = token_response
        .id_token
        .filter(|token| !token.is_empty() && token.len() <= 16 * 1024)
        .ok_or_else(DesktopOAuthError::token_exchange_failed)?;

    let sign_in_request =
        client
            .post(endpoints.zilobase_sign_in.clone())
            .json(&ZilobaseSignInRequest {
                provider: "google",
                id_token: ZilobaseIdToken {
                    token: &id_token,
                    nonce: &request.nonce,
                },
                disable_redirect: true,
            });
    let sign_in_response = cancellable(
        cancel,
        sign_in_request.send(),
        DesktopOAuthError::server_sign_in_failed(),
    )
    .await?;
    let sign_in_status = sign_in_response.status();
    if !sign_in_status.is_success() {
        return Err(if sign_in_status == reqwest::StatusCode::UNAUTHORIZED {
            DesktopOAuthError::server_configuration_missing()
        } else {
            DesktopOAuthError::server_sign_in_failed()
        });
    }
    let session_token = sign_in_response
        .headers()
        .get("set-auth-token")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty() && value.len() <= MAX_SESSION_TOKEN_BYTES)
        .map(str::to_owned)
        .ok_or_else(DesktopOAuthError::server_sign_in_failed)?;
    if sign_in_response.content_length().unwrap_or(0) > MAX_AUTH_RESPONSE_BYTES as u64 {
        return Err(DesktopOAuthError::server_sign_in_failed());
    }
    let sign_in_bytes = cancellable(
        cancel,
        sign_in_response.bytes(),
        DesktopOAuthError::server_sign_in_failed(),
    )
    .await?;
    if sign_in_bytes.len() > MAX_AUTH_RESPONSE_BYTES {
        return Err(DesktopOAuthError::server_sign_in_failed());
    }
    let sign_in_response: ZilobaseSignInResponse = serde_json::from_slice(&sign_in_bytes)
        .map_err(|_| DesktopOAuthError::server_sign_in_failed())?;
    let user_id = sign_in_response.user.id;
    if user_id.is_empty() || user_id.len() > 256 {
        return Err(DesktopOAuthError::server_sign_in_failed());
    }

    Ok(SessionCredentials {
        owner: user_id,
        token: session_token,
    })
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

fn persist_session_credentials(token: &str, owner: &str) -> Result<(), DesktopOAuthError> {
    let previous_owner = get_keyring_value(AUTH_OWNER_ACCOUNT, "session_owner")
        .map_err(|_| DesktopOAuthError::credential_store_failed())?;

    set_keyring_value(AUTH_OWNER_ACCOUNT, "session_owner", Some(owner.to_string()))
        .map_err(|_| DesktopOAuthError::credential_store_failed())?;

    if set_keyring_value(AUTH_ACCOUNT, "session_token", Some(token.to_string())).is_err() {
        let _ = set_keyring_value(AUTH_OWNER_ACCOUNT, "session_owner", previous_owner);
        return Err(DesktopOAuthError::credential_store_failed());
    }

    Ok(())
}

async fn write_html_response(
    stream: &mut TcpStream,
    status: &str,
    body: &'static str,
) -> std::io::Result<()> {
    write_response(stream, status, "text/html; charset=utf-8", body).await
}

async fn write_plain_response(
    stream: &mut TcpStream,
    status: &str,
    body: &'static str,
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
    body: &'static str,
) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

fn completion_html() -> &'static str {
    "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Return to Zilobase</title><style>body{font:16px system-ui;margin:0;display:grid;min-height:100vh;place-items:center;background:#0d0d0f;color:#fff}main{max-width:28rem;padding:2rem;text-align:center}p{color:#aaa}</style><main><h1>Return to Zilobase</h1><p>The app is finishing sign-in. You can close this tab.</p></main>"
}

fn failure_html() -> &'static str {
    "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Zilobase sign-in failed</title><style>body{font:16px system-ui;margin:0;display:grid;min-height:100vh;place-items:center;background:#0d0d0f;color:#fff}main{max-width:28rem;padding:2rem;text-align:center}p{color:#aaa}</style><main><h1>Sign-in could not be completed</h1><p>Return to Zilobase and try again.</p></main>"
}

fn denied_html() -> &'static str {
    "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Zilobase sign-in cancelled</title><style>body{font:16px system-ui;margin:0;display:grid;min-height:100vh;place-items:center;background:#0d0d0f;color:#fff}main{max-width:28rem;padding:2rem;text-align:center}p{color:#aaa}</style><main><h1>Sign-in cancelled</h1><p>You can close this tab and return to Zilobase.</p></main>"
}

fn google_desktop_client_id() -> Result<String, DesktopOAuthError> {
    let configured = option_env!("GOOGLE_DESKTOP_CLIENT_ID")
        .map(str::to_owned)
        .or_else(|| {
            cfg!(debug_assertions)
                .then(|| std::env::var("GOOGLE_DESKTOP_CLIENT_ID").ok())
                .flatten()
        });

    configured
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(DesktopOAuthError::configuration_missing)
}

fn desktop_api_url() -> Result<Url, DesktopOAuthError> {
    let configured = option_env!("ZILOBASE_DESKTOP_API_URL").unwrap_or(if cfg!(debug_assertions) {
        DEVELOPMENT_API_URL
    } else {
        HOSTED_API_URL
    });
    let url = Url::parse(configured).map_err(|_| DesktopOAuthError::server_sign_in_failed())?;
    let valid_release = url.scheme() == "https" && url.host_str().is_some();
    let valid_development = cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"));

    (valid_release || valid_development)
        .then_some(url)
        .ok_or_else(DesktopOAuthError::server_sign_in_failed)
}

fn random_urlsafe(byte_count: usize) -> Result<String, DesktopOAuthError> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::fill(&mut bytes).map_err(|_| DesktopOAuthError::configuration_missing())?;
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
        build_oauth_request, constant_time_eq, exchange_session_credentials, parse_callback,
        OAuthEndpoints, ParsedCallback, CALLBACK_PATH,
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn authorization_request_uses_pkce_state_nonce_and_loopback() {
        let request = build_oauth_request(
            "desktop-client.apps.googleusercontent.com",
            format!("http://127.0.0.1:43123{CALLBACK_PATH}"),
        )
        .expect("request");
        let params: std::collections::HashMap<_, _> = request
            .authorization_url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();

        assert_eq!(
            params.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(
            params.get("redirect_uri").map(String::as_str),
            Some("http://127.0.0.1:43123/oauth/callback")
        );
        assert_eq!(params.get("state"), Some(&request.state));
        assert_eq!(params.get("nonce"), Some(&request.nonce));
        assert!(request.pkce_verifier.len() >= 43);
        assert_ne!(params.get("code_challenge"), Some(&request.pkce_verifier));
    }

    #[test]
    fn every_authorization_request_has_unique_secrets() {
        let first = build_oauth_request(
            "desktop-client.apps.googleusercontent.com",
            format!("http://127.0.0.1:43123{CALLBACK_PATH}"),
        )
        .expect("first request");
        let second = build_oauth_request(
            "desktop-client.apps.googleusercontent.com",
            format!("http://127.0.0.1:43124{CALLBACK_PATH}"),
        )
        .expect("second request");

        assert_ne!(first.state, second.state);
        assert_ne!(first.nonce, second.nonce);
        assert_ne!(first.pkce_verifier, second.pkce_verifier);
    }

    #[tokio::test]
    async fn loopback_listeners_use_ephemeral_ports() {
        let (first, first_redirect) = super::bind_loopback().await.expect("first listener");
        let (second, second_redirect) = super::bind_loopback().await.expect("second listener");

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
    fn duplicate_start_is_rejected_and_cancel_allows_immediate_retry() {
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
    async fn exchanges_only_the_id_token_and_nonce_for_a_session() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("mock listener");
        let address = listener.local_addr().expect("mock address");
        let server = tokio::spawn(async move {
            let mut requests = Vec::new();
            for response in [
                r#"{"id_token":"google-id-token","access_token":"discard-me","refresh_token":"discard-me"}"#,
                r#"{"user":{"id":"user-123"},"token":"body-token"}"#,
            ] {
                let (mut stream, _) = listener.accept().await.expect("mock connection");
                requests.push(read_mock_request(&mut stream).await);
                let auth_header = if requests.len() == 2 {
                    "set-auth-token: zilobase-session\r\n"
                } else {
                    ""
                };
                let reply = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{auth_header}Content-Length: {}\r\nConnection: close\r\n\r\n{response}",
                    response.len()
                );
                stream
                    .write_all(reply.as_bytes())
                    .await
                    .expect("mock reply");
            }
            requests
        });

        let request = build_oauth_request(
            "desktop-client.apps.googleusercontent.com",
            "http://127.0.0.1:43123/oauth/callback".to_string(),
        )
        .expect("OAuth request");
        let endpoints = OAuthEndpoints {
            google_token: format!("http://{address}/token")
                .parse()
                .expect("token URL"),
            zilobase_sign_in: format!("http://{address}/api/auth/sign-in/social")
                .parse()
                .expect("sign-in URL"),
        };
        let (_cancel_sender, mut cancel) = tokio::sync::watch::channel(false);
        let credentials = exchange_session_credentials(
            "desktop-client.apps.googleusercontent.com",
            &request,
            "authorization-code",
            &mut cancel,
            &endpoints,
        )
        .await
        .expect("session exchange");
        let requests = server.await.expect("mock server");

        assert_eq!(credentials.owner, "user-123");
        assert_eq!(credentials.token, "zilobase-session");

        let token_body = request_body(&requests[0]);
        let token_form: std::collections::HashMap<_, _> =
            url::form_urlencoded::parse(token_body.as_bytes())
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect();
        assert_eq!(
            token_form.get("code").map(String::as_str),
            Some("authorization-code")
        );
        assert_eq!(
            token_form.get("code_verifier"),
            Some(&request.pkce_verifier)
        );

        let sign_in: serde_json::Value =
            serde_json::from_str(request_body(&requests[1])).expect("sign-in JSON");
        assert_eq!(sign_in["idToken"]["token"], "google-id-token");
        assert_eq!(sign_in["idToken"]["nonce"], request.nonce);
        assert!(sign_in["idToken"].get("accessToken").is_none());
        assert!(sign_in["idToken"].get("refreshToken").is_none());
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
                let headers = std::str::from_utf8(&request[..header_end]).expect("request headers");
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

    #[test]
    fn callback_requires_matching_state_and_code() {
        let valid = b"GET /oauth/callback?code=google-code&state=expected HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert!(matches!(
            parse_callback(valid, "expected"),
            ParsedCallback::Valid(code) if code == "google-code"
        ));

        let mismatch = b"GET /oauth/callback?code=google-code&state=wrong HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(mismatch, "expected"),
            ParsedCallback::StateMismatch
        ));

        let missing_code = b"GET /oauth/callback?state=expected HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(missing_code, "expected"),
            ParsedCallback::Invalid
        ));

        let wrong_method = b"POST /oauth/callback?code=google-code&state=expected HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(wrong_method, "expected"),
            ParsedCallback::Invalid
        ));
    }

    #[test]
    fn callback_ignores_other_paths_and_handles_provider_denial() {
        let favicon = b"GET /favicon.ico HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(favicon, "expected"),
            ParsedCallback::Ignore
        ));

        let denied = b"GET /oauth/callback?error=access_denied&state=expected HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(denied, "expected"),
            ParsedCallback::ProviderDenied
        ));

        let provider_error =
            b"GET /oauth/callback?error=server_error&state=expected HTTP/1.1\r\n\r\n";
        assert!(matches!(
            parse_callback(provider_error, "expected"),
            ParsedCallback::ProviderError
        ));
    }

    #[test]
    fn state_comparison_requires_exact_match() {
        assert!(constant_time_eq("same", "same"));
        assert!(!constant_time_eq("same", "different"));
    }
}
