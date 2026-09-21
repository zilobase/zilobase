# Local development

The development CLI coordinates dependency containers and local Node processes. [Profile configuration](../../scripts/dev/config.mjs) owns runtime ports, origins, database/bucket identities and generated-state locations. [Environment setup](../../scripts/dev/env.mjs) owns template creation and generated configuration migration; [process support](../../scripts/dev/process.mjs) owns subprocess shutdown, port availability and log redaction. [Local runtime orchestration](../../scripts/dev/local.mjs) and [Kubernetes orchestration](../../scripts/dev/k8s.mjs) keep their separate lifecycle semantics.

[Desktop profile startup](../../scripts/desktop/profile.mjs) reuses the development configuration, while the [macOS debug runner](../../scripts/desktop/run-signed-macos-debug.mjs) owns local signing and launch. The CLI owns setup/status/logs/down/reset behavior; setup also installs the
path-filtered Git commit and push hooks. The runbook explains when to use each command. Reset commands are destructive operational actions, not refactor verification.

The normal `npm run dev` dependency set includes PostgreSQL, MinIO, Mailpit,
and Valkey. Generated Node configuration points `REALTIME_REDIS_URL` at the
loopback Valkey port, so source development exercises the same mandatory bus
topology as self-hosted deployments without a manual broker step.

## Ownership

- [Entrypoint/configuration](../../scripts/dev/cli.mjs)
- [Implementation](../../scripts/dev/config.mjs)
- [Contributor guide or operational runbook](../../docs/development-workflows.md)
- [Verification](../../scripts/dev/dev-workflow.test.mjs)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

Mail flags are operator-owned in the development environment; setup removes legacy generated `MAIL_ENABLED` overrides. The Gmail config checker accepts `--profile=node` to inspect effective configuration.

`ZILOBASE_DEV_PUBLIC_ORIGIN` selects an HTTPS same-origin tunnel profile for OAuth/push canaries. The tunnel targets Vite; `VITE_BACKEND_PROXY_TARGET` stays loopback so proxy traffic cannot loop. Desktop inherits the public API origin.
