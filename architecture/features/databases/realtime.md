# Database mutation and realtime flow

The shared feature package publishes the runtime-validated [protocol-v2 database contracts](../../../packages/features/src/databases/core/entities.ts) for entity bootstrap, bounded record windows, idempotent commands, complete-entity changesets, and typed protocol conflicts. Command traffic and internal producers—including automations, imports, mail synchronization, templates, and relation-driven writes—journal the same v2 event shape. Linked-host events share the originating command ID while retaining a contiguous version per host.

[Realtime persistence and outbox](../../../apps/server/src/features/databases/realtime) coordinate committed mutations with eventual publication. Outbox rows reference the canonical journal event and contain delivery and lease state, not a duplicate event payload. Oversized changes become `requiresReset`; producers otherwise emit complete typed entities, never partial patches. Node and Cloudflare delivery publish protocol v2 only. The [Node attachment](../../../packages/runtime-adapter/src/node/features/database-realtime/database-realtime-runtime.ts) owns websocket handling and always publishes local-first through the required shared Redis/Valkey bus; its instance ID suppresses the process's Redis echo.

After the database transaction commits, command and internal mutation paths enqueue only `realtime.database` background tasks. They never call Redis, a Durable Object, or a WebSocket broadcaster directly. Queue/notification failure does not reject an acknowledged mutation: the undelivered outbox reference remains available to the normal recovery sweep.

The [mutation history service](../../../apps/server/src/features/databases/history/service.ts) remains server-only for now and is write-only from the client's perspective: it serves contiguous events after a client version in pages of at most 500 for future cleanup, but the poke-and-refetch client never calls `GET /mutations`. A missing version, malformed event, future client version, expired history, or journal reset marker would return `resetRequired` without applying a partial sequence. Cleanup retains all events from the last seven days and at least the newest 10,000 events per database, and removes expired command receipts. Future cleanup may remove the dead client catch-up path entirely.

Every database websocket server frame uses protocol version `2`, including
`realtime.ready`, `presence.update`, `presence.clear`, and
`database.mutation`. The ready frame exposes `databaseVersion`, which the
client treats as a poke: when it exceeds the minimum cached version for that
host, the client invalidates the host `["db", …]` queries plus matching
page-properties and the context export, then refetches. The ticket HTTP
`version` is ignored for resync and never suppresses a poke. Clients close and
reconnect when a known database frame has another protocol version instead of
silently accepting presence while dropping mutations. Reconnect backoff resets
only after a valid `realtime.ready` frame. Receiving an HTTP ticket does not
prove that its WebSocket endpoint accepted the ticket; repeated upgrade
failures continue backing off rather than restarting the shortest retry delay.

The client never applies `database.mutation` frame payloads to its cache.
`changes`, `areas`, and `requiresReset` are ignored because the version bump
already covers them; convergence comes from the following GET. Presence
(`presence.update` / `presence.clear`) only touches in-memory collaborators
and `cellPresenceByKey`, never QueryClient data. Test poke thresholds,
presence grouping, ticket handling, and backoff with the adjacent realtime
tests.

[Database overview](README.md). [Operations and troubleshooting](../../../docs/databases/operations.md).
