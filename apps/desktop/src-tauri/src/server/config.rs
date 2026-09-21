use super::*;

pub(super) fn default_server() -> DesktopServer {
    if cfg!(debug_assertions) {
        development_server()
    } else {
        cloud_server()
    }
}

pub(super) fn refresh_development_config(
    directory: &Path,
    mut config: DesktopServerConfig,
) -> DesktopServerConfig {
    let current = active_server(&config).clone();
    let refreshed = refresh_development_server(directory, current.clone());
    if refreshed != current {
        replace_active_server(&mut config, refreshed);
        let _ = write_config(directory, &config);
    }
    config
}

pub(super) fn refresh_development_server(
    _directory: &Path,
    server: DesktopServer,
) -> DesktopServer {
    if cfg!(test) || !is_development_server(&server) {
        return server;
    }

    match tauri::async_runtime::block_on(verify_desktop_server(&server.api_origin)) {
        Ok(verified) => verified,
        Err(_) => server,
    }
}

pub(super) fn development_server() -> DesktopServer {
    let origin = std::env::var("VITE_API_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty() && value != "/api")
        .unwrap_or_else(|| DEFAULT_DEV_API_ORIGIN.to_string());

    DesktopServer {
        instance_id: DEV_INSTANCE_ID.to_string(),
        display_name: "Zilobase Cloud".to_string(),
        issuer: origin.clone(),
        web_origin: origin.clone(),
        api_origin: origin,
        protocol_version: 1,
        server_version: env!("CARGO_PKG_VERSION").to_string(),
        minimum_desktop_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

pub(super) fn cloud_server() -> DesktopServer {
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

pub(super) fn app_config_directory(app: &AppHandle) -> Result<PathBuf, DesktopServerError> {
    app.path().app_config_dir().map_err(|_| {
        DesktopServerError::configuration("The app configuration directory is unavailable.")
    })
}

pub(super) fn load_or_initialize_from_directory(
    directory: &Path,
) -> Result<DesktopServer, DesktopServerError> {
    let config = load_or_initialize_config(directory)?;
    Ok(active_server(&config).clone())
}

pub(super) fn load_or_initialize_config(
    directory: &Path,
) -> Result<DesktopServerConfig, DesktopServerError> {
    let path = config_path(directory);
    match fs::read(&path) {
        Ok(bytes) => {
            let mut config = parse_config(&bytes)?;
            if cfg!(debug_assertions) && is_cloud_server(active_server(&config)) {
                replace_active_server(&mut config, default_server());
                write_config(directory, &config)?;
                return Ok(refresh_development_config(directory, config));
            }
            Ok(refresh_development_config(directory, config))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let server = refresh_development_server(directory, default_server());
            let config = single_profile_config(&server);
            write_config(directory, &config)?;
            Ok(config)
        }
        Err(_) => Err(DesktopServerError::configuration(
            "The saved desktop server configuration could not be read.",
        )),
    }
}

pub(super) fn parse_config(bytes: &[u8]) -> Result<DesktopServerConfig, DesktopServerError> {
    if bytes.len() > MAX_DISCOVERY_BYTES {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration is too large.",
        ));
    }
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| {
        DesktopServerError::configuration("The saved desktop server configuration is malformed.")
    })?;
    let version = value
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);

    if version != u64::from(CONFIG_VERSION) {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration uses an unsupported version.",
        ));
    }

    let mut config: DesktopServerConfig = serde_json::from_value(value).map_err(|_| {
        DesktopServerError::configuration("The saved desktop server configuration is malformed.")
    })?;
    if config.profiles.is_empty() {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration has no servers.",
        ));
    }
    for profile in &config.profiles {
        validate_persisted_server(&profile.server)?;
        validate_profile_snapshot(profile)?;
    }
    if active_profile_index(&config).is_none() {
        config.active_instance_id = config.profiles[0].server.instance_id.clone();
    }
    Ok(config)
}

pub(super) fn validate_persisted_server(server: &DesktopServer) -> Result<(), DesktopServerError> {
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

pub(super) fn commit_candidate_to_directory(
    directory: &Path,
    candidate: &DesktopServer,
) -> Result<DesktopServerCommit, DesktopServerError> {
    let mut config = load_or_initialize_config(directory)?;
    let current = active_server(&config);
    let changed = !servers_refer_to_same_instance(current, candidate);
    upsert_and_activate(&mut config, candidate);
    write_config(directory, &config)?;
    Ok(DesktopServerCommit {
        changed,
        server: candidate.clone(),
    })
}

pub(super) fn remove_profile_from_directory<F>(
    directory: &Path,
    instance_id: &str,
    api_origin: &str,
    delete_credentials: F,
) -> Result<DesktopServer, DesktopServerError>
where
    F: FnOnce(&DesktopServer) -> Result<(), String>,
{
    let mut config = load_or_initialize_config(directory)?;
    let index = find_profile_index(&config, instance_id, api_origin).ok_or_else(|| {
        DesktopServerError::new(
            "server_profile_not_found",
            "That saved server is no longer available on this device.",
        )
    })?;
    let removed = config.profiles[index].server.clone();
    if delete_credentials(&removed).is_err() {
        return Err(DesktopServerError::new(
            "credential_cleanup_failed",
            "The server credentials could not be removed. The server was not forgotten.",
        ));
    }
    config.profiles.remove(index);
    if config.profiles.is_empty() {
        config = single_profile_config(&default_server());
    } else if active_profile_index(&config).is_none() {
        config.active_instance_id = config.profiles[0].server.instance_id.clone();
    }
    write_config(directory, &config)?;
    Ok(active_server(&config).clone())
}

#[cfg_attr(not(test), allow(dead_code))]
pub(super) fn save_to_directory(
    directory: &Path,
    server: &DesktopServer,
) -> Result<(), DesktopServerError> {
    write_config(directory, &single_profile_config(server))
}

pub(super) fn write_config(
    directory: &Path,
    config: &DesktopServerConfig,
) -> Result<(), DesktopServerError> {
    fs::create_dir_all(directory).map_err(|_| {
        DesktopServerError::configuration("The app configuration directory could not be created.")
    })?;
    let persisted = DesktopServerConfig {
        version: CONFIG_VERSION,
        active_instance_id: config.active_instance_id.clone(),
        profiles: config.profiles.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&persisted).map_err(|_| {
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

pub(super) fn profile_list_from_config(config: &DesktopServerConfig) -> DesktopServerProfileList {
    let active = active_server(config);
    DesktopServerProfileList {
        active_instance_id: active.instance_id.clone(),
        profiles: config
            .profiles
            .iter()
            .map(|profile| DesktopServerProfileView {
                active: servers_refer_to_same_instance(&profile.server, active),
                has_credentials: server_has_credentials(&profile.server),
                last_active_workspace_id: profile.last_active_workspace_id.clone(),
                last_path: profile.last_path.clone(),
                last_used_at: profile.last_used_at.clone(),
                server: profile.server.clone(),
                workspaces: profile.workspaces.clone(),
            })
            .collect(),
    }
}

pub(super) fn server_has_credentials(server: &DesktopServer) -> bool {
    crate::auth::keyring::get_server_keyring_value(
        server,
        crate::auth::keyring::AUTH_TOKEN_ACCOUNT,
        "session_token",
    )
    .ok()
    .flatten()
    .is_some_and(|value| !value.is_empty())
}

pub(super) fn unix_timestamp_secs() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub(super) fn config_file_name() -> &'static str {
    if cfg!(debug_assertions) {
        DEV_CONFIG_FILE_NAME
    } else {
        CONFIG_FILE_NAME
    }
}

pub(super) fn config_path(directory: &Path) -> PathBuf {
    directory.join(config_file_name())
}
