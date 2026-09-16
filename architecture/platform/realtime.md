# Realtime

## Interface and flow

Page collaboration, database mutation events, mail updates and workspace navigation invalidations have separate attachment modules. Their tickets, events and recovery are owned by the corresponding feature implementations.

Node and Cloudflare are alternative deployment topologies. One Node process in
the `all` role can use in-process database fanout without Redis. Split
`api`/`worker` roles or multiple API replicas require Redis/Valkey and fail
realtime readiness when it is absent. Managed Cloud publishes from the API
Worker to a per-source Durable Object; its Queue/background Worker retries the
durable outbox. There is no Node-to-Cloudflare bridge.

Start at the [entrypoint](../../apps/server/src/app/node); follow the [implementation](../../apps/server/src/features/collaboration) and [related modules](../../apps/server/src/features/databases/realtime).

## Invariants and failure handling

Preserve authorization at ticket creation and connection/use time where implemented. Outbox delivery can be repeated; callers must retain their existing revision/deduplication and reconnect behavior. Do not unify distinct event protocols merely because each uses websockets.

Database clients deduplicate HTTP acknowledgements and socket echoes by event
identity/version, fill gaps from the mutation journal, and perform a scoped
reset when retained history cannot provide a contiguous sequence.

## Verification

See [tests or test configuration](../../apps/server/src/features/collaboration/service.test.ts), [database operations](../../docs/databases/operations.md), and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
