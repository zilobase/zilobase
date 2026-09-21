# Database operations and troubleshooting

This runbook covers the poke-and-refetch database client, idempotent command
API, mutation journal, and realtime delivery path. PostgreSQL is authoritative.
The browser QueryClient copy and every delivery transport are projections that
can be rebuilt from bounded reads.

## Supported runtime topologies

Node and Cloudflare are alternative deployments. They do not serve the same
environment and there is no Node-to-Cloudflare event bridge.

| Deployment | Database delivery path | Broker requirement |
| --- | --- | --- |
| One Node process in the `all` role | PostgreSQL outbox -> in-process background coordinator -> local WebSocket room + Redis/Valkey publication | `REALTIME_REDIS_URL` is required; self-published Redis envelopes are ignored by instance ID |
| Split Node `api` and `worker` roles, or multiple API replicas | PostgreSQL outbox -> background worker -> Redis/Valkey -> API WebSocket rooms | The same `REALTIME_REDIS_URL` is required in every process; readiness fails while it is unavailable |
| Managed Cloudflare | API Worker -> fast Queue -> background Worker -> per-database Durable Object -> WebSocket clients | The Queue and Durable Object bindings are required |

The HTTP request path never publishes to Redis, calls a Durable Object, or
broadcasts to sockets. It commits the command and schedules a fast background
task. If scheduling fails, the durable outbox reference remains for a recovery
sweep.

## Reads and commands

Interactive views first load `GET /databases/:databaseId/bootstrap`, which
contains accessible metadata but no rows. They then request bounded record
windows for one database, data source, and view. The default window is 50 rows;
views may persist 10, 25, 50, or 100. `Load more` extends the requested window.

A record-window snapshot binds the host version, source version, and view
configuration revision. `409 WINDOW_STALE` means that membership or ordering
may have changed. The client retries that window once without the snapshot;
the user's own edit stays visible as local draft state until POST plus refetch
finishes.

Every write uses a protocol-v2 command with a caller-generated `commandId`.
Replaying the same ID and identical request returns the stored acknowledgement
without repeating side effects. Reusing it for a different request returns
`409 COMMAND_ID_REUSED`. The domain write, host/source versions, mutation
journal event, command receipt, and delivery outbox reference commit in one
PostgreSQL transaction.

Rows are ordered by `database_row.order_key, id`. Keys are canonical
`NUMERIC(30,10)` decimals with initial spacing of 1024. Inserts and moves take a
transaction-scoped advisory lock for the data source, choose a deterministic
midpoint, and rebalance inside the same transaction when precision is
exhausted. `page_item_placement.position` remains a compatibility projection.
Invalid or reversed anchors return `409 ROW_MOVE_CONFLICT`; clients reconcile
the source before retrying.

## Catch-up, retention, and reset

Socket events are version pokes, not payloads: when a `database.mutation` or
`realtime.ready` frame carries a version above the minimum cached version for
that host, the client invalidates the host queries and refetches. The client
never calls `GET /databases/:databaseId/mutations`; frame changesets are
ignored because the version bump already covers them.

The server retains all journal events from the last seven days and at least the
newest 10,000 events per database. Command receipts are retained for seven
days. Expired or discontinuous history, a future client version, or a reset
marker produces `resetRequired` on the server feed; the poke-and-refetch client
converges through its following GET instead. Oversized changes use
`requiresReset` instead of publishing a truncated changeset.

There is no durable browser command queue or offline replay. Writes serialize
through tiny keyed queues: ordering and structural commands per source, view
commands per host, and cell writes coalesced per source/row/property (one in
flight plus the latest queued value) so concurrent edits to different cells
stay parallel.

The toolbar shows `Saving…` while commands are pending and asks the browser to
confirm reload/close during that interval. Offline edits fail without entering
a queue. `Save failed` means to correct or repeat the edit. `Save unconfirmed`
means a transport failure left the result uncertain: reload to check the server
before repeating an operation such as creating a page. The client first retries
an interrupted request once with the same command ID to recover its receipt.
`Saved — reload to refresh` means the server confirmed the write but the client
could not reconcile its projection; do not repeat that write.

Bootstrap and record-window reads use a single read-only repeatable-read
transaction. Out-of-order GETs use a prefer-newest guard so a stale response
never regresses newer cached data, and pokes compare against the minimum cached
version across the host's queries so one fresh view cannot hide a stale sibling.

Outbox workers use leases, `SKIP LOCKED`, retry backoff, and recovery sweeps.
Repeated delivery is expected and safe. Investigate terminally discarded rows;
do not delete pending outbox or journal data to clear an alert.

## Client and server ownership

| Owner | State and responsibilities |
| --- | --- |
| TanStack Query `["db", …]` cache | Last successful database bootstrap plus record windows; never unsaved values |
| TanStack Query or the existing subsystem | Authentication, access/sharing, favorites/navigation, automation definitions/history/secrets, AI, uploads, billing, admin, reporting, global search, and explicit complete-source export workflows |
| Yjs collaboration | Page document content |
| React-local ephemeral state | Cell drafts, presence, connection status, drag hover and geometry, selection, dialogs, and other transient UI state |
| PostgreSQL | Canonical entities, versions, command receipts, mutation journal, and delivery outbox |
| Redis/Valkey, Cloudflare Queue, and Durable Objects | Delivery and fanout only; never canonical database state |

A thin session provider exists per authenticated application session. Query
keys include the session id plus every business-scope value, and a session
change evicts the previous session's `["db", …]` queries so no cross-account
data leaks through the shared QueryClient.

## Monitoring

The Node background admin server exposes Prometheus data at `/metrics` alongside
its health and readiness endpoints. Alert on sustained change, not a single
retry. Database metrics include:

- `zilobase_database_commit_duration_ms`
- `zilobase_database_enqueue_duration_ms`
- `zilobase_database_acknowledgement_latency_ms`
- `zilobase_database_ordering_conflict`
- `zilobase_database_outbox_backlog`
- `zilobase_database_outbox_oldest_age_ms`

The web client emits sanitized `zilobase:database:metric` events for
acknowledgement latency, command failures, and drag-to-paint timing. Metrics
and logs must never contain property values.

## Troubleshooting

| Symptom | Checks and recovery |
| --- | --- |
| Presence works but collaborator cells remain stale | Presence and mutation delivery share a socket but have separate paths. Confirm `runtime.startup` reports `zilobase.database.v2` and the current schema target, then inspect `background.node_lane_operation` for `database_realtime` or the Cloud Queue/DO path. In local development, restart `npm run dev`; the supervised API now watches server/database-client/migration changes and migrates before listening. |
| Commands commit but cards update late on other clients | Compare commit and enqueue latency, then inspect outbox backlog/oldest age and the background worker. Leave rows for the recovery sweep. |
| A Node role is not ready | Confirm every `all`, `api`, and `worker` process has the same reachable `REALTIME_REDIS_URL`. Inspect `realtime_redis_error`; readiness should recover after the broker reconnects. |
| Frequent `WINDOW_STALE` responses | Occasional conflicts are normal during active sorting, filtering, or writes. A sustained rate suggests a refetch loop or rapidly changing view configuration. |
| Repeated invalidations without settling | Check socket delivery and journal cleanup. Verify retention is seven days/newest 10,000 and that no producer emits partial entities. A refetch loop or rapidly changing view configuration can also keep the version moving. |
| `ROW_MOVE_CONFLICT` | An anchor was deleted, foreign, reversed, or changed concurrently. Reload the source ordering and retry using current visible neighbors. |
| A v2 event has `requiresReset` | The client ignores the frame payload and refetches on the version bump. Do not attempt to infer a partial entity patch. |
| Cloud acknowledgements succeed but sockets are quiet | Check Queue backlog and retry state, the background Worker binding, then the database Durable Object. The API Worker must not invoke the Durable Object directly. |
| Outbox backlog grows while workers are healthy | Inspect retry/discard metrics and journal-event availability. Missing canonical history is a recovery fault, not a reason to synthesize a payload. |

## Deployment and verification

Apply database migrations before serving the new application and take a
PostgreSQL backup before upgrades. A self-hosted upgrade must preserve a
pre-existing database row and verify its protocol-v2 bootstrap and record
window after image replacement, in addition to page content and stored objects.

Run the core acceptance suite before release:

```sh
npm run test:databases:acceptance
```

The full matrix additionally needs explicit previous/current self-host images
and deployable Cloudflare production configuration:

```sh
ZILOBASE_PREVIOUS_IMAGE=... ZILOBASE_CURRENT_IMAGE=... npm run test:databases:acceptance:full
```

For the Cloudflare adapter, run its build, complete test suite, Worker-pool
tests, and deployment dry-run. A dry-run failure caused by placeholder
production bindings must be resolved before promotion; it is not waived by a
successful unit test.

See the [database architecture](../../architecture/features/databases/README.md),
[database realtime flow](../../architecture/features/databases/realtime.md),
[background work](../../architecture/platform/background-work.md),
[realtime platform](../../architecture/platform/realtime.md), and
[self-hosted operations](../self-hosting/operations.md).
