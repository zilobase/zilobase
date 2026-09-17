# Database mutation and realtime flow

The shared feature package publishes the runtime-validated [protocol-v2 database contracts](../../../packages/features/src/databases/core/entities.ts) for entity bootstrap, bounded record windows, idempotent commands, complete-entity changesets, and typed protocol conflicts. Command traffic and internal producers—including automations, imports, mail synchronization, templates, and relation-driven writes—journal the same v2 event shape. Linked-host events share the originating command ID while retaining a contiguous version per host.

[Realtime persistence and outbox](../../../apps/server/src/features/databases/realtime) coordinate committed mutations with eventual publication. Outbox rows reference the canonical journal event and contain delivery and lease state, not a duplicate event payload. Oversized changes become `requiresReset`; producers otherwise emit complete typed entities, never partial patches. Node and Cloudflare delivery publish protocol v2 only. [Node attachment](../../../apps/server/src/app/node/database-realtime-runtime.ts) owns websocket handling. The session-scoped database client applies acknowledgements, socket events, and history events through one ingestion path.

After the database transaction commits, command and internal mutation paths enqueue only `realtime.database` background tasks. They never call Redis, a Durable Object, or a WebSocket broadcaster directly. Queue/notification failure does not reject an acknowledged mutation: the undelivered outbox reference remains available to the normal recovery sweep.

The [mutation history service](../../../apps/server/src/features/databases/history/service.ts) serves contiguous events after a client version in pages of at most 500. A missing version, malformed event, future client version, expired history, or journal reset marker returns `resetRequired` without applying a partial sequence. Cleanup retains all events from the last seven days and at least the newest 10,000 events per database, and removes expired command receipts.

Every database websocket server frame uses protocol version `2`, including
`realtime.ready`, `presence.update`, `presence.clear`, and
`database.mutation`. The ready frame exposes `databaseVersion`, which is a
catch-up watermark. It is deliberately separate from the room's last
published version: a newly connected ticket must never suppress an event that
committed earlier but is still moving through the background delivery path.
Clients close and reconnect when a known database frame has another protocol
version instead of silently accepting presence while dropping mutations.
Reconnect backoff resets only after a valid `realtime.ready` frame. Receiving
an HTTP ticket does not prove that its WebSocket endpoint accepted the ticket;
repeated upgrade failures continue backing off rather than restarting the
shortest retry delay.

Preserve event identity, versioning, authorization and delivery/retry semantics. A local optimistic mutation and its later realtime event must not be applied twice. Reconnect gaps use journal catch-up; unavailable history or a reset marker reloads only affected scopes. Test duplicate/out-of-order events, rollback, deleted resources and access revocation with the adjacent realtime/client tests.

The [event ingestion coordinator](../../../packages/features/src/databases/client/sync/event-ingestion.ts)
owns one recovery cursor and serialized queue per host. Its initial cursor is
the oldest loaded projection version, rather than the newest view's version.
Only successful event application or a successful reset advances that cursor;
a partial application or failed refetch cannot acknowledge missing changes.
Each collection ignores events already covered by its own snapshot. Empty or
repeating history pages that cannot advance recovery trigger a scoped reset.
Snapshot watermarks prevent an in-flight HTTP read from overwriting newer
committed events. HTTP acknowledgements, websocket messages and history pages
all use this coordinator.

[Database overview](README.md). [Operations and troubleshooting](../../../docs/databases/operations.md).
