# Database operations and troubleshooting

This runbook covers the responsive database client, idempotent command API,
mutation journal, and realtime delivery path. PostgreSQL is authoritative. The
browser collections and every delivery transport are projections that can be
rebuilt from bounded reads and journal catch-up.

## Supported runtime topologies

Node and Cloudflare are alternative deployments. They do not serve the same
environment and there is no Node-to-Cloudflare event bridge.

| Deployment | Database delivery path | Broker requirement |
| --- | --- | --- |
| One Node process in the `all` role | Request -> source room; PostgreSQL outbox -> background retry -> source room | Redis is optional |
| Split Node `api` and `worker` roles, or multiple API replicas | Request -> Redis/Valkey -> API source rooms; outbox worker retries failures | `REALTIME_REDIS_URL` is required; readiness fails without it |
| Managed Cloudflare | API Worker -> per-source Durable Object; Queue/background Worker retries the outbox | The Queue and Durable Object bindings are required |

After the transaction commits, the request path publishes the source event to
Redis/local Node rooms or the per-source Durable Object. Successful publication
removes the outbox row. Publish failure does not reject the committed command;
the durable outbox reference and scheduled background work provide retry.

## Reads and commands

Interactive views first load `GET /databases/:databaseId/bootstrap`, which
contains accessible metadata but no rows. They then request bounded record
windows for one database, data source, and view. The default window is 50 rows;
views may persist 10, 25, 50, or 100. `Load more` extends the requested window.

A record-window snapshot binds the host version, source version, and view
configuration revision. `409 WINDOW_STALE` means that membership or ordering
may have changed. The client restarts only that window and retains valid
optimistic overlays.

Every write uses an idempotent command with a caller-generated `commandId`.
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

HTTP acknowledgements, socket events, and catch-up events enter the same
version-aware client ingestion function. Event IDs and versions suppress HTTP
acknowledgement/socket-echo duplicates. A version gap pauses newer events while
the client calls `GET /data-sources/:sourceId/mutations?afterVersion=...` in
pages of at most 500.

The server retains all journal events from the last seven days and at least the
newest 10,000 events per stream. Command receipts are retained for seven
days. Expired or discontinuous history, a future client version, or a reset
marker produces `resetRequired`; the client then reloads the affected bootstrap
and record scopes. Oversized changes use `requiresReset` instead of publishing
a truncated changeset.

There is no durable browser command queue or offline replay. Optimistic command
lanes exist only for the authenticated application session. Ordering commands
serialize per source, structural commands per source, view commands per host,
and cell writes per row/property so an unrelated edit is never rolled back with
a failed operation.

Outbox workers use leases, `SKIP LOCKED`, retry backoff, and recovery sweeps.
Repeated delivery is expected and safe. Investigate terminally discarded rows;
do not delete pending outbox or journal data to clear an alert.

## Client and server ownership

| Owner | State and responsibilities |
| --- | --- |
| TanStack DB behind `DatabaseClient` | Interactive database hosts, data sources, views, properties, loaded record aggregates, live projections, and optimistic overlays |
| TanStack Query or the existing subsystem | Authentication, access/sharing, favorites/navigation, automation definitions/history/secrets, AI, uploads, billing, admin, reporting, global search, and explicit complete-source export workflows |
| Yjs collaboration | Page document content |
| React-local ephemeral state | Presence, connection status, drag hover and geometry, selection, dialogs, and other transient UI state |
| PostgreSQL | Canonical entities, versions, command receipts, mutation journal, and delivery outbox |
| Redis/Valkey, Cloudflare Queue, and Durable Objects | Delivery and fanout only; never canonical database state |

One database client exists per authenticated application session. Collection
descriptors and query keys include every business-scope value, and logout or an
account change disposes the collections.

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
acknowledgement latency, optimistic rollback, version gaps, scoped resets, and
drag-to-paint timing. Metrics and logs must never contain property values.

## Troubleshooting

| Symptom | Checks and recovery |
| --- | --- |
| Presence works but collaborator cells remain stale | Presence and mutation delivery share the source socket but have separate paths. Confirm `runtime.startup` reports `zilobase.database.v3` and schema target `0093_source_realtime_stream`, then inspect the source ID, source ledger, and Node Redis or Cloud Durable Object path. |
| Commands commit but cards update late on other clients | Compare commit and acknowledgement latency, then inspect immediate-publish errors before the outbox backlog/oldest age. Leave retry rows for the recovery sweep. |
| Split Node roles are not ready | Configure one reachable `REALTIME_REDIS_URL` for every API and worker process. A single `all` process may intentionally run without Redis. |
| Frequent `WINDOW_STALE` responses | Occasional conflicts are normal during active sorting, filtering, or writes. A sustained rate suggests a refetch loop or rapidly changing view configuration. |
| Repeated gap catch-up or resets | Check socket delivery and journal cleanup. Verify retention is seven days/newest 10,000 and that no producer emits partial entities. |
| `ROW_MOVE_CONFLICT` | An anchor was deleted, foreign, reversed, or changed concurrently. Reload the source ordering and retry using current visible neighbors. |
| A source-v3 event has `requiresReset` | Reload the affected source bootstrap/window. Do not attempt to infer a partial entity patch. |
| Cloud acknowledgements succeed but sockets are quiet | Confirm the API Worker has the Durable Object binding and immediate publisher enabled, then check the per-source object, Queue backlog, and background retry state. |
| Outbox backlog grows while workers are healthy | Inspect retry/discard metrics and journal-event availability. Missing canonical history is a recovery fault, not a reason to synthesize a payload. |

## Deployment and verification

Apply database migrations before serving the new application and take a
PostgreSQL backup before upgrades. A self-hosted upgrade must preserve a
pre-existing database row and verify its bootstrap, source-v3 catch-up, and record
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
