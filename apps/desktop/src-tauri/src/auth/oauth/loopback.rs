use super::*;

pub(super) async fn bind_loopback() -> Result<(TcpListener, String), DesktopOAuthError> {
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

pub(super) fn build_oauth_request(
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

pub(super) fn hosted_completion_url(server: &DesktopServer) -> Result<String, DesktopOAuthError> {
    Url::parse(&server.web_origin)
        .and_then(|origin| origin.join(CONNECTED_PATH))
        .map(|url| url.to_string())
        .map_err(|_| DesktopOAuthError::configuration_failed())
}

pub(super) async fn wait_for_callback(
    listener: &TcpListener,
    expected_state: &str,
    expected_issuer: &str,
    completion_url: &str,
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
                write_redirect_response(&mut stream, completion_url)
                    .await
                    .map_err(|_| DesktopOAuthError::callback_rejected())?;
                return Ok(ValidCallback { code });
            }
        }
    }
}

pub(super) async fn read_http_request(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
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

pub(super) async fn write_html_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> std::io::Result<()> {
    write_response(stream, status, "text/html; charset=utf-8", body).await
}

pub(super) async fn write_plain_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> std::io::Result<()> {
    write_response(stream, status, "text/plain; charset=utf-8", body).await
}

pub(super) async fn write_redirect_response(
    stream: &mut TcpStream,
    location: &str,
) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 303 See Other\r\nLocation: {location}\r\nContent-Length: 0\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

pub(super) async fn write_response(
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

pub(super) fn failure_html() -> String {
    auth_page_html(
        "Sign-in could not be completed",
        "Return to Zilobase and try again.",
    )
}

pub(super) fn denied_html() -> String {
    auth_page_html(
        "Sign-in cancelled",
        "You can close this tab and return to Zilobase.",
    )
}

pub(super) fn auth_page_html(title: &str, description: &str) -> String {
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
