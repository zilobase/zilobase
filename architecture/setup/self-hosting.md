# Self-hosting

The public deployment packages the core Node application and web assets. Instance bootstrap establishes initial administration and registration policy. Operators own persistent database/storage configuration and backups. An internal refactor must preserve bootstrap, readiness, migration and upgrade entrypoints. [Self-host management](../../scripts/selfhost/manage.mjs) creates a private development environment and owns Compose up/logs/down/reset/test dispatch. [End-to-end testing](../../scripts/selfhost/test.mjs) uses isolated project names, temporary state, local object storage and mail capture, and cleans up its own stack. [Upgrade testing](../../scripts/selfhost/test-upgrade.mjs) requires explicit previous/current images and verifies page, object, and source-versioned database-row data across image replacement.

One Node process in the `all` role can deliver database realtime events without
Redis. Split `api`/`worker` roles or multiple API replicas require a shared
Redis/Valkey broker and fail realtime readiness when it is unavailable. The
background admin listener exposes `/health`, `/ready`, and sanitized `/metrics`
for worker-only deployments. Runtime details are in the
[database operations guide](../../docs/databases/operations.md).

Both test runners use the shared [cookie jar](../../scripts/selfhost/cookie-jar.mjs), which stores response cookies, preserves replacement and supports combined Set-Cookie headers with expiry commas. It is test-session support, not a browser cookie-policy implementation. The Helm smoke runner retains its narrower getSetCookie-only behavior and its own seed/verify state file. Request helpers remain local where origin, forwarding or response semantics differ.

## Ownership

- [Entrypoint/configuration](../../docker-compose.yml)
- [Implementation](../../Dockerfile)
- [Contributor guide or operational runbook](../../docs/self-hosting/overview.md)
- [Verification](../../scripts/selfhost/test-upgrade.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
