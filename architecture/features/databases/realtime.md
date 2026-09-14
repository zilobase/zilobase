# Database mutation and realtime flow

The shared feature package publishes the runtime-validated [protocol-v2 database contracts](../../../packages/features/src/databases/contracts-v2.ts) for entity bootstrap, bounded record windows, idempotent commands, complete-entity changesets, and typed protocol conflicts. Command traffic and internal producers—including automations, imports, mail synchronization, templates, and relation-driven writes—journal the same v2 event shape. Linked-host events share the originating command ID while retaining a contiguous version per host.

[Realtime persistence and outbox](../../../apps/server/src/features/databases/realtime) coordinate committed mutations with eventual publication. Outbox rows reference the canonical journal event and contain delivery and lease state, not a duplicate event payload. Oversized changes become `requiresReset`; producers otherwise emit complete typed entities, never partial patches. Node and Cloudflare delivery publish protocol v2 only. [Node attachment](../../../apps/server/src/app/node/database-realtime-runtime.ts) owns websocket handling. The session-scoped database client applies acknowledgements, socket events, and history events through one ingestion path.

After the database transaction commits, command and internal mutation paths enqueue only `realtime.database` background tasks. They never call Redis, a Durable Object, or a WebSocket broadcaster directly. Queue/notification failure does not reject an acknowledged mutation: the undelivered outbox reference remains available to the normal recovery sweep.

The [mutation history service](../../../apps/server/src/features/databases/history/service.ts) serves contiguous events after a client version in pages of at most 500. A missing version, malformed event, future client version, expired history, or journal reset marker returns `resetRequired` without applying a partial sequence. Cleanup retains all events from the last seven days and at least the newest 10,000 events per database, and removes expired command receipts.

Preserve event identity, versioning, authorization and delivery/retry semantics. A local optimistic mutation and its later realtime event must not be applied twice. Reconnect gaps use journal catch-up; unavailable history or a reset marker reloads only affected scopes. Test duplicate/out-of-order events, rollback, deleted resources and access revocation with the adjacent realtime/client tests.

[Database overview](README.md). [Operations and troubleshooting](../../../docs/databases/operations.md).
