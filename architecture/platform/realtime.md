# Realtime

## Interface and flow

Page collaboration, database mutation events, mail updates and workspace navigation invalidations have separate attachment modules. Their tickets, events and recovery are owned by the corresponding feature implementations.

Node and Cloudflare are alternative deployment topologies. Every Node role
(`all`, `api`, and `worker`) requires one configured Redis/Valkey realtime bus.
The Node runtime publishes to its local room first and then through Redis; bus
envelopes carry an instance ID so the publishing process ignores its own Redis
echo. This gives single-process and multi-process deployments the same path
without double delivery. Managed Cloud uses API Worker -> Queue -> background
Worker -> per-database Durable Object and does not require Redis; the API Worker
never calls the Durable Object directly. There is no Node-to-Cloudflare bridge.

Start at the [Node entrypoint](../../apps/server/src/entrypoints/serverful.ts),
then follow the [bus](../../packages/runtime-adapter/src/node/realtime-bus.ts),
[runtime composition](../../packages/runtime-adapter/src/node/node-runtime.ts),
and [database realtime implementation](../../packages/runtime-adapter/src/node/features/database-realtime/database-realtime-runtime.ts).

## Invariants and failure handling

Preserve authorization at ticket creation and connection/use time where implemented. Outbox delivery can be repeated; callers must retain their existing revision/deduplication and reconnect behavior. Do not unify distinct event protocols merely because each uses websockets.

Node startup rejects a missing, malformed, or non-Redis `REALTIME_REDIS_URL`.
After startup, the command and subscriber clients reconnect with bounded,
jittered backoff; errors are structured as `realtime_redis_error`. `/ready` and
the background admin `/ready` fail while either client is unavailable. Shutdown
closes both clients. The Hocuspocus Redis extension retains its library-managed
connections; other Node fanout, notification, and rate-limit features reuse the
single runtime bus.

Database clients deduplicate HTTP acknowledgements and socket echoes by event
identity/version, fill gaps from the mutation journal, and perform a scoped
reset when retained history cannot provide a contiguous sequence.

## Verification

See [tests or test configuration](../../apps/server/src/features/collaboration/service.test.ts), [database operations](../../docs/databases/operations.md), and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
