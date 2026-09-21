# Runtime ports and controller inversion

Status: accepted.

## Context

The unified runtime adapter brought Node and Cloudflare Workers into one package,
but feature behavior remained duplicated between its `node/` and `worker/`
trees. Server features also selected optional runtime methods and inferred
deployment policy from bindings or a `selfHosted` flag. The result was two
implementations of every realtime room, background coordination, database
scope, storage, egress, URL, and lifecycle rule.

## Decision

Introduce the dependency-light `@zilobase/runtime-ports` package. Server-owned
feature controllers depend explicitly on narrow port slices. Node and Worker
modules implement those ports and contain mechanism only. Composition roots
combine the server application, deployment policy, and providers.

The port set covers room hosts and state, fanout, scheduling, jobs, database
scope, object storage, mail, outbound fetch, realtime URLs, HTTP hosting,
request scope, rate limits, meeting state, telemetry, lifecycle, and
environment access. Ports are required rather than optional; configuration is
validated when providers are constructed. Hosted versus community behavior is
an explicit application policy and is independent of runtime kind.

Runtime-neutral controllers are tested once with fake ports and then exercised
against Node and Miniflare provider conformance suites. Runtime adapter code may
not import server implementations, and feature code may not import runtime
providers.

## Consequences

This is an intentionally breaking reset. `ServerRuntimeAdapter`, ambient
runtime lookup, capability fallbacks, deprecated adapter aliases, historical
Durable Object RPC/storage compatibility, and the old migration chain are not
preserved. Node and Worker composition APIs change together. PostgreSQL and
object data are not reset merely because runtime state may be recreated.

This decision supersedes the deferred full room-level inversion in
[ADR 0007](0007-unified-runtime-adapter.md).
