# Databases

## Owning modules and interface

- [apps/server/src/features/databases](../../../apps/server/src/features/databases)
- [apps/web/src/features/databases](../../../apps/web/src/features/databases)
- [packages/features/src/databases](../../../packages/features/src/databases)

Shared database code is grouped by boundary inside `packages/features/src/databases`:
`interactions/` owns the session store, sparse record-intention projection,
source sequencing, receipt recovery and identity remapping; see [ADR 0011](../../decisions/0011-shared-record-interactions.md).
`core/` (entities, ordering, telemetry), `schema/` (filter, property types,
formula), `views/` (appearance, view evaluation), `records/` (snapshots,
row-page host resolution), `access/` (sharing writes), `queries/` (session
provider, read query options and hooks), `mutations/` (command execution, invalidation,
session command-state utilities, one module per write domain), `realtime/` (poke
socket plus presence). Automations were promoted out of the
database section to [packages/features/src/automations](../../../packages/features/src/automations),
[apps/server/src/features/automations](../../../apps/server/src/features/automations),
and [apps/web/src/features/automations](../../../apps/web/src/features/automations).
The published database root exposes model contracts and query builders; client
hooks and the session provider are published only through the database `/react`
entrypoint. The unused mixed `/databases/queries` barrel is no longer published.

Server routes live in `databases/http/` (`routes.ts`, `core-routes.ts`,
`read-routes.ts`, `command-routes.ts`, `support.ts`); command handlers are
split per domain under `databases/commands/` (`records.ts`, `structural/`,
`templates.ts`); persistence concepts read as `databases/schema/` (properties),
`databases/records/` (rows), `databases/views/`, `databases/data-sources/`.

[Background task implementation](../../../apps/server/src/features/databases/realtime/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

Database routes compose bounded reads and idempotent host/source commands. The
web database surface keeps one QueryClient photocopy of the notebook:
`GET /bootstrap` plus `GET /records` under `["db", sessionId, hostId, …]`.
Visited page views hydrate their last confirmed bootstrap and first record window from the [page read cache](../../../apps/web/src/features/pages/cache/page-read-cache.ts) before these queries refresh. Persisted windows retain their validated query hash and are rebound to the current authenticated session; continuation pages are fetched online.
Record windows are keyed by view query hash (`dataSourceId` plus normalized
filters/sorts), so sibling views that differ only in presentation share one
cached window; `viewId` selects the server-side evaluation, never the cache
key. Record requests require `expectedQueryHash`; responses include `queryHash`.
The server compares the expected hash with its saved view inside the repeatable-read
snapshot before evaluation. `VIEW_QUERY_CHANGED` rejects a mismatched request;
the client also validates successful response hashes, refreshes bootstrap metadata,
and never retries the obsolete hash or caches mismatched rows.
Switching views within one data source keeps the previous rows visible
while the new hash loads, and tabs prefetch on hover/focus with idle
prefetch for same-source siblings.
Postgres remains the only truth and the host `database.version` is the clock.
Writes go `UI -> useMutation -> POST …/commands -> ack -> invalidate -> GET`;
the realtime socket is a doorbell that only says `{ databaseId, version }`.
Record gestures and cell edits read shared pending intentions projected over
server windows before view evaluation. React-local state is limited to active
editor input and pointer geometry.

Database JSON routes use shared authenticated input parsing, retaining each operation’s payload validation and permission decisions. [Transport tests](../../../apps/server/src/features/databases/http/route-input.test.ts) cover malformed input and authentication ordering.

The [v2 command routes](../../../apps/server/src/features/databases/http/command-routes.ts) expose separate host and data-source endpoints with runtime-validated command unions. The [command framework](../../../apps/server/src/features/databases/commands/framework.ts) serializes each command ID with a transaction advisory lock, hashes the canonical request and route scope, replays identical stored acknowledgements, rejects mismatched reuse, and commits source/host versions, complete mutation journal events, and the seven-day receipt atomically. The actor and command origin are passed into the domain dispatcher. [Record handlers](../../../apps/server/src/features/databases/commands/records.ts) implement atomic placement/transfer, record changes (neighbor order, values, title and hierarchy), archive and restore inside that transaction and return complete record aggregates. [Structural handlers](../../../apps/server/src/features/databases/commands/structural/dispatch.ts) cover database/source metadata, source links, properties, templates, and views; the implementation is split per domain (`databases.ts`, `data-sources.ts`, `properties.ts`, `templates.ts`, `views.ts`, shared `ordering.ts`). Ordered links, properties, and views accept neighbors rather than client-supplied full ID arrays. Source-scoped structural events fan out complete entities to every linked host.

Record gestures use `row.change` (optional neighbor placement, title, values,
and validated reciprocal hierarchy) and `row.place` (new/existing page insertion
and optional source transfer). Transfers authorize both hosts and sources plus
the existing page, reject cross-workspace moves, import properties according to
the requested mode and archive the source in the same transaction. Touched
sources are locked in sorted order before source versions change. Acknowledgements
include committed `sourceVersions`, so a client can reconcile linked-host windows
without receiving the identities of other linked hosts. The former `row.move`
and `row.create` commands are not accepted.

Manual placement optionally clears its view's sort in the same command. Linking a
source requires an initial-view descriptor and creates that view atomically, even
when the source is already linked. Neither workflow stages a second command.
Host writes reserve linked source lanes before the host row to avoid inverted
source/host lock ordering. Tree archive/restore reserves workspace source lanes,
advances affected source revisions and resets linked-host windows; sub-item setup
confirms its schema source revision alongside the host revision.

The [row mutation hooks](../../../packages/features/src/databases/mutations/rows.ts)
publish insertion and transfer effects through the session interaction store.
Transfers remove the source preview and insert a temporary destination record
together. Acknowledgement remaps row IDs, page IDs and dependent anchors before
queued gestures run. The [shared transfer model](../../../packages/features/src/databases/interactions/transfer.ts)
uses the same name matching and select-value normalization as server import.
Existing page titles are preserved unless a name-group drop explicitly changes
them. Creating a sub-item saves both relation directions atomically. Record title
editors and page-metadata cell writes use the same record-change queue; ordinary
page links outside a record surface remain page actions.

The accepted [poke-and-refetch database client decision](../../decisions/0005-poke-and-refetch-database-client.md) defines the QueryClient-backed client used here. It supersedes the collection-backed responsive client: the server protocol is unchanged, but the client no longer keeps TanStack DB collections or a journal. [ADR 0011](../../decisions/0011-shared-record-interactions.md) replaces row-local drafts and row cache patches with shared sparse intentions.

The [v2 read service](../../../apps/server/src/features/databases/read/service.ts) separates metadata bootstrap from bounded record windows. Bootstrap aggregates properties for every accessible linked source without rows and always includes the host database's nullable `deletedAt` lifecycle state. Record reads materialize one complete entity per row, evaluate the selected view before slicing, default to 50 records (or a persisted 10/25/50/100 view choice), and bind continuation reads to host/source/view revisions. A changed revision raises the typed `WINDOW_STALE` conflict. The [database read routes](../../../apps/server/src/features/databases/http/read-routes.ts) expose those services as `GET /:id/bootstrap` and `GET /:id/data-sources/:dataSourceId/records`, retaining authenticated and published-database access while validating source/view scope and exact window sizes. The `GET /:id/mutations` catch-up feed remains on the server but the client never calls it. The [shared view evaluator](../../../packages/features/src/databases/views/view-evaluation.ts) is server-safe and reuses the tested filter and formula domains. The [view query hash](../../../packages/features/src/databases/views/query-hash.ts) reduces each view config to its data-affecting slice (normalized filters/sorts plus the deleted-rows flag, excluding type, grouping, visibility, and layout) so the client cache in [record windows](../../../packages/features/src/databases/queries/records.ts) is per query, not per view; see the [query-hashed windows decision](../../decisions/0006-query-hashed-database-windows.md).

## Authorization and persistence

Database creation also has a workspace-scoped `POST /databases/commands`
boundary. Lifecycle, access, publication and favorite operations are recognized
commands. Their domain services execute inside the receipt transaction; navigation
delivery is deferred until commit. Favorites advance `database_actor_state` and
produce a private confirmation instead of a mutation journal/realtime event.
Favorite commands reserve an actor/host lane before writing the value and incrementing
its revision. The private receipt carries the actor identity. Authenticated navigation
reads select favorite value and actor revision in one SQL statement, and return an
`actorState` envelope that never belongs to workspace navigation deltas.
Favorite intentions project through the same session controller over navigation
snapshots. They survive receipt recovery and remain until each mounted consumer observes
the actor revision; stale inactive snapshots are evicted. Navigation reads preserve a
newer cached revision only for the same actor. There is no favorite success-callback
cache patch or separate rollback state.
All lifecycle/access client hooks submit through the session controller. Navigation,
lifecycle descendant cleanup and access read invalidation belong to the controller's
[confirmation path](../../../packages/features/src/databases/interactions/confirmation.ts),
including recovered receipts. Archive evicts active-only database snapshots only in
the current session; restore refreshes both active and trash reads. Navigation is
refetched for affected workspaces, never patched from an unversioned view or creation
success callback. A failed refresh reports synchronization failure without rejecting
or delaying the save. A confirmed retry clears its earlier unconfirmed error. The former
direct creation, archive, restore, favorite and access write routes are removed;
`GET /:id/access` remains the access read boundary. Delivery failures leave the durable
outbox retryable and do not turn a committed receipt into a failed write.
The forward migration allows a private receipt without an event foreign key.
Authorization for new host/source commands executes after receipt lookup and before
revision writes, so receipt replay cannot accidentally perform the mutation twice.

OAuth database routes require `databases.read` or `databases.write` and bind the requested resource to the granted workspace before existing ACL checks. Reads load the database host, while source-scoped commands validate the linked data source through the command framework. Creation validates the body workspace. [Token resource middleware](../../../apps/server/src/features/auth/pinned-resource-middleware.ts) is attached per endpoint so Hono composition cannot apply a database loader to a later source-scoped command route. [Route regression tests](../../../apps/server/src/features/databases/http/routes.test.ts) exercise both scopes.

A database is page-backed; data sources, rows, views and property values are separate persisted concepts. Rows use a required `NUMERIC(30,10)` order key with active uniqueness per data source. [Shared order-key utilities](../../../packages/features/src/databases/core/order-key.ts) encode the decimal as a scaled bigint for deterministic cross-runtime midpoint calculation. Inserts and moves take a transaction-scoped source advisory lock; precision exhaustion rebalances keys at intervals of 1024. Moves normally change one fractional key, while `page_item_placement.position` remains the compatibility projection for navigation; visible anchors are resolved against the complete canonical source order, so filtered-out rows retain their relative ordering. The [v2 persistence migration](../../../apps/server/drizzle/0090_database_mutation_journal.sql) also adds the durable versioned mutation journal and idempotent command receipts; command traffic and internal producers write journal events plus delivery references through the shared commit path. Resource and data-source access checks constrain mutations. Formula and value rules also have shared implementations.

## Side effects, failures and recovery

Row/property changes can update database realtime outboxes and automations. The common [database commit helper](../../../apps/server/src/features/databases/core/commit.ts) gives internal writers a shared server-generated command ID and atomically stores a v2 journal event before its delivery-only outbox reference. Partial internal deltas become scoped reset events so downstream v2 consumers never ingest partial entities. Delivery requires the canonical journal event and publishes protocol v2 only; missing history is retried instead of falling back to a payload-only message. Preserve mutation origin and transaction ordering. Database realtime revisions and cache reconciliation prevent stale UI after writes.

Database deletion is a reversible lifecycle transition. The database, its rows,
and nested descendants are soft-deleted as one batch. If a page Yjs document
still contains a deleted database reference, the
[database node view](../../../apps/web/src/features/databases/core/database-block.tsx)
removes that reference without recording another editor undo step. Deleted
references do not load record windows or request realtime tickets, and they do
not expose a permanent restore shell. Deleting an embedded structural
block records its editor removal and database lifecycle transition as one undo
entry. Ctrl+Z restores both while that page's undo entry exists, and redo
removes both again. Direct full-page trash access retains the explicit
[database restore control](../../../apps/web/src/features/databases/core/database-trash-restore-button.tsx).
Restore clears the deletion batch. Database-command confirmation invalidates every
active and trash-aware bootstrap/window key in the session without relying on realtime;
ordinary page lifecycle actions retain their
[shared item-action cache handling](../../../packages/features/src/shared/item-action-cache.ts).

Runtime topology, retention, recovery, metrics, and failure diagnosis are in
the [database operations guide](../../../docs/databases/operations.md).

## Focused guides

- [Database mutation and realtime flow](realtime.md)
- [Database views and properties](views-and-properties.md)
- [Table interactions and rendering](table-interactions.md)

## Client mutation ownership

The [command executor](../../../packages/features/src/databases/mutations/execute.ts)
posts one command with `protocolVersion: 2`, validates receipt and event
identity, and retries a lost network response once with the identical command
ID and serialized body. A confirmed server commit remains successful even when
the following refresh fails; the controller exposes synchronization errors independently of its
[command state](../../../packages/features/src/databases/mutations/pending.ts). Saving ends
at validated acknowledgement, including when ingestion or recovery fails.

Editing is online-only. The [save indicator](../../../apps/web/src/features/databases/views/components/database-save-status.tsx)
shows pending, failed, unconfirmed, and saved-but-refresh-failed states. Failed
commands remain visible until the same target succeeds. The provider installs
a [reload guard](../../../packages/features/src/databases/mutations/beforeunload.ts)
while any database pending count is above zero. Browser confirmation cannot guarantee
delivery after a forced close, and commands are not persisted or replayed offline.

Bootstrap and record reads run in a [read-only repeatable-read transaction](../../../apps/server/src/features/databases/read/snapshot.ts),
including a fresh host read when route authorization supplied an older record.
The response version and entities therefore describe the same committed state.
Out-of-order GETs use a prefer-newest guard: a cached bootstrap or window that
is newer than the incoming payload is kept instead of regressing.

Shared mutations are grouped into database lifecycle, data sources, views,
properties/templates, access and rows. Record changes and cells share the
[interaction store](../../../packages/features/src/databases/interactions/store.ts),
scoped by QueryClient and auth session. The store queues writes per affected source and coalesces consecutive queued cell
edits before their first delivery. Titles, definitions, bindings and stored values
use supported TanStack transactions, serialized by canonical entity identity.
Authoritative conflicts retire the preview while HTTP receipt tracking continues.
Unconfirmed delivery blocks dependent commands and retains the same request ID
for retry. Structural placement and insertion intentions still reconcile per
window during the presentation cutover. Query windows hold ordered record IDs,
counts, hashes and pagination through [window references](../../../packages/features/src/databases/cache-window.ts);
records resolve current page/value fields from collections. Refresh errors never
reject committed writes. Schema and view metadata submit through the same session
controller; their remaining structural intentions migrate with presentations.
Navigation uses those same metadata intentions, with independent host/source/actor
revision checks for every mounted consumer. All schema, source and template hooks
delegate refresh ownership to controller confirmation; no success/settled callback
duplicates invalidation or awaits navigation after an acknowledged save.
Host-wide mutations form barriers across the source writes visible through that host.
The command policy is exhaustive and enforces host/source scope before scheduling.
Pending counts, errors and the reload guard use that same session controller, never
a process-global pending map. The former cache rollback helpers and metadata queue
are deleted. Property creation projects temporary column and field identities;
dependent anchors, cell keys and configuration references remap after confirmation.
Neighbor-based property/view placement projects immediately without mutating snapshots.

Metadata update commands accept `patch.configuration`, a bounded list of explicit
path assignments/removals, not a replacement `config`. Editors compute changes against
the configuration they displayed. The server applies those same operations to the
locked current entity, and bootstrap projections apply them to untouched snapshots.
Full configuration objects are accepted only for creation and template application.
Property updates lock the shared definition row before reading configuration, so
different-field changes through different source bindings compose. Existing
strictly increasing entity stamps order those confirmations across source lanes.
The view controller reads its latest pending configuration from the session controller;
there is no separate latest-view configuration cache. Record fetches and prefetches use
the confirmed bootstrap configuration while loaded rows use the projected configuration.
The shared record hook owns query identity for every consumer, including sidebar,
page navigation, relation and layout previews. Callers select host/source/view, not a
hash derived from projected metadata. The hook observes the newest matching
session/deleted-scope bootstrap snapshot; pending view configuration cannot select
a fetch key. The server-safe `@zilobase/features/databases/query-hash` entrypoint
exposes the same normalization and hashing used by the client.

Filter and sort editors compose edits against that latest projected configuration,
identifying rendered entries by filter ID or sort column rather than shifted array
positions. Source-command scope resolution searches only the controller's session;
unloaded sources require an explicit host ID. A host ID is never interpreted as a
source ID. Provider ownership is reference-counted with deferred disposal so React
StrictMode reattachment preserves pending work while final unmount clears only
that session's controller and database queries.

Controlled view selection notifies its owner in the event handler, outside React
state updater functions; uncontrolled selection updates only local state. Switching
presentation never creates another mutation owner.

The interactive client consumes bootstrap plus record windows directly through [`DatabaseViewData`](../../../apps/web/src/features/databases/views/model/database-controller-state.ts) (canonical host bootstrap, active source, filtered records); the monolithic composed payload is gone. The position-based row/value export shape remains only as the [`DatabaseExportPayload`](../../../packages/features/src/databases/core/export-payload.ts) wire contract behind `GET /:id/export` and derived AI/task context, never as client state. Realtime-only state (presence, version watermarks) stays out of QueryClient entirely.

TanStack Query owns database bootstrap/windows, authentication, access/sharing,
navigation, automation management, AI, uploads, and other non-database-view
workflows; Yjs owns page documents; React-local state owns presence, drafts,
and transient interaction state.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/databases/http/routes.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

The isolated PostgreSQL suite applies the complete migration set and exercises real
receipt transactions, actor-scoped navigation reads, compound writes, rollback and
linked-host lifecycle revisions. See the [operations runbook](../../../docs/databases/operations.md#deployment-and-verification)
for the disposable-container command and prerequisites.

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

The table [model](../../../apps/web/src/features/databases/views/table/model/database-table-model.ts) owns drop-target identity retention, including sub-item parent changes. List [row presentation](../../../apps/web/src/features/databases/views/list/components/list-row-presentation.ts) derives drag indicators and task completion labels. Their tests cover unchanged references, internal/external drag placement and parent nullability while controllers retain drag lifecycle and mutations.

Table and toolbar composition keep named local render sections for property cells, grouped rows and view source/actions. Kanban separates board derivation, column rendering, drag geometry and shared record intentions as described in [views and properties](views-and-properties.md#kanban-board-and-moves). All views read shared record intentions; placeholder windows cannot confirm a change. Form title previews select the existing input or textarea with one shared set of props; question settings and mutations remain unchanged.

[Row mutations](../../../packages/features/src/databases/mutations/rows.ts) complete after row confirmation. Adding a favorited page refreshes navigation in the background, so navigation latency or failure cannot delay the editor’s success callback or reject an already committed row. [Row mutation tests](../../../packages/features/src/databases/mutations/rows.test.ts) cover atomic initial values and neighbor-anchor construction.
