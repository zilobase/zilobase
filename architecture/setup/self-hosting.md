# Self-hosting

The public deployment packages the core Node application and web assets. Instance bootstrap establishes initial administration and registration policy. Operators own persistent database/storage configuration and backups. Bundled object storage is RustFS on the `minio` service, as recorded in [ADR 0010](../decisions/0010-bundled-s3-is-rustfs.md). An internal refactor must preserve bootstrap, readiness, migration and upgrade entrypoints. [Self-host management](../../scripts/selfhost/manage.mjs) creates a private development environment and owns Compose up/logs/down/reset/test dispatch. [End-to-end testing](../../scripts/selfhost/test.mjs) uses isolated project names, temporary state, local object storage and mail capture, and cleans up its own stack. [Upgrade testing](../../scripts/selfhost/test-upgrade.mjs) requires explicit previous/current images and verifies page, object, and protocol-v2 database-row data across image replacement.

Every Node process role requires a shared Redis/Valkey broker, including one
`all` process. Missing or invalid configuration stops boot; an unavailable
broker fails application and background readiness while the clients reconnect. The
background admin listener exposes `/health`, `/ready`, and sanitized `/metrics`
for worker-only deployments. Runtime details are in the
[database operations guide](../../docs/databases/operations.md).

Both test runners assert the same public API contract through the shared [API conformance module](../../scripts/selfhost/api-conformance.mjs), which owns instance bootstrap, sign-in, the desktop PKCE consent flow, page CRUD, collaboration-ticket WebSocket upgrades and profile-image round trips. The module takes the reachable `internalOrigin` and the `publicOrigin` the server advertises, so Compose and Helm probes differ only in configuration. The module deliberately has no bare npm imports, because the Helm gate copies it and the [cookie jar](../../scripts/selfhost/cookie-jar.mjs) into a pod's `/tmp`, where `node_modules` is not resolvable. The cookie jar stores response cookies, preserves replacement and supports combined Set-Cookie headers with expiry commas; it is test-session support, not a browser cookie-policy implementation. Target-specific orchestration stays in each runner: the Helm runner keeps its own seed/verify state file across the paired restore, and the Compose runner owns Compose lifecycle, backup, restore and diagnostics.

Zilobase also self-hosts on Cloudflare Workers through the community
[`@zilobase/runtime-adapter`](../../packages/runtime-adapter) package
(`./node` + `./worker` subpaths, placeholder-only [deploy templates](../../packages/runtime-adapter/deploy/worker/README.md)).
The hosted `zilobase-cloud` composition adds only gated policy (identity,
demo guard, telemetry, production bindings). Provisioning and smoke steps are
in the [Cloudflare self-host runbook](../../docs/runbooks/cloudflare-selfhost.md);
runtime seams are in the [server runtime guide](../platform/server-runtime.md).

## Ownership

- [Entrypoint/configuration](../../docker-compose.yml)
- [Implementation](../../Dockerfile)
- [Contributor guide or operational runbook](../../docs/self-hosting/overview.md)
- [Verification](../../scripts/selfhost/test-upgrade.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).
