# Poke-and-refetch database client

Status: accepted and implemented. Supersedes [0004-responsive-database-client](0004-responsive-database-client.md).

## Context

The collection-backed client hid TanStack DB Query Collections behind a
session facade with optimistic overlays, per-lane rollback, ordered event
ingestion, snapshot watermarks, and journal catch-up. That machinery kept
interaction responsive, but it also kept a second projection system beside
TanStack Query, with its own overlay maps, ingestion coordinator, and recovery
cursors to maintain.

The product has no users and the database is being reset, so a breaking
simplification is possible. The server protocol (HTTP paths,
`protocolVersion: 2`, ack shape, `database.mutation` and presence frames,
ticket endpoint, `WINDOW_STALE` / `COMMAND_ID_REUSED` / `ROW_MOVE_CONFLICT`
codes) is proven and stays unchanged. Only the client's use of it changes.

## Decision

### Client ownership and entities

Postgres is the only truth and the host `database.version` is the clock.
QueryClient holds one photocopy: the last successful `GET /bootstrap` plus
`GET /records` under `["db", sessionId, hostId, …]`. The UI shows
`draft ?? photocopy`, where `draft` is React-local editor state cleared after
POST plus refetch. There are no collections, overlays, journals, or command
lanes on the client.

The owning modules are [database queries](../../../packages/features/src/databases/queries/keys.ts)
for keys plus `cachedVersion` and prefer-newest helpers,
[bootstrap](../../../packages/features/src/databases/queries/bootstrap.ts) and
[records](../../../packages/features/src/databases/queries/records.ts) hooks,
[command execution](../../../packages/features/src/databases/mutations/execute.ts),
[host invalidation](../../../packages/features/src/databases/mutations/invalidate.ts),
[keyed serialization](../../../packages/features/src/databases/mutations/serialize.ts)
with cell coalescing, [pending state](../../../packages/features/src/databases/mutations/pending.ts),
and the [poke socket](../../../packages/features/src/databases/realtime/realtime.ts).
The [thin session provider](../../../packages/features/src/databases/queries/session.tsx)
supplies only the session id, evicts the previous session's `["db", …]`
queries, and installs the database-only reload guard.

### Reads

Bootstrap and windows are plain TanStack Query reads with `staleTime: 30_000`.
Windows grow by refetching with a larger `limit` at `offset=0`; the latest
page already contains the full window. `WINDOW_STALE` retries once without the
snapshot, then throws. Out-of-order GETs use a prefer-newest guard so a stale
response never regresses newer cached data. A poke compares against the
minimum cached version across the host's queries, so one fresh view cannot
hide a stale sibling.

### Commands and events

Every write posts `POST /databases/:host/commands` or
`POST /databases/:host/data-sources/:source/commands` with an identical
command ID plus serialized body, retrying once on lost transport with the same
body. `409 COMMAND_ID_REUSED`, `409 ROW_MOVE_CONFLICT`, and other 4xx errors
are never retried. Acknowledgement ID and scope mismatches become
unconfirmed. After success the caller invalidates the host queries (plus
matching page-properties and the context export) and converges through a
fresh GET; the acknowledgement is never patched into the cache. A committed
write whose following refresh fails surfaces as a reconciliation error rather
than a rejection. Offline fails fast with no outbox. Cells coalesce per
`(source, row, property)` with at most one in flight plus one queued latest;
ordering and structural writes serialize per source and views per host.
`ROW_MOVE_CONFLICT` invalidates the host and asks for a retry.

### Realtime

The websocket is a doorbell plus presence. `database.mutation` and
`realtime.ready` frames only compare `databaseId` plus `version` against the
minimum cached version and invalidate when newer; frame `changes`, `areas`,
and `requiresReset` payloads are ignored. The ticket HTTP `version` is ignored
for resync. `GET /mutations` is never called from the client; the server
journal and outbox remain write-only pending future cleanup. Presence frames
only update in-memory collaborators and `cellPresenceByKey`. Sockets stay
ref-counted per `(QueryClient, databaseId)` with StrictMode grace and idle
eviction, heartbeat, and backoff that resets only on valid `realtime.ready`.

## Alternatives

Keeping the collection facade preserves optimistic overlays and ordered
ingestion, but keeps two projection systems, lane rollback, watermarks, and
catch-up cursors with no users to benefit. A durable browser queue adds
offline conflict semantics this online-only product does not need. Full window
payloads over the socket would reduce refetch cost but add a second delivery
shape before refetch proves slow.

## Consequences

The browser keeps one QueryClient copy of bootstrap plus windows with zero
collections. Every cell edit refetches its host's bootstraps and windows,
which is wasteful with linked sources or many views and accepted while there
are no users. Interaction stays simple: local draft plus spinner until POST
and GET finish, with distinct pending, failed, unconfirmed, and
saved-but-stale states. The server journal, receipts, outbox, and
`GET /mutations` route remain as write-only history pending future cleanup.

See the current [database architecture](../features/databases/README.md) and
[database realtime flow](../features/databases/realtime.md).

## Amendment: targeted optimistic cache updates

Hot-path mutations (cell values, database/view titles, property add/update)
now patch the QueryClient photocopy synchronously in `onMutate`
([optimistic helpers](../../../packages/features/src/databases/mutations/optimistic.ts))
and roll back in `onError`, so the UI reflects the attempted edit instantly
instead of waiting for POST plus refetch. Version fields are never patched,
so pokes and prefer-newest guards keep working on server versions, and the
normal invalidation refetch still reconciles with committed truth. The
acknowledgement payload itself is still never written into the cache; only
the user-supplied input values are applied optimistically.
