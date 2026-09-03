# Database automation operations runbook

## Release controls

Database automations are intentionally disabled in production while the builder
and execution model are being reworked. Production web builds do not request the
capability or render automation entry points. Compose and Helm deployments set
`DATABASE_AUTOMATIONS_ENABLED=false` and
`DATABASE_AUTOMATIONS_EXECUTION_DISABLED=true` explicitly.

Management UI access is controlled by `DATABASE_AUTOMATIONS_ENABLED` or `DATABASE_AUTOMATIONS_ENABLED_WORKSPACE_IDS`. Provider actions have independent `MAIL_ENABLED`, `AUTOMATION_WEBHOOKS_ENABLED`, and `AUTOMATION_SLACK_ENABLED` gates. `DATABASE_AUTOMATIONS_EXECUTION_DISABLED=true` is the global execution kill switch: event capture continues for diagnosis, while event evaluation, schedule materialization, and run claiming stop. Re-enabling execution drains the existing durable backlog through normal leases and receipts.

Roll out in this order: dark capture, internal workspaces, internal actions, schedules, Gmail, webhooks, Slack, hosted canary, self-hosted opt-in, then general availability. Roll back by disabling the affected connector first, then the execution kill switch if internal actions are also unsafe. Do not roll back migration `0073`–`0075` while definitions or runs remain; disabling capabilities is schema-compatible and rollback-safe.

## Required configuration

- Core: `DATABASE_URL`, the workspace capability gate, and the normal queue/worker adapter.
- Operational health: a high-entropy `ZILOBASE_OPERATIONS_TOKEN` for the deployment-wide `GET /health/background` endpoint.
- Retention: `DATABASE_AUTOMATION_STEP_RETENTION_DAYS` defaults to 7 (range 1–90); `DATABASE_AUTOMATION_RUN_RETENTION_DAYS` defaults to 30 (range 1–365).
- Webhooks: `AUTOMATION_SECRET_ENCRYPTION_KEY`; self-hosted HTTP additionally requires exact `AUTOMATION_WEBHOOK_HTTP_DOMAINS` entries.
- Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and the automation encryption key.
- Gmail: the existing Gmail client and token-encryption configuration.

## Metrics and alerts

Both runtimes emit one bounded `background.heartbeat` per minute. The protected snapshot reports per-lane ready counts and oldest-due age, active/stale leases, leased-maintenance status, cell/runtime identity, and coordinator/listener readiness. A targeted hosted queue delivery that receives `AUTOMATION_WORKSPACE_CAPACITY` is delayed instead of acknowledged; the workspace advisory lock prevents the retry from exceeding the ten-run cap. Alert when any lane is more than two minutes late, an event window is five seconds late at p99, a workspace remains at ten automation leases for five minutes, any DLQ receives a message, or two heartbeats are missed.

The protected health endpoint returns 503 with `Retry-After: 30` when durable backlog age exceeds two minutes, stale leases exist, maintenance repeatedly fails, or the coordinator is unavailable. Metrics and logs may contain runtime, cell, lane, task kind, outcome, bounded error codes, and opaque IDs only—never definitions, property values, messages, email addresses, headers, OAuth tokens, or provider response bodies.

## Incident response

1. Identify whether the growth is capture, evaluation, run execution, notification outbox, or a connector delivery.
2. Disable the smallest affected capability. Use the global execution kill switch only for cross-capability failures.
3. Preserve the database and worker logs. Inspect aggregate health and the redacted source audit export; do not query or paste encrypted secret columns.
4. Repair authority, connector, schema dependency, or worker capacity. Expired leases are reclaimed automatically, and stable receipts make replay safe.
5. Re-enable in one internal workspace, observe backlog age and duplicate-delivery signals, then continue the rollout.
6. Explicitly repair/resume automations left in `error`; saving a definition never silently resumes it.

## Maintenance and recovery

The leased maintenance table schedules retention hourly and reruns it after one minute while deletions remain. Cleanup deletes at most 1,000 terminal records of each class per invocation, never queued/running work. Detailed steps and delivery receipts use the detail window; terminal run summaries, closed event windows, and deleted automations use the summary window.

Before and after upgrades, run clean-install and upgrade-from-`0072` migrations, the full server/features/web suites, hosted adapter tests, and a self-hosted worker restart test. During failover, start only workers sharing the same PostgreSQL database; advisory workspace locks, row leases, unique occurrences, action receipts, and stable delivery IDs provide recovery boundaries.

The authenticated source audit endpoint is `GET /databases/:databaseId/automations/audit?dataSourceId=...`. It exports lifecycle/version/hash, action types, aggregate dependencies, and run counts. It deliberately excludes definitions, values, recipients, connector metadata, and secrets.
