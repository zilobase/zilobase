# Server runtime

## Interface and flow

Hono app creation installs request context, CORS, secure headers, request IDs, JSON body limits, optional JSON compression (self-hosted Node), method-not-allowed handling, Server-Timing, session middleware and the demo write guard before feature route composition. Node entrypoints attach static assets and websocket handlers around that application. The Node HTTP server sends a request to Hono only when [isNodeApiPath](../../apps/server/src/infrastructure/node/api-routing.ts) matches, including `/mail`, `/page-guest-invitations` and `/automation-slack`.

Start at the [entrypoint](../../apps/server/src/app/index.ts); follow the [implementation](../../apps/server/src/infrastructure/runtime/runtime-adapter.ts) and [related modules](../../apps/server/src/app/node).

Effect programs run through [ManagedRuntime](../../apps/server/src/infrastructure/effect/runtime.ts). Feature services are Layers; Hono handlers and other Promise edges call `runPromise`. Process-scoped runtimes register with `createAppRuntime(..., { process: true })` and are disposed on Node shutdown. Application code imports `effect` from the npm package.

Migrated HTTP edges decode untrusted input with Schema and map tagged errors to status codes. Existing Zod validators remain until those routes move.

## Invariants and failure handling

The runtime adapter supplies optional capabilities with capability-specific fallback/error rules. runWithRuntimeAdapter scopes an adapter using AsyncLocalStorage; setRuntimeAdapter supplies a process fallback. Preserve the distinction for concurrent requests.

Shared [HTTP input handling](../../apps/server/src/shared/http/auth.ts) authenticates before parsing required JSON objects, including the existing array acceptance. JSON schema routes can use [hono/validator](../../apps/server/src/shared/http/json.ts) so a missing `Content-Type: application/json` is 400 rather than an empty object. Migrated JSON POST routes decode with [parseJsonBody](../../apps/server/src/shared/http/schema-json.ts). Feature routes retain operation-specific validation and authorization.

`app.onError` maps database-unavailable failures to 503, [HTTP-facing domain errors](../../apps/server/src/shared/http/route-error.ts) (status 4xx/5xx, `HTTPException`, Zod issues) to their existing JSON bodies, and everything else to a generic 500. Isolated feature-route tests attach the same mapper with `attachHttpRouteErrorHandler`. The JSON body limit is 32 MiB so mail compose can carry base64 attachments; oversized bodies return 413. The pure [SHA-256 encoder](../../apps/server/src/shared/crypto/sha256.ts) is shared by provider credentials and OAuth state hashing; encryption, credentials and provider lifecycle remain feature-owned.

## Verification

See [tests or test configuration](../../apps/server/src/app) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Internal organization

[Runtime contracts](../../apps/server/src/infrastructure/runtime/contracts.ts) contain the adapter interface and wire payloads; [runtime context](../../apps/server/src/infrastructure/runtime/runtime-context.ts) owns process fallback and request-scoped selection. The existing runtime-adapter entrypoint re-exports that interface for compatibility and implements capability behavior. Meeting and database realtime wire types live in [shared contracts](../../apps/server/src/shared/contracts), with compatibility type re-exports at the feature entrypoints. Infrastructure no longer imports feature implementations or feature-owned wire declarations.

The [app binding declaration](../../apps/server/src/shared/types.ts) intentionally infers session types from the authentication feature and exposes the canonical Drizzle database type for edition hooks. These are type-only contracts, with a focused `server-bindings` dependency exception; concrete runtime modules do not import authentication implementation code.

Effect adoption is incremental. See [the Effect runtime decision](../decisions/0003-effect-runtime.md).
