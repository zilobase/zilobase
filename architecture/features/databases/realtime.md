# Database mutation and realtime flow

[Server contracts](../../../apps/server/src/features/databases/realtime/contracts.ts) define mutation responses containing mutationId, databaseId, committedAt, version, changed areas and a delta. Realtime events add actorId, protocolVersion and a database.mutation discriminator. requiresRefetch distinguishes updates that cannot be reconciled from the delta alone.

The shared feature package also publishes the additive, runtime-validated [v2 database contracts](../../../packages/features/src/databases/contracts-v2.ts) for entity bootstrap, bounded record windows, idempotent commands, complete-entity changesets and typed protocol conflicts. Server and client runtime paths continue using v1 until their respective migration passes adopt these contracts.

[Realtime persistence and outbox](../../../apps/server/src/features/databases/realtime) coordinate committed mutations with eventual publication. [Node attachment](../../../apps/server/src/app/node/database-realtime-runtime.ts) owns websocket handling. [Shared realtime logic](../../../packages/features/src/databases/realtime.ts) and [page cache integration](../../../packages/features/src/pages/database-realtime-cache.ts) reconcile client data.

Preserve event identity, versioning, authorization and delivery/retry semantics. A local optimistic mutation and its later realtime event must not be applied twice. Reconnect and missing/incomplete deltas must follow existing refetch behavior. Test duplicate/out-of-order events, rollback, deleted resources and access revocation with the adjacent realtime/cache tests.

[Database overview](README.md).
