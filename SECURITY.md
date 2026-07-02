# Security Policy

## Supported Versions

Security fixes are handled on the default branch. Until Notelab publishes stable release lines, only the latest code on `main` is supported.

## Reporting a Vulnerability

Do not report security vulnerabilities in public GitHub issues.

Please report vulnerabilities through one of these private channels:

- GitHub private vulnerability reporting for this repository
- Email: `hey@sreeragh.me`

Include as much detail as you can:

- Affected component or route
- Reproduction steps or proof of concept
- Impact and likely attack scenario
- Any suggested fix or mitigation

We aim to acknowledge reports within 72 hours. After triage, maintainers will coordinate fixes, disclosure timing, and credits with the reporter when appropriate.

## Secrets

Never commit real secrets, tokens, API keys, database URLs, OAuth credentials, private keys, or production `.env` files. Use the committed `.env.example` files as templates.
