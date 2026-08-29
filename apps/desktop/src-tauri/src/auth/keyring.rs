use std::time::Instant;

use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::server::{self, DesktopServer};

const AUTH_SERVICE: &str = "com.zilobase";
pub(crate) const LEGACY_AUTH_ACCOUNT: &str = "session";
pub(crate) const LEGACY_AUTH_OWNER_ACCOUNT: &str = "session-owner";

#[tauri::command]
pub(crate) fn get_auth_token(app: AppHandle) -> Result<Option<String>, String> {
    let server = load_credential_server(&app)?;
    get_server_keyring_value(&server, LEGACY_AUTH_ACCOUNT, "session_token")
}

#[tauri::command]
pub(crate) fn set_auth_token(app: AppHandle, token: Option<String>) -> Result<(), String> {
    let server = load_credential_server(&app)?;
    set_server_keyring_value(&server, LEGACY_AUTH_ACCOUNT, "session_token", token)
}

#[tauri::command]
pub(crate) fn get_auth_owner(app: AppHandle) -> Result<Option<String>, String> {
    let server = load_credential_server(&app)?;
    get_server_keyring_value(&server, LEGACY_AUTH_OWNER_ACCOUNT, "session_owner")
}

#[tauri::command]
pub(crate) fn set_auth_owner(app: AppHandle, owner: Option<String>) -> Result<(), String> {
    let server = load_credential_server(&app)?;
    set_server_keyring_value(&server, LEGACY_AUTH_OWNER_ACCOUNT, "session_owner", owner)
}

fn get_keyring_value(account: &str, value_kind: &str) -> Result<Option<String>, String> {
    let started_at = Instant::now();
    log::info!(
        target: "zilobase::keyring",
        "[diagnostics] event=keyring.read status=started value_kind={value_kind}"
    );

    let entry = match keyring::Entry::new(AUTH_SERVICE, account) {
        Ok(entry) => entry,
        Err(error) => {
            log_keyring_failure("read", value_kind, "entry_creation", &error, started_at);
            return Err(error.to_string());
        }
    };

    match entry.get_password() {
        Ok(value) => {
            log::info!(
                target: "zilobase::keyring",
                "[diagnostics] event=keyring.read status=success value_kind={value_kind} value_present=true duration_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(Some(value))
        }
        Err(keyring::Error::NoEntry) => {
            log::info!(
                target: "zilobase::keyring",
                "[diagnostics] event=keyring.read status=success value_kind={value_kind} value_present=false duration_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(None)
        }
        Err(error) => {
            log_keyring_failure("read", value_kind, "credential_access", &error, started_at);
            Err(error.to_string())
        }
    }
}

fn set_keyring_value(account: &str, value_kind: &str, value: Option<String>) -> Result<(), String> {
    let started_at = Instant::now();
    let operation = if value.is_some() { "write" } else { "delete" };
    log::info!(
        target: "zilobase::keyring",
        "[diagnostics] event=keyring.{operation} status=started value_kind={value_kind}"
    );

    let entry = match keyring::Entry::new(AUTH_SERVICE, account) {
        Ok(entry) => entry,
        Err(error) => {
            log_keyring_failure(operation, value_kind, "entry_creation", &error, started_at);
            return Err(error.to_string());
        }
    };
    let result = match value {
        Some(value) => entry.set_password(&value),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error),
        },
    };

    match result {
        Ok(()) => {
            log::info!(
                target: "zilobase::keyring",
                "[diagnostics] event=keyring.{operation} status=success value_kind={value_kind} duration_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(())
        }
        Err(error) => {
            log_keyring_failure(
                operation,
                value_kind,
                "credential_access",
                &error,
                started_at,
            );
            Err(error.to_string())
        }
    }
}

fn load_credential_server(app: &AppHandle) -> Result<DesktopServer, String> {
    server::load_or_initialize_desktop_server(app)
        .map_err(|_| "The selected desktop server could not be loaded.".to_string())
}

pub(crate) fn get_server_keyring_value(
    server: &DesktopServer,
    legacy_account: &str,
    value_kind: &str,
) -> Result<Option<String>, String> {
    let account = scoped_keyring_account(server, legacy_account);
    let scoped = get_keyring_value(&account, value_kind)?;

    if scoped.is_some() || !server::is_cloud_server(server) {
        return Ok(scoped);
    }

    let legacy = get_keyring_value(legacy_account, value_kind)?;
    if let Some(value) = legacy {
        set_keyring_value(&account, value_kind, Some(value.clone()))?;
        set_keyring_value(legacy_account, value_kind, None)?;
        log::info!(
            target: "zilobase::keyring",
            "[diagnostics] event=keyring.migration status=success value_kind={value_kind}"
        );
        return Ok(Some(value));
    }

    Ok(None)
}

pub(crate) fn set_server_keyring_value(
    server: &DesktopServer,
    legacy_account: &str,
    value_kind: &str,
    value: Option<String>,
) -> Result<(), String> {
    set_keyring_value(
        &scoped_keyring_account(server, legacy_account),
        value_kind,
        value,
    )
}

pub(crate) fn delete_server_keyring_credentials(server: &DesktopServer) -> Result<(), String> {
    let mut first_error = None;
    for (account, value_kind) in [
        (LEGACY_AUTH_ACCOUNT, "session_token"),
        (LEGACY_AUTH_OWNER_ACCOUNT, "session_owner"),
    ] {
        if let Err(error) = set_server_keyring_value(server, account, value_kind, None) {
            first_error.get_or_insert(error);
        }
        if server::is_cloud_server(server) {
            if let Err(error) = set_keyring_value(account, value_kind, None) {
                first_error.get_or_insert(error);
            }
        }
    }

    first_error.map_or(Ok(()), Err)
}

fn scoped_keyring_account(server: &DesktopServer, legacy_account: &str) -> String {
    let digest = Sha256::digest(format!("{}\0{}", server.issuer, server.instance_id).as_bytes());
    format!("{legacy_account}:{digest:x}")
}

fn log_keyring_failure(
    operation: &str,
    value_kind: &str,
    stage: &str,
    error: &keyring::Error,
    started_at: Instant,
) {
    log::error!(
        target: "zilobase::keyring",
        "[diagnostics] event=keyring.{operation} status=error value_kind={value_kind} stage={stage} error_type={} duration_ms={}",
        keyring_error_kind(error),
        started_at.elapsed().as_millis()
    );
}

fn keyring_error_kind(error: &keyring::Error) -> &'static str {
    match error {
        keyring::Error::PlatformFailure(_) => "platform_failure",
        keyring::Error::NoStorageAccess(_) => "no_storage_access",
        keyring::Error::NoEntry => "no_entry",
        keyring::Error::BadEncoding(_) => "bad_encoding",
        keyring::Error::TooLong(_, _) => "attribute_too_long",
        keyring::Error::Invalid(_, _) => "invalid_attribute",
        keyring::Error::Ambiguous(_) => "ambiguous_entry",
        _ => "unknown_keyring_error",
    }
}
