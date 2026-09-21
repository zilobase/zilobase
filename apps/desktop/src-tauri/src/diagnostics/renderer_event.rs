use serde_json::Value;
use std::collections::BTreeMap;

const SAFE_NUMERIC_FIELDS: [&str; 3] = ["duration_ms", "elapsed_ms", "http_status"];
const SAFE_BOOLEAN_FIELDS: [&str; 5] = [
    "owner_present",
    "session_present",
    "token_present",
    "user_present",
    "value_present",
];
const SAFE_STATUS_VALUES: [&str; 7] = [
    "complete", "disabled", "error", "missing", "started", "success", "timeout",
];
const SAFE_PLATFORM_VALUES: [&str; 4] = ["linux", "macos", "windows", "unknown"];

pub(super) fn format_renderer_diagnostic(
    event: &str,
    fields: &BTreeMap<String, Value>,
) -> Option<String> {
    if !is_safe_event_name(event) {
        return None;
    }
    let mut parts = vec![format!("[diagnostics] event={event}")];
    for (key, value) in fields {
        let Some(value) = safe_renderer_field(key, value) else {
            continue;
        };
        parts.push(format!("{key}={value}"));
    }
    Some(parts.join(" "))
}

fn safe_renderer_field(key: &str, value: &Value) -> Option<String> {
    if SAFE_NUMERIC_FIELDS.contains(&key) {
        let value = value.as_f64()?;
        if !value.is_finite() || value < 0.0 || value > u64::MAX as f64 {
            return None;
        }
        return Some((value.round() as u64).to_string());
    }
    if SAFE_BOOLEAN_FIELDS.contains(&key) {
        return value.as_bool().map(|value| value.to_string());
    }
    if key == "status" {
        let value = value.as_str()?;
        return SAFE_STATUS_VALUES
            .contains(&value)
            .then(|| value.to_string());
    }
    if key == "platform" {
        let value = value.as_str()?;
        return SAFE_PLATFORM_VALUES
            .contains(&value)
            .then(|| value.to_string());
    }
    if key == "error_type" || key == "value_kind" {
        let value = value.as_str()?;
        return is_safe_identifier(value).then(|| value.to_string());
    }
    None
}

fn is_safe_event_name(value: &str) -> bool {
    value.len() <= 64
        && value
            .bytes()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase())
        && value.bytes().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, b'.' | b'_' | b'-')
        })
}

fn is_safe_identifier(value: &str) -> bool {
    value.len() <= 48
        && value
            .bytes()
            .next()
            .is_some_and(|character| character.is_ascii_alphabetic())
        && value
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn renderer_diagnostics_drop_every_unapproved_field() {
        let fields = BTreeMap::from([
            ("duration_ms".to_string(), json!(42.4)),
            ("email".to_string(), json!("person@example.com")),
            ("status".to_string(), json!("success")),
            ("token".to_string(), json!("secret")),
            ("token_present".to_string(), json!(true)),
            ("url".to_string(), json!("zilobase://auth?token=secret")),
        ]);
        assert_eq!(
            format_renderer_diagnostic("keyring.initialization", &fields).as_deref(),
            Some("[diagnostics] event=keyring.initialization duration_ms=42 status=success token_present=true")
        );
    }

    #[test]
    fn renderer_diagnostics_reject_unsafe_event_names() {
        assert_eq!(
            format_renderer_diagnostic("bad event token=secret", &BTreeMap::new()),
            None
        );
    }

    #[test]
    fn renderer_diagnostics_bound_values_without_exposing_unknown_text() {
        let fields = BTreeMap::from([
            ("duration_ms".to_string(), json!(-1)),
            ("status".to_string(), json!("secret-status")),
            ("platform".to_string(), json!("macos")),
            ("error_type".to_string(), json!("NetworkError")),
            ("value_kind".to_string(), json!("contains secret")),
            ("user_present".to_string(), json!("true")),
        ]);
        assert_eq!(
            format_renderer_diagnostic("native.test", &fields).as_deref(),
            Some("[diagnostics] event=native.test error_type=NetworkError platform=macos")
        );
    }
}
