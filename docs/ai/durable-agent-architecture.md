# Durable Ask AI architecture and migration plan

Status: serverful durable execution is the next backend milestone

## Required product behavior

An accepted Ask AI turn belongs to the server, not to the browser request that
submitted it. Closing the panel, refreshing, changing routes, losing the
network, or restarting a frontend must not cancel that turn. A returning client
must receive the same ordered activity:

1. preparing the turn;
2. starting a named tool;
3. completing concrete substeps such as creating a database, adding properties,
   configuring views, and adding rows;
4. exposing created pages and databases as navigation badges as soon as their
   durable IDs exist;
5. completing, failing, or being explicitly cancelled.

No UI event may claim success before the underlying service mutation and its
idempotency receipt are durable.

## Audit findings

### Critical

- The ordinary `POST /api/ai/threads/:threadId/turns` stream still owns the
  provider `AbortSignal`. It is a request-lifetime transport, so it cannot be
  the long-term execution owner for Node/self-hosted installations.
- Assistant output and non-transient progress are added to canonical Postgres
  messages at stream completion. A process failure before completion can leave
  an accepted turn without replayable partial output.
- Database blueprints are a multi-mutation workflow with one outer receipt.
  The completed IDs are returned on an ordinary handled failure, but a process
  crash between substeps has no durable per-step checkpoint from which to
  resume automatically.

### High

- The web client and server execution path were coupled through one request.
  Deployment-specific transports had no clean module boundary.
- Live effects were transient cache accelerators. This is correct for cache
  patches, but they are not a durable history or a replacement for refetching
  canonical page/database state.
- `chat-service.ts` combined request coercion, authorization, context assembly,
  model execution, progress publication, audit, and persistence. This made
  transport lifetime and execution lifetime easy to couple accidentally.
- “Auto” selected catalog order. Catalog order is presentation data, not a cost
  or workload policy.

### Medium

- Live agent contracts, database blueprint schemas, execution helpers, and UI
  navigation lived in large mixed-purpose files.
- Page and database citations were navigable, but resource navigation was not a
  distinct component and database badges used the same generic file icon.
- Failed blueprint substeps were labeled failed but styled as completed.

## Implemented in the current refactor

- The Community web app uses a serverful HTTP conversation module. A deployment
  may replace that module at build time through the public conversation-adapter
  contract without adding its SDK or implementation to this repository.
- Turn IDs, client message IDs, selected model, attachments, mentions, and page
  or database context references share one deployment-neutral request contract.
- Structured partial tool failures are persisted as failed action receipts and
  remain replayable with their completed resource IDs.
- Live contracts, blueprint schema/view/title helpers, chat request parsing, and
  navigation badges have focused module boundaries.
- Auto now prefers Terra for chat/editor work and Luna for meeting summaries,
  while still respecting a workspace's enabled-model list.

## Target backend

The durable design is a server-owned turn runner plus an append-only event
journal. UI-message streaming is a projection of that journal, not the primary
execution boundary.

```text
features/ai/
  application/
    accept-turn.ts
    cancel-turn.ts
    run-turn.ts
    recover-turn.ts
  domain/
    turn-state.ts
    turn-event.ts
    tool-result.ts
    resource-reference.ts
  infrastructure/
    turn-event-store.ts
    turn-lease-store.ts
    turn-queue.ts
  transports/
    http-turn-routes.ts
    resumable-event-route.ts
    runtime-adapter.ts
  tools/
    database/
      blueprint/
        schema.ts
        executor.ts
        checkpoints.ts
        view-config.ts
      atomic-tools.ts
```

The dependency direction is transport → application → domain. Database and
provider adapters implement application ports. Domain/application code must not
import Hono, React, deployment SDKs, or Node process APIs.

### Turn state

Use one explicit state machine:

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelled
       -> cancelled
```

Only the runner can advance execution state. Submission reserves a unique
`(thread_id, client_turn_id)` and returns the existing turn for duplicate
submissions. Cancellation is a durable command checked between provider chunks
and before every mutation; browser disconnection is not cancellation.

### Event journal

Add `ai_agent_turn_event` with:

- `turn_id`, monotonic `sequence`, unique `event_id`;
- `kind`, `created_at`, schema `version`;
- bounded JSON payload containing display-safe progress only;
- optional `tool_call_id` and resource reference;
- unique `(turn_id, sequence)` and `(turn_id, event_id)` constraints.

Minimum durable event kinds:

- `turn.accepted`, `turn.started`, `turn.completed`, `turn.failed`,
  `turn.cancelled`;
- `assistant.delta`, `assistant.message.completed`;
- `tool.input.ready`, `tool.started`, `tool.step.started`,
  `tool.step.completed`, `tool.step.failed`, `tool.completed`, `tool.failed`;
- `resource.available` for page, database, row-page, file, or artifact badges.

Do not put prompts, full page content, credentials, or unrestricted tool input
in this table. Large assistant text can be chunked with a strict size limit or
stored in an owned object with a journal reference.

### Submission and replay API

- `POST /api/ai/threads/:threadId/turns` accepts and enqueues; it does not run
  the provider inside the request. Return `202 { turnId, streamUrl }`.
- `GET /api/ai/turns/:turnId/events?after=<sequence>` emits SSE (or the same
  contract over WebSocket), supports `Last-Event-ID`, sends heartbeats, and
  closes only on terminal turn state.
- `POST /api/ai/turns/:turnId/cancel` records explicit cancellation.
- `GET /api/ai/turns/:turnId` returns state and the last sequence for recovery.

The React client keeps a cursor, folds events into AI SDK-compatible messages,
and reconnects with the last committed sequence. Duplicate delivery is normal;
the reducer deduplicates by event ID and sequence.

### Serverful runner

Claim queued turns with a PostgreSQL lease using the existing AI job runner
pattern. Renew the lease while active and recover an expired lease.
Provider/tool execution never depends on the SSE connection. Alternate
deployment adapters can implement the same application ports and event contract
without entering the Community dependency graph.

## Blueprint durability

Treat a database blueprint as a small saga with a stable `operationId` and
deterministic step keys (`container.page`, `container.database`,
`property.<key>`, `view.<key>`, `row.<key>`, `cell.<row>.<property>`).

Before a step executes, load its checkpoint. After the mutation succeeds,
persist the checkpoint and resource IDs in the same transaction where
possible. A retry:

- skips completed checkpoints;
- reuses recorded page/database/property/view/row IDs;
- never recreates a container because a tool call ID changed;
- resumes at the first incomplete step;
- emits replayable progress for both skipped and newly completed work.

Service mutations retain their own idempotency keys. The saga checkpoint is
orchestration state, not a substitute for mutation-level receipts.

## Delivery plan

### Phase 1 — event contract and persistence

Create the event schema/store, typed event union, redaction/size guards, reducer,
and retention job. Dual-write events from the current runner without changing
the client transport.

Acceptance: a completed or failed turn can be reconstructed entirely from
canonical messages plus ordered events; event payloads pass security review.

### Phase 2 — server-owned Node runner

Change submission to reserve/enqueue, add leased execution and explicit cancel,
and remove `c.req.raw.signal` as the execution owner.

Acceptance: submit a long tool turn, close the connection, restart the Node
process after a committed checkpoint, and observe one terminal turn without a
duplicated mutation.

### Phase 3 — resumable client

Add the cursor-based event transport and reducer. Reconnect on reload, network
loss, tab sleep, and route changes. Keep deployment transports behind the same
conversation interface.

Acceptance: no duplicate text, tool card, or resource badge after replay;
multi-tab views converge on the same terminal message.

### Phase 4 — blueprint saga checkpoints

Extract the blueprint executor fully into its folder, add operation/step tables,
use bounded row concurrency where service ordering allows it, and replace the
prompt-based “retry incomplete” path with a server resume command.

Acceptance: inject a failure after every blueprint step and verify retry resumes
without creating another page, database, property, view, or row.

### Phase 5 — operations and rollout

Expose queue age, active leases, reconnect count, recovery count, event lag,
time to first durable event, and duplicate-suppression metrics. Add staged flags
per runtime, a rollback path to read-only replay, and retention/load tests.

Acceptance: production dashboards distinguish provider latency, queue delay,
tool latency, client disconnects, runner recovery, and permanent failures.

## Release matrix

Before declaring durability complete, test all of the following:

- browser refresh before first token, during text, during a tool, and after a
  mutation but before the tool result;
- offline for 30 seconds and reconnect;
- two tabs on the same thread;
- explicit Stop versus passive disconnect;
- Node process termination and lease expiry;
- duplicate submit with the same client turn ID;
- blueprint failure at every substep;
- membership revoked while queued and while a later mutation is about to run;
- event retention after canonical message completion.

Serverful durability and per-blueprint-step crash recovery must remain visible
release gaps until Phases 2 and 4 pass this matrix.
