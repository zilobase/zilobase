use base64::{engine::general_purpose::STANDARD, Engine};

fn main() {
    let mut args = std::env::args().skip(1);
    let operation = args.next();
    if !matches!(
        operation.as_deref(),
        Some("--read-legacy-credential" | "--delete-legacy-credential")
    ) {
        std::process::exit(64);
    }
    let Some(account) = args.next() else {
        std::process::exit(64);
    };
    if args.next().is_some() {
        std::process::exit(64);
    }
    if !valid_account(&account) {
        std::process::exit(64);
    }
    let Ok(entry) = keyring::Entry::new("com.zilobase", &account) else {
        std::process::exit(1);
    };
    if operation.as_deref() == Some("--delete-legacy-credential") {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => std::process::exit(1),
        }
    } else {
        match entry.get_password() {
            Ok(value) => println!("{}", STANDARD.encode(value.as_bytes())),
            Err(keyring::Error::NoEntry) => std::process::exit(2),
            Err(_) => std::process::exit(1),
        }
    }
}

fn valid_account(account: &str) -> bool {
    let Some((kind, digest)) = account.split_once(':') else {
        return false;
    };
    matches!(kind, "session" | "session-owner")
        && digest.len() == 64
        && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::valid_account;

    #[test]
    fn legacy_reader_only_accepts_scoped_session_accounts() {
        let digest = "a".repeat(64);
        assert!(valid_account(&format!("session:{digest}")));
        assert!(valid_account(&format!("session-owner:{digest}")));
        assert!(!valid_account("session"));
        assert!(!valid_account(&format!("unscoped:{digest}")));
        assert!(!valid_account("session:../../secrets"));
    }
}
