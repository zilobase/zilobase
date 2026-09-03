use super::*;
use url::Host;

pub(super) fn is_cloud_origin(origin: &Url) -> bool {
    let value = origin.as_str().trim_end_matches('/');
    value == CLOUD_API_ORIGIN || value == CLOUD_WEB_ORIGIN
}

pub(super) fn random_candidate_id() -> Result<String, DesktopServerError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| {
        DesktopServerError::configuration("A secure server candidate could not be created.")
    })?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub(super) async fn verify_desktop_server(
    value: &str,
) -> Result<DesktopServer, DesktopServerError> {
    let origin = parse_server_origin(value)?;
    if is_cloud_origin(&origin) {
        return Ok(if cfg!(debug_assertions) {
            development_server()
        } else {
            cloud_server()
        });
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

pub(super) fn parse_server_origin(value: &str) -> Result<Url, DesktopServerError> {
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

pub(super) fn validate_discovery_document(
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

pub(super) fn parse_metadata_origin(value: &str, label: &str) -> Result<Url, DesktopServerError> {
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

pub(super) fn canonical_origin(url: &Url) -> Url {
    Url::parse(&url.origin().ascii_serialization())
        .expect("a URL with a host always has a valid origin")
}

pub(super) fn is_loopback_url(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address == Ipv4Addr::LOCALHOST,
        Some(Host::Ipv6(address)) => address == Ipv6Addr::LOCALHOST,
        None => false,
    }
}

pub(super) fn classify_request_error(error: reqwest::Error) -> DesktopServerError {
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
