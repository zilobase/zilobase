# Background execution architecture

PostgreSQL is the source of truth for all background work. Queue messages and
PostgreSQL notifications contain only a version, cell, task kind, opaque
resource ID, due-time hint, and optional W3C trace context. A missing or
duplicated signal therefore cannot create or lose domain work.

## Runtime topology

- Cloudflare runs `zilobase-server` for HTTP and Durable Objects and
  `zilobase-background` for four queue consumers plus minute cron.
- Serverful deployments use `ZILOBASE_PROCESS_ROLE=all|api|worker`; `all` is
  the default and preserves the single-container installation.
- Node publishes `NOTIFY zilobase_background_v1` after commit, keeps one exact
  timer per lane, and performs a jittered 30-second reconciliation. A dedicated
  PostgreSQL client owns `LISTEN`; normal queries remain on the pool.
- `ZILOBASE_CELL_ID` defaults to `default`. Consumers reject cross-cell tasks.

The execution lanes are `fast`, `automation`, `ai`, and `mail`. Their Node
concurrency defaults are 8, 4, 2, and 2, with environment overrides bounded to
1-50. Cloudflare queue concurrency is deployment configuration and requires no
code change.

## Correctness and retries

Producers commit a domain row first and dispatch afterward. Dispatch errors are
sanitized and never roll back a user mutation. Targeted handlers claim only the
identifier in the task, using leases and `SKIP LOCKED`; recovery invokes the
same bounded domain drainers.

Automation provider work makes one attempt per invocation. Gmail retains three
attempts, webhook four, and Slack four. Retryable failures persist
`nextAttemptAt`, return the step and run to `queued`, preserve successful step
receipts and the external delivery ID, and schedule a delayed task. Retry-After
is capped at fifteen minutes. Long automation and AI jobs renew their lease
every 30 seconds and re-check ownership before each provider call and state
transition.

## Maintenance and health

`background_maintenance_task` stores due time, lease, outcome timestamps,
bounded error code, and consecutive failure count for every periodic task.
Scheduled invocations claim tasks independently; one failure cannot cancel the
others or reset an existing due time.

`GET /health/background` requires `Authorization: Bearer
<ZILOBASE_OPERATIONS_TOKEN>` and describes the entire cell, not the caller's
active workspace. Workspace product APIs remain workspace-authorized.
Worker-only Node processes expose `/health` and `/ready` on loopback at
`BACKGROUND_HEALTH_PORT`; `/metrics` on that listener is Prometheus-compatible.
The Node entrypoint initializes OpenTelemetry and exports OTLP traces whenever
`OTEL_EXPORTER_OTLP_ENDPOINT` (or a trace-specific OTLP setting) is configured.
API request trace context is validated, copied into background messages, and
restored around targeted consumers.

Local Cloudflare development runs the API and background Workers separately,
uses local Queues for delivery, and invokes the manual scheduled endpoint once
per minute. It intentionally has no unconditional five-second scheduler loop.

Hosted deployments start as one cell. `cellId` is present on every message,
but workspace-to-cell routing and additional complete database/queue/Worker
cells remain future control-plane work driven by measured database limits.

## Direct cutover

1. Back up PostgreSQL and record current domain and queue backlog.
2. Enter maintenance mode and enable automation/AI execution kill switches.
3. Stop Node workers and disable the old Worker cron/consumers.
4. Apply migration `0077_background_execution`.
5. Provision the four queues and their four DLQs from the background Wrangler
   configuration.
6. Deploy the API Worker, then the background Worker with consumers disabled.
7. Verify bindings, Hyperdrive, cross-script Durable Objects, task parsing, and
   `/health/background`.
8. Start self-hosted installs with role `all`, enable coordinators, and run one
   reconciliation.
9. Verify event windows, schedules, AI, mail push/sync, realtime fallback, and
   notification publication before reopening traffic.
10. Keep old queues through their retention window, then remove them.

Emergency rollback stops the new background Worker, restores the previous
server/API image and cron configuration, and relies on the previous recovery
scanners. Migration 0077 is additive so the earlier binary remains runnable.

Custom runtime adapters must replace `enqueueDatabaseAutomationRun` and
`enqueueAiJob` with `dispatchBackgroundTasks`. There is intentionally no legacy
adapter shim.
