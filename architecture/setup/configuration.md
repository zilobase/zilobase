# Configuration

Server configuration is interpreted by shared/config; the development tooling selects and validates environment inputs. Web feature flags are build-time configuration and do not replace server authorization. [Server configuration](../../apps/server/src/shared/config/config.ts) resolves canonical public origins and required/optional runtime values; [instance discovery](../features/instance/discovery-and-setup.md) publishes only its stable public subset. Development profiles distinguish repository inputs from generated state, while self-host management generates a private environment for its Compose project. [Edition integration](../platform/edition-integration.md) explains configuration supplied by external adapters.

Browser feature flags affect bundled presentation. Authentication, workspace authorization, demo writes and instance bootstrap remain server decisions. Operational runbooks own secret provisioning, encryption and deployment commands; architecture documents link to them rather than reproduce credentials or command sequences. Preserve encrypted environment files, key names and default semantics during source moves.

`REALTIME_REDIS_URL` is required configuration for every Node runtime role and
accepts only `redis://` or `rediss://` URLs. It is not a Worker binding: the
Cloudflare runtime continues to use Queues, Durable Objects, and its Rate Limit
binding. Source-development setup generates the local Node URL automatically.

## Ownership

External AI connectors use the [MCP connection configuration](../features/ai/execution-and-mcp.md) and provider-specific OAuth credentials. Development templates and runtime secret allowlists follow the credentials consumed by those implementations.

- [Entrypoint/configuration](../../apps/server/src/shared/config/config.ts)
- [Implementation](../../scripts/dev/env.mjs)
- [Contributor guide or operational runbook](../../docs/development-workflows.md)
- [Verification](../../apps/web/src/shared/config/feature-flags.ts)

Command definitions remain in [package scripts](../../package.json); consult them for the current invocation. [Architecture index](../README.md).

Calendar requires `CALENDAR_ENABLED=true`, `CALENDAR_ENABLED_WORKSPACE_IDS` (comma-separated IDs or `*`), and `VITE_FEATURE_CALENDAR=true` in the web build. Defaults leave Calendar unavailable.
