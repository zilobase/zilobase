use super::*;

pub(super) async fn exchange_session_credentials(
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

pub(super) fn validate_token_response(
    response: &DesktopTokenResponse,
    server: &DesktopServer,
) -> Result<(), DesktopOAuthError> {
    if !constant_time_eq(&response.issuer, &server.issuer)
        || (!is_cloud_server(server)
            && !is_development_server(server)
            && response.instance_id != server.instance_id)
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

pub(super) async fn cancellable<T, E, F>(
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

pub(super) fn persist_session_credentials(
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
