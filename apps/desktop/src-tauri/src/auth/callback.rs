use subtle::ConstantTimeEq;
use url::Url;

pub(super) const CALLBACK_PATH: &str = "/oauth/callback";

#[derive(Debug, PartialEq)]
pub(super) enum ParsedCallback {
    Ignore,
    Invalid,
    IssuerMismatch,
    ProviderDenied,
    ProviderError,
    StateMismatch,
    Valid(String),
}

pub(super) fn parse_callback(
    request: &[u8],
    expected_state: &str,
    expected_issuer: &str,
) -> ParsedCallback {
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

pub(super) fn constant_time_eq(left: &str, right: &str) -> bool {
    left.len() == right.len() && left.as_bytes().ct_eq(right.as_bytes()).into()
}
