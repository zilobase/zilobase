# Zilobase Server

```sh
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts the normal Node/serverful backend on port `3000`.

## Self-hosted bootstrap and registration

Production Node deployments require `ZILOBASE_BOOTSTRAP_TOKEN`. Submit it only
in the `Authorization: Bearer` or `X-Zilobase-Bootstrap-Token` header to
`POST /api/instance/bootstrap`; query-string and request-body tokens are not
accepted. Bootstrap transactionally creates one verified owner, one pinned
workspace, and an owner membership, then permanently marks the instance as
initialized. The bootstrap token is the initial proof of operator control, so
the owner does not complete an email OTP challenge during setup. The web setup
flow signs that owner in through the normal password endpoint immediately after
bootstrap succeeds.

When upgrading an older self-hosted database, the migration pins its earliest
workspace and treats that installation as already bootstrapped; it does not
create another administrator or workspace.

After bootstrap, registration is `invite-only`. The pinned workspace owner can
read and update `GET/PATCH /api/instance/settings` to choose `invite-only` or
`open`. In open mode, verified accounts become workspace members when their
session is restored. In invite-only mode, Better Auth user creation requires a
pending, unexpired invitation whose workspace and normalized email both match;
the normal invitation acceptance still creates the membership. Hosted runtime
adapters bypass these self-host-only policies.

## Self-hosted object storage

The Node runtime uses `S3_ENDPOINT` for private server-to-object-storage operations and
`S3_PUBLIC_ENDPOINT` when signing browser upload/read URLs. In Compose these are
the internal `http://minio:9000` address and the public object-storage origin,
respectively. Production uses a dedicated TLS hostname proxied by Caddy; local
development exposes RustFS only on loopback. The public endpoint must not use a
subpath and must be reachable by desktop and browser clients.

## Realtime Collaboration

Editable page bodies use Yjs through Hocuspocus. Run the latest Drizzle
migrations before starting the server. The Node runtime serves the collaboration
WebSocket at `/collaboration`; clients obtain short-lived page-scoped tickets
from `POST /pages/:id/collaboration-bootstrap`. Clients request the full Yjs
state on a cold page open and only a short-lived ticket for cached documents.

`COLLABORATION_SECRET` is optional and falls back to `BETTER_AUTH_SECRET`. Set
it separately when collaboration tickets should have an independent signing
key. Set `COLLABORATION_WEBSOCKET_URL` when the public WebSocket origin cannot
be derived from the API request URL, such as behind a development proxy.

## Runtime extension API

The server exports a runtime-neutral extension surface from
`@zilobase/server/adapter-api`. It includes the Hocuspocus factory, ticket
helpers, Yjs conversion helpers, and collaboration runtime callbacks for
alternate runtimes. Node-only migration and server runtime helpers are exported
separately from `@zilobase/server/node-adapter-api` so alternate runtime bundles
do not load filesystem-dependent modules.

## Backend organization

The server separates HTTP adapters, backend operations, infrastructure, and
application composition. Both HTTP routes and services group code by domain;
only substantial subsystems get nested folders.

| Folder                  | Responsibility                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/entrypoints`       | Process startup and shutdown                                                                           |
| `src/app`               | Application factory, middleware installation, route registration, extensions, background orchestration |
| `src/routes/<domain>`   | HTTP input validation, request middleware, headers/cookies, response serialization                     |
| `src/services/<domain>` | Domain rules, authorization decisions, database operations, transactions, ordered workflows            |
| `src/infrastructure`    | Database/schema, storage, email, Effect runtime, generic background delivery                           |
| `src/shared`            | Generic configuration, cancellation/crypto utilities, named cross-domain contracts and errors          |
| `src/public`            | Supported runtime-neutral, Node, and realtime package exports                                          |
| `src/scripts`           | Operational and verification commands                                                                  |
| `src/test-support`      | Shared test fixtures and helpers                                                                       |

Routes call services with explicit actors, IDs, validated data, environment, and
extension context. Services never accept Hono contexts or format Hono responses.
Native Request/Headers/Response remain supported at authentication and provider
boundaries. Services may use Drizzle directly; there is no extra repository layer.

See the [core application operation inventory](OPERATIONS.md) for public API
extraction, authorization, retries, cache ownership and unsupported legacy calls.

### Functional owners

- **Auth:** factory at the domain root; session resolution, password inspection,
  and pinned membership in `sessions`; delegated tokens and clients in `oauth`;
  Google token verification in `identity`.
- **Desktop auth:** authorization and session/token operations in services;
  server-rendered HTML, styles, escaping, and CSP in route-local `pages`.
- **Workspaces:** reads/deletion at the root, invitation workflows in
  `invitations`, member changes in `members`, settings updates in `settings`.
  Cross-domain grants/admission/expiry remain in `memberships`.
- **Teamspaces:** lifecycle/management and policy at the root, with
  `membership`, `principals`, `invitations`, and `settings` operation owners.
- **Access:** effective permissions, principal membership, resource lookups,
  and access-level decisions shared by domains. HTTP mismatch responses stay
  in routes.
- **Pages:** `read`, `content`, `hierarchy`, `lifecycle`, `sharing`, `navigation`,
  and `layouts`, plus the existing `graph`, `placements`, `properties`, and
  reusable page mutations. Layout routes retain the `/page-layouts` mount.
  Member page-detail responses include optional `propertyContext`: property IDs,
  accessible row/source targets, and host/source revisions read before the
  property bindings. This lets a client reuse complete authorized database reads
  without returning definitions or values again. Guest/published reads omit this
  context. `/pages/:id/properties` remains the fallback for missing or stale data,
  with its existing page access and workspace checks.
- **Page guests:** invitations, approval requests, workspace guest management,
  and common guest policy, independent from workspace member invitations.
- **Databases:** `lifecycle`, `mutations`, `navigation`, `access`, `commands`,
  `data-sources`, `history`, `read`, `realtime`, `records`, `schema`, `setup`,
  and `views`. Mutation payloads and source clocks stay with mutations.
- **Calendar:** connections, events, sync, realtime, preferences, and provider
  operations. Provider callbacks, webhooks, and configuration HTTP adapters
  have separate owners.
- **Automations:** definition, compilation, triggers, execution, history,
  domain configuration, and actions. Slack and webhook actions have their own
  connector folders.
- **Meetings:** lifecycle, audio, transcription, summary, and contracts.
- **Collaboration:** documents/codecs/update policy, tickets, document
  persistence, mutations, and Hocuspocus runtime composition.
- **Images:** access lookups, uploads/completion/deletion, reads, and domain
  configuration; physical object storage stays in infrastructure.
- **User settings:** preferences and profile operations, with profile images
  under `profile/images`.
- **Instance:** bootstrap/admission policy in `registration`, administration
  in `settings`, discovery/version compatibility in `discovery`.
- **Notifications:** inbox reads/read-state changes versus domain delivery and
  outbox processing.
- **API keys, clips, search, metadata, health, and demo:** independent small
  domains with descriptive implementation files.

### Boundaries and verification

Import owners directly instead of adding forwarding-only internal barrels.
Keep local helpers/tests beside their owner and promote only genuinely shared
support. Database schemas remain centralized and existing migrations are unchanged.
Domain outboxes stay with their services; app background orchestration and
infrastructure delivery remain separate. Runtime implementations stay in the
runtime-adapter package.

`npm run test:architecture` checks backend ownership, cross-layer runtime cycles,
runtime-provider boundaries, and public export compatibility. Server tests also
lock HTTP method/path and middleware registration order. `npm run test:server`
runs coverage, query regressions, and the server build; existing isolated database,
calendar, background, and automation harnesses exercise persistence and delivery.

### Ask AI

Configure `OPENAI_API_KEY` in the server environment. Ask AI defaults to
`gpt-6-luna` for everyday chat. Set `AI_MODEL` to override it with another OpenAI
Responses API model available to your key. Credentials stay on the server. Ask AI uses the same authenticated API
origin for web and desktop, and streams responses from `POST /ai/chat`.

Users can ask workspace questions directly or mention pages and databases with `@`.
The model uses `search_workspace` to discover accessible sources by keywords or
title, and `semantic_search_workspace` to discover indexed pages by meaning,
including supported property content. Both tools are available to the model; it
can use either or both with independent rankings. Semantic unavailability is
reported explicitly, and the model can then choose keyword search.
Search results are bounded discovery hints, not citation evidence or an
exhaustive inventory. The model reads important matches before relying on their
content; listing search matches does not require reading every result.
The current user question is routed independently of earlier conversation turns.
Find-only requests are enforced as terminal listings; summaries permit live reads.
Named teamspaces resolve against the actor's visible directory before keyword
search, with ambiguous names requiring clarification and all keywords preserved.
Routing uses one schema-validated call to the configured model, with usage included
in run telemetry. It is internal orchestration; the public tool set remains seven.
Both search tools default to 10 matches and accept at most 50, without a result-byte
budget. Refine the keywords or page/database types for other matches; search has
no continuation cursor. Mentions contain resource references only.
The model calls `describe_source`, `read_page`,
`query_records`, `read_record`, and `aggregate_records` to fetch saved content.
It can follow references returned by those reads, including embedded databases,
linked pages, relation values and record page bodies. Every operation checks
current permissions and the pinned workspace. There is no write tool.
Unsaved editor drafts and client-supplied history are excluded.

Database queries use bounded SQL reads with property projection, scalar AND
filters, stable sorting, and opaque revision-checked continuation cursors. Saved
view filters do not apply implicitly. Counts and numeric aggregates run on the
server over matching records, rather than the first result page. Computed-property
reads and filters, grouped aggregates, and saved-view queries return unsupported-query errors.
Page reads split large individual blocks and paginate content and references.
A changed source invalidates its cursor; results always disclose whether more
pages remain. There is no fixed 200-record ceiling across pages.

The runtime uses AI SDK's `ToolLoopAgent` without per-run token, tool-call,
model-step, output-token, result-byte, or conversation-length budgets. Source reads
remain paginated and at most three tools execute concurrently. The physical model
context capacity is configured with `AI_CONTEXT_WINDOW_TOKENS` (default 32768).
Before context fills, the same configured model summarizes older exchanges,
preserving the task, user preferences, decisions, source identities, completed
reads, and pending work. Large tool exchanges are summarized in model-sized
fragments rather than rejected by a byte budget. Known model tokenizers are used
when available; custom models may set `AI_TOKENIZER_ENCODING`.

Compaction appears live as “Compacting conversation”, then “Conversation
compacted”, with a disclosure of how many messages were summarized. Failures keep
the original transcript and show a retryable failure. Rolling conversation
summaries are encrypted on the thread using `AI_RUN_PAYLOAD_ENCRYPTION_KEY`; they
survive follow-up messages and reloads. Apply migration `0124_chat_compaction`
before deploying. The former `AI_MAX_STEPS`, `AI_MAX_TOOL_CALLS`,
`AI_TOOL_RESULT_BYTES`, and `AI_RUN_TOKEN_BUDGET` settings are ignored.

Source identities, inspected schemas, read completion and pending cursors survive
compaction. Metadata reuse rechecks access and revision. Source lists stop after
search, and repeated retrieval without progress stops independently of compaction.
Recent complete tool exchanges remain available through compaction where they fit;
an operation inventory preserves exact aggregate results. Typed source references
and prior read coverage also survive attachment removal on subsequent turns.
They permit a new authorized read and never become current citation evidence by
themselves. Database scalar property sorting uses `sortPropertyId` before taking
the requested record limit; unset Status values use their configured default in
both records and aggregates.
User cancellation, permission checks, infrastructure request validation, and the
HTTP request ceiling of 2 MB still apply.

Conversation history is private to its creator and workspace and remains until
deleted. Source permissions are rechecked before display, model replay and reads.
Citations resolve only against successfully read source evidence. Durable runs
persist an encrypted working transcript and cursors for up to one hour; permanent
history retains answer text, source metadata, tool activity, and encrypted conversation summaries, not raw tool payloads. Without durable mode, disconnecting stops the request-owned run.

Run `node scripts/ai/test-isolated.mjs` for temporary PostgreSQL domain-query,
pagination, authorization and conversation checks. `npm run test:ai:durable`
adds disposable PostgreSQL/Valkey tests for worker recovery and a complete
mention → tool read → next-page continuation. Browser coverage includes
`ai-tools.spec.mjs`, `ai-durable.spec.mjs` and the mention/presentation tests.
Provider calls in these tests are deterministic and do not spend API tokens.

For an optional live smoke check, supply `OPENAI_API_KEY` and set
`ZILOBASE_AI_VERIFY_MODEL` to an available Responses model when running the isolated
AI runner. It sends only the synthetic page created by that test, then verifies
that the streamed answer persists and reloads. This does not set deployment defaults.

### Durable Ask AI rollout

Deploy migrations through `0124_chat_compaction` before using the tool runtime.
Enable `AI_DURABLE_STREAMING_ENABLED=true` for background generation and continuation.
The API and producer must use the same database, cell ID, model configuration,
and `AI_RUN_PAYLOAD_ENCRYPTION_KEY` (32 random bytes, base64). Generate the key
with `openssl rand -base64 32` and supply it through the deployment secret manager.
Encrypted rolling summaries use this key in non-durable mode as well.
Do not rotate it while admitted runs still need their encrypted input.

For Node, configure `QUEUE_REDIS_URL` and run `ZILOBASE_PROCESS_ROLE=api` separately
from `ZILOBASE_PROCESS_ROLE=worker`; `all` supports a combined development process.
The worker consumes the dedicated `ai` lane (concurrency 4). Run the worker and
maintenance scheduler throughout rollout, including while admission is disabled.
For Cloudflare, provision `zilobase-ai-runs` and `zilobase-ai-runs-dlq`, then deploy
both the API and background Workers from the sibling Cloudflare adapter. Its
deploy/dev launchers forward both feature flags and conditionally require the
same encryption key in both Workers. Queue consumers own generation; HTTP
`waitUntil()` is not used to keep generation alive after disconnect.

The new client discovers capability with `GET /ai/capabilities`, admits through
`POST /ai/turns`, and reconnects to `GET /ai/runs/:id/events?after=<seq>`.
A submission receipt contains only identifiers and is isolated by deployment,
account/session, and workspace. Older clients can continue using `/ai/chat`;
with durability enabled this is an admission/subscription wrapper. Disconnecting
any subscription leaves the producer running. Stop calls `/ai/runs/:id/cancel`.
The full-page AI route retains the selected thread in its `thread` search parameter.

Tool transcripts, evidence, progress and replay sequences commit under a fenced
worker lease before the next model step. A replacement worker resumes from the
last committed transcript and replaces uncommitted text. Read attempts can repeat
after an uncertain failure; usage reservations include those attempts. Runs have
a two-minute deadline and bounded worker retries. Completed checkpoints remain
encrypted until their one-hour expiry so Continue reading can start a new bounded
run in the same thread, with the same source scope and pending cursors. Source
permissions are rechecked before continuation. Terminal replay events expire
after 24 hours; conversation messages remain readable.

Stream consumption does not wait for each token's database write. The producer
coalesces text with one write in flight and a limit of 65,536 characters across the
pending and in-flight batches. Step checkpoints and terminal completion drain
pending text in order; cancellation retains batches rejected before commit.
Lease-only heartbeats use a fenced conditional update without an event transaction.
The durable test includes a slow-write regression so small tokens cannot turn
into one remote transaction per token.

The `AI_PROVIDER_BACKGROUND_ENABLED` flag applies only to previously admitted
version-one runs. New tool runs recover at application transcript boundaries
rather than depending on a single provider response ID.

Run `npm run test:ai:durable` for disposable PostgreSQL/Valkey migration, queue,
idempotency, replay, cancellation, recovery, and authorization checks. It uses a
synthetic provider and never sends source data to a paid model. Observe the existing
`zilobase.background.*` counters/histograms filtered to `ai.generate` and the `ai`
lane: enqueue failures, queue wait, execution duration, recovered leases, retries,
exhaustion, oldest pending work, and dead letters. Measure subscriber polling load
before raising concurrency. AI-specific counters cover provider starts/resumes, producer
ends, checkpoints, subscriber opens/closes, snapshot resets, and cancellation requests;
`ai_first_token_ms` and `ai_replay_ms` record latency without source data.
Roll out to a small deployment first and smoke-test a
reload during generation, explicit Stop, duplicate delivery, and worker restart.
To roll back, disable new durable admission but leave workers, keys, migration,
and read/replay endpoints in place until existing runs drain. Do not restore the
old request-owned producer for already-admitted runs.
