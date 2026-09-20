# Mandatory Redis bus for Node realtime

Status: accepted.

## Context

The Node runtime previously selected two topologies. A single `all` process
could omit Redis and fall back to process-local fanout and rate limits, while
split roles and multiple replicas required Redis. Realtime rooms, limits,
readiness, collaboration extensions, and background delivery consequently
carried nullable bus branches. The local topology received less production-like
exercise, and moving from one process to several changed application behavior
as well as deployment shape.

Cloudflare Workers already use a separate Queue, Durable Object, and Rate Limit
topology. Requiring Redis in Node must not introduce a Node dependency into the
Worker runtime.

## Decision

Every Node process role (`all`, `api`, and `worker`) requires a valid
`redis://` or `rediss://` `REALTIME_REDIS_URL`. The Node composition root creates
one non-nullable realtime bus and shares it with fanout, notification rooms,
database realtime, background publication, readiness, and distributed limits.
The Hocuspocus Redis extension keeps its own library-managed connections.

Publishing remains local-first and then publishes an envelope through Redis.
Each bus owns an instance ID and ignores envelopes from itself, so an `all`
process delivers once locally without receiving its own Redis echo. The command
and subscriber clients reconnect with bounded jittered backoff; their combined
status controls application and background readiness, and both close during
shutdown.

The Worker/Durable Object path is unchanged and does not read
`REALTIME_REDIS_URL`.

## Alternatives

- Keep the in-process fallback for `all`: rejected because it preserves two
  Node topologies, nullable contracts, and a local path that does not exercise
  distributed limits or Redis failure recovery.
- Publish only through Redis and consume the self-message: rejected because it
  adds broker latency to local delivery and changes the existing local-first
  behavior. Instance-ID suppression already prevents double delivery.
- Give each feature a dedicated Redis client pair: rejected because lifecycle,
  readiness, reconnection, and connection count should be owned once by Node
  composition unless an integration library manages its own connections.
- Add Cluster or Sentinel discovery now: rejected because a normal Redis URL is
  the current deployment contract; managed failover can remain behind that
  endpoint until a concrete need requires another configuration surface.

## Consequences

Node boot fails immediately when `REALTIME_REDIS_URL` is absent or invalid.
Compose and source-development tooling provision Valkey automatically; Helm
requires an operator-managed broker Secret even for one replica. A live broker
outage makes readiness fail without terminating the process, and readiness
recovers after Redis reconnects.

This decision narrows only Node configuration. Worker deployments retain their
existing bindings and Durable Object topology. See the [realtime platform
guide](../platform/realtime.md) and canonical [Node bus
implementation](../../packages/runtime-adapter/src/node/realtime-bus.ts).
