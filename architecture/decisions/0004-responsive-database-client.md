# Responsive database client and mutation protocol

Status: accepted and implemented.

## Context

The legacy interactive database views loaded one `DatabasePayload` containing
metadata, rows and property values. Mutations optimistically replace that query
value and retain a complete snapshot for rollback. This couples unrelated edits:
a slow or failed row move can block interaction or restore state that contains a
newer cell edit. It also makes every database consumer depend on the cost and
shape of the full payload.

The existing realtime outbox and deployment adapters are useful boundaries, but
socket delivery is still too closely coupled to mutation handling. Database
views need bounded reads, independently optimistic commands, ordered recovery,
and one authoritative event format across HTTP acknowledgements and websocket
delivery.

## Decision

### Client ownership and entities

`@zilobase/features` will expose a session-scoped `DatabaseClient` facade. Its
implementation uses pinned TanStack DB Query Collections, but application code
does not import collections directly. One client is created for an authenticated
application session and destroyed when that session changes.

The facade owns top-level collections for database hosts, data sources, views,
properties and records. A record is an atomic rendering aggregate: its page
metadata and `valuesByPropertyId` are embedded even though PostgreSQL continues
to store those concepts in normalized tables. Hosts, sources, views and
properties are eagerly loaded from bootstrap. Records use one on-demand
collection for every authenticated `{databaseId, dataSourceId, viewId,
includeDeleted}` scope. Descriptor IDs and Query keys contain the complete
business scope.

The stable facade is responsible for bootstrap, record windows, command
execution, event ingestion, catch-up and scoped reset. TanStack DB owns local
entities, live projections and optimistic overlays. Existing pure domain
functions continue to evaluate dynamic properties, formulas, rollups, grouping
and view presentation where translating them into collection expressions would
reduce correctness.

TanStack DB is not the owner of authentication, access and sharing, favorites,
navigation, automations, AI, uploads, billing, administration, reporting,
search, Yjs page content, presence or ephemeral interaction state. Those remain
with TanStack Query or their existing subsystem. There is no persistent browser
command queue; editing is online-first.

The online-only client exposes pending and failed command states and guards
reloads while a command is pending. Interrupted transport may replay the same
command once using its receipt; it does not create an offline queue. Command
transport/status, event recovery, and projection snapshot watermarks are separate
modules behind the facade. Reads use one read-only repeatable-read transaction
so their versions and entities are a coherent baseline for event recovery.

### Reads

The v2 HTTP interface separates metadata from records:

- `GET /databases/:databaseId/bootstrap?viewId=:viewId` returns accessible host,
  source, view and property entities without records or values.
- `GET /databases/:databaseId/data-sources/:dataSourceId/records` returns an
  exact offset/limit window plus total count, continuation state, a snapshot and
  host/source versions.
- `GET /databases/:databaseId/mutations?afterVersion=:version&limit=500` returns
  ordered retained mutation events for reconnect recovery.

View configuration persists an `initialPageSize` of `10`, `25`, `50` or `100`;
the default is `50`. Loading more grows the window by that amount. The snapshot
binds the host version, source version and view-configuration revision. A stale
snapshot returns `409 WINDOW_STALE`; the client restarts only that view window
while retaining valid optimistic overlays.

The server applies filter, sort, formula, grouping and row-completeness rules
before slicing. The initial implementation may use the shared in-memory domain
evaluators because the design target is normally fewer than 1,000 rows per data
source. A SQL query planner is deferred until telemetry justifies it.

### Commands and events

Writes use explicit host and source endpoints:

- `POST /databases/:databaseId/commands`
- `POST /databases/:databaseId/data-sources/:dataSourceId/commands`

Every request has protocol version `2`, a client-generated `commandId`, and a
runtime-validated discriminated command. Host commands change host metadata,
source links and views. Source commands change source configuration,
properties, templates, rows and cell values. A command ID and identical body is
replayed from its receipt; a reused ID with a different body returns
`409 COMMAND_ID_REUSED`.

Acknowledgements contain the result and the committed v2 mutation event. HTTP
acknowledgements, websocket delivery and catch-up all enter the same
version-aware client ingestion function. Events contain complete client
entities and explicit removals, never partial untyped patches. Events over the
delivery limit set `requiresReset` instead of truncating changes.

Client command lanes isolate optimism. Ordering and structural commands
serialize per source, view commands serialize per host, and cell writes
serialize per row/property. Independent lanes continue immediately. A failure
rolls back only its transaction overlay; an ordering conflict cancels dependent
unsent ordering commands and reconciles that source.

### Ordering and transactions

Canonical row order moves to PostgreSQL `NUMERIC(30,10)` order keys. Shared code
encodes them as scaled `bigint` values so midpoint calculation is deterministic
in Node, Workers and browsers. Initial keys are spaced by `1024`. Insert and
move transactions take a data-source advisory lock, normally update one row,
and rebalance to `1024, 2048, 3072, ...` before retrying if no midpoint remains.
Database ordering is `order_key, id`.

A move supplies `rowId` and optional neighboring `beforeRowId`/`afterRowId`, not
the full row ID sequence. Anchors must belong to the source and be active. If
both are present they must be correctly ordered; invalid combinations return
`409 ROW_MOVE_CONFLICT`. One remaining valid anchor may be used. Visible anchors
in filtered views locate the move within the complete canonical sequence.
Sorted views retain the existing confirmation that removes their explicit sort
before manual movement.

Row writes update the canonical order key and the affected
`page_item_placement.position` range. `database_row.position` has been removed;
page placement ordering remains a compatibility projection for navigation.

The command side effect, group value, order update, host/source versions,
mutation journal event, command receipt and realtime outbox reference commit in
one PostgreSQL transaction. Linked-source writes create a contiguous host event
for each displaying database with one shared command ID.

### Durable history and realtime topology

The mutation journal is durable recovery history. The realtime outbox records
delivery state and references journal events instead of copying their payloads.
It retains leases, `SKIP LOCKED`, retry backoff, terminal-discard metrics and
recovery sweeps. History is retained for seven days or the newest 10,000 events
per database. A client resets the affected scope when required history is no
longer available or contains a reset event.

Node and Cloudflare are alternative deployments; they never serve the same
environment and no Node-to-Cloudflare event bridge is introduced.

- Managed cloud: the API Worker commits and enqueues a fast background task. A
  background Worker reads the journal-backed outbox and invokes the per-database
  Durable Object, which broadcasts to clients.
- Self-hosted: the API commits and schedules background work. A worker publishes
  through Redis to Node websocket rooms. A single-process `all` role may use an
  in-memory bus; split `api`/`worker` roles and multiple API replicas require
  Redis and fail realtime readiness when it is absent.

HTTP requests never await Redis publication, Durable Object calls or websocket
broadcast. Failed scheduling leaves the outbox entry available for recovery.
Duplicate acknowledgements and socket echoes are suppressed by event/version;
gaps are filled from the mutation journal before later events are applied.

### Completed migration order

The change landed behind the existing contracts: first dependencies and v2
contracts, then schema and dual-written order keys, paged reads, idempotent
commands, journal-backed delivery and catch-up. The client facade and optimistic
lanes follow before database views and secondary consumers migrate. Only after
both Node and Cloudflare understand v2 are the legacy payload, reorder, v1
mutation and v1 realtime contracts removed. Final constraints and observability
land after the compatibility paths are gone.

## Alternatives

Keeping full-payload snapshots cannot isolate overlapping optimistic writes and
continues to load data for metadata-only consumers. A durable browser queue adds
offline conflict semantics that this online-first product does not need.
ElectricSQL would introduce a second synchronization and server persistence
model. Treating Redis or Durable Objects as authoritative history makes gap
recovery deployment-specific. Translating every database-domain expression into
TanStack DB would duplicate tested formula, rollup and view semantics.

## Consequences

The browser has bounded initial work and remains interactive while independent
commands are pending. Rollback is transaction-scoped rather than snapshot-wide.
Server writes gain idempotency, deterministic ordering and an auditable recovery
feed, at the cost of a journal, receipts, dual-write migration and stricter
version handling. TanStack DB's pre-1.0 API is contained behind the feature
facade so it can be upgraded or replaced without another application-wide
migration.

See the current [database architecture](../features/databases/README.md),
[database realtime flow](../features/databases/realtime.md), [background work](../platform/background-work.md)
and [realtime platform](../platform/realtime.md). Operational procedures and
failure diagnosis are in the [database operations guide](../../docs/databases/operations.md).
