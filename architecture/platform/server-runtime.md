# Server runtime

## Interface and flow

Hono app creation installs request context, CORS, secure headers, request IDs, JSON body limits, optional JSON compression (self-hosted Node), method-not-allowed handling, Server-Timing, session middleware and the demo write guard before feature route composition. Node entrypoints attach static assets and websocket handlers around that application. The Node HTTP server sends a request to Hono only when [isNodeApiPath](../../packages/runtime-adapter/src/node/api-routing.ts) matches, including `/mail`, `/page-guest-invitations` and `/automation-slack`.

Start at the [entrypoint](../../apps/server/src/entrypoints/serverful.ts); follow the [node runtime factory](../../packages/runtime-adapter/src/node/node-runtime.ts) and [worker factory](../../packages/runtime-adapter/src/worker/worker.ts).

Effect programs run through [ManagedRuntime](../../apps/server/src/infrastructure/effect/runtime.ts). Feature services are Layers; Hono handlers and other Promise edges call `runPromise`. Process-scoped runtimes register with `createAppRuntime(..., { process: true })` and are disposed on Node shutdown. Application code imports `effect` from the npm package.

Migrated HTTP edges decode untrusted input with Schema and map tagged errors to status codes. Existing Zod validators remain until those routes move.

## Unified runtime adapter

The accepted target is explicit dependency inversion through
[`@zilobase/runtime-ports`](../../packages/runtime-ports). The migration is
tracked by [ADR 0008](../decisions/0008-runtime-ports-and-controller-inversion.md):
feature controllers consume narrow port slices while Node and Worker modules
provide mechanism. The migration intentionally permits breaking API changes:
the platform has no production users, so compatibility shims must not preserve
runtime-aware feature APIs or slow removal of the old adapter surface.

Both runtimes live in [`@zilobase/runtime-adapter`](../../packages/runtime-adapter) as isolated subpaths:

```text
@zilobase/runtime-adapter
├── .            # port context, capabilities, resolve, dispatcher (no heavy deps)
├── ./contracts  # compatibility wire payloads during the final deletion pass
├── ./resolve    # resolveRuntimeKind(env): "node" | "worker"
├── ./node       # createNodeRuntime, startNodeServer, websocket runtimes, migrations
└── ./worker     # createWorker, createBackgroundWorker, DO rooms, web gateway
```

`node/*` never imports `worker/*` and vice versa; the root entrypoint imports neither side. `dispatcher.ts` loads one side through dynamic `import()` only. The adapter consumes `@zilobase/server` surfaces (`adapter-api`, `node-adapter-api`) and never reaches into server source relatively; `community-boundary` tests enforce the split. `resolveRuntimeKind` selects `"worker"` only for explicit `ZILOBASE_RUNTIME_KIND=worker` and otherwise defaults to `"node"`; bindings are never used as runtime detection.

`createNodeRuntime` takes `loadApp` plus hook overrides (edition extension, production-config assert, realtime bus, collaboration extensions, pinned webhook/MCP transports, background coordinator) with community defaults; `apps/server` passes Zilobase wiring through hooks in [serverful.ts](../../apps/server/src/entrypoints/serverful.ts). `createWorker`/`createBackgroundWorker` compose Worker providers directly and take product seams (edition extension, error/event reporters, demo guard, session-policy denial, CORS), not a generic runtime adapter. Community registration/workspace behavior and managed hosted behavior are explicit `AppPolicy` values passed to app and Worker construction; runtime kind no longer selects product policy.

Community Cloudflare deployment uses the [worker templates](../../packages/runtime-adapter/deploy/worker/README.md); see the [Cloudflare self-host runbook](../../docs/runbooks/cloudflare-selfhost.md). Durable Object migration history (`v1..v14 + calendar-v1`) is frozen; `template-parity` tests pin templates to the hosted composition.

## Invariants and failure handling

Runtime ports are installed through `runWithRuntimePorts` for concurrent
requests and `setRuntimePorts` for process composition. Feature code never
looks up a `ServerRuntimeAdapter`; compatibility exports remain isolated from
production call paths until their final package removal.

Object storage, mail delivery, webhook egress, and MCP egress now require an
explicit runtime provider. The Node side owns S3, SMTP/console mail, and pinned
network transports; the Worker side owns R2, Email bindings, and Worker fetch
options. Server features no longer select S3 versus R2 or SMTP versus Email.

Background dispatch is the first request-scoped port cutover. Feature services
call `Ports.jobs.dispatch`; Node provides a PostgreSQL wake-up/coordinator and
Workers provide Queue bindings. `dispatchBackgroundTasks` is no longer an
optional `ServerRuntimeAdapter` capability. Node and Worker scheduler providers
likewise contain `setTimeout().unref()` and `waitUntil`/alarm mechanics, while
the runtime factories expose lifecycle through `Ports.lifecycle`. The app's
port object is installed in AsyncLocalStorage for non-HTTP feature calls and in
the Hono request variables for handlers.

Realtime admission uses `Ports.limits`: Node selects Redis-backed counters for
split deployments and a fixed-window process counter for all-in-one mode;
Workers adapt the Rate Limit binding. Runtime factories also install
`Ports.telemetry`, so request and background error/event reporting no longer
branches on hosted versus self-hosted execution.

The neutral room kernel lives in `@zilobase/features/runtime/room-kernel`.
Controllers register message, close, error, alarm, and RPC handlers once
against `RoomPorts`. Runtime adapters provide Node and Worker `RoomHost` and
`RoomState` implementations; `FakeRoomHost`/`FakeRoomState` exercise the same
controller in unit tests. Feature-room migrations must reuse this kernel
instead of adding another crossws or Durable Object implementation.

Calendar, mail, and navigation notification sockets now share one expiring
notification controller. Node's crossws runtime and Worker Durable Objects both
adapt peers into the same controller for ping/pong, expiry pruning, validation,
recipient selection, and broadcast; authentication and wire-specific payload
encoding remain small composition options.

Database mutation delivery now targets `Ports.fanout` with `db:<databaseId>`
channels. Node fanout reaches the local room and Redis-backed cross-instance
topology; Worker fanout invokes the database Durable Object and intentionally
uses a no-op subscription because the object is the single writer. JSON frame
validation, presence validation/serialization, and message-rate windows are
one feature-owned protocol module shared by both room hosts.

Page content replacement is also a room command rather than an optional
runtime-adapter callback. Features publish `page:<pageId>:replace`; Node invokes
the resident Hocuspocus page room and Workers invoke the named page Durable
Object. The command payload and routing are runtime-neutral, while socket
hibernation remains a Worker host concern.

Meeting recorder ownership and transcript/summary document RPCs use
`Ports.meetings`. The Worker provider targets the meeting Durable Object for
claim/transition/release/get/apply operations; serverful Node retains the
database lease and resident Hocuspocus implementation. Meeting feature code no
longer calls optional meeting methods on `ServerRuntimeAdapter`.

The chat agent's room identity, request ownership, and canonical-message merge
live in `@zilobase/features/ai-chat/agent-room`. The Cloudflare `AIChatAgent`
class is only a host adapter around that shared behavior, so neither identity
validation nor message reconciliation depends on Durable Object APIs.

Composition now supplies `Env`, `UrlResolver`, `ImageStorage`, `Mailer`,
`OutboundFetch`, and document RPC providers. Node maps `DATABASE_URL`, S3,
SMTP, pinned network transports, and resident Hocuspocus; Workers map
Hyperdrive, R2, Email, Worker fetch options, and named Durable Objects. The
hosted repository composes `createWorker` directly and no longer constructs a
`createWorkerAdapter`. URL and storage helpers are thin port lookups, and
calendar/mail/navigation/in-product publication uses `FanoutBus` channels.

Shared [HTTP input handling](../../apps/server/src/shared/http/auth.ts) authenticates before parsing required JSON objects, including the existing array acceptance. JSON schema routes can use [hono/validator](../../apps/server/src/shared/http/json.ts) so a missing `Content-Type: application/json` is 400 rather than an empty object. Migrated JSON POST routes decode with [parseJsonBody](../../apps/server/src/shared/http/schema-json.ts). Feature routes retain operation-specific validation and authorization.

`app.onError` maps database-unavailable failures to 503, [HTTP-facing domain errors](../../apps/server/src/shared/http/route-error.ts) (status 4xx/5xx, `HTTPException`, Zod issues) to their existing JSON bodies, and everything else to a generic 500. Isolated feature-route tests attach the same mapper with `attachHttpRouteErrorHandler`. The JSON body limit is 32 MiB so mail compose can carry base64 attachments; oversized bodies return 413. The pure [SHA-256 encoder](../../apps/server/src/shared/crypto/sha256.ts) is shared by provider credentials and OAuth state hashing; encryption, credentials and provider lifecycle remain feature-owned.

## Verification

See [testing and quality](../setup/testing-and-quality.md) and the adapter's [unit tests](../../packages/runtime-adapter/test) plus colocated [node tests](../../packages/runtime-adapter/src/node) and [worker tests](../../packages/runtime-adapter/test/worker). [Architecture index](../README.md).

## Internal organization

[Runtime ports](../../packages/runtime-ports/src/index.ts) contain the neutral
contracts; [runtime context](../../packages/runtime-adapter/src/context.ts)
owns process fallback and request-scoped selection; [capabilities](../../packages/runtime-adapter/src/capabilities.ts)
are compatibility-named thin port lookups. Meeting and database realtime wire
types live in [shared contracts](../../apps/server/src/shared/contracts), with
compatibility type re-exports at feature entrypoints. Infrastructure no longer
imports feature implementations or feature-owned wire declarations.

The [app binding declaration](../../apps/server/src/shared/types.ts) intentionally infers session types from the authentication feature and exposes the canonical Drizzle database type for edition hooks. These are type-only contracts, with a focused `server-bindings` dependency exception; concrete runtime modules do not import authentication implementation code.

Effect adoption is incremental. See [the Effect runtime decision](../decisions/0003-effect-runtime.md) and [the unified adapter decision](../decisions/0007-unified-runtime-adapter.md).
