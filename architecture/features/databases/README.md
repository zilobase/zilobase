# Databases

## Owning modules and interface

- [apps/server/src/features/databases](../../../apps/server/src/features/databases)
- [apps/web/src/features/databases](../../../apps/web/src/features/databases)
- [packages/features/src/databases](../../../packages/features/src/databases)

[Background task implementation](../../../apps/server/src/features/databases/realtime/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

Database routes compose bounded reads and idempotent host/source commands. The
web database surface derives view models from session-scoped collections of
metadata and record aggregates; optimistic command lanes and version-aware
event ingestion keep interaction responsive without monolithic payload
snapshots.

Database JSON routes use shared authenticated input parsing, retaining each operation’s payload validation and permission decisions. [Transport tests](../../../apps/server/src/features/databases/route-input.test.ts) cover malformed input and authentication ordering.

The [v2 command routes](../../../apps/server/src/features/databases/database-command-routes.ts) expose separate host and data-source endpoints with runtime-validated command unions. The [command framework](../../../apps/server/src/features/databases/commands/framework.ts) serializes each command ID with a transaction advisory lock, hashes the canonical request and route scope, replays identical stored acknowledgements, rejects mismatched reuse, and commits source/host versions, complete mutation journal events, and the seven-day receipt atomically. The actor and command origin are passed into the domain dispatcher. [Row and cell handlers](../../../apps/server/src/features/databases/commands/row-handlers.ts) implement create, neighbor-anchored move, archive, restore, and cell-set inside that transaction and return complete record aggregates. [Structural handlers](../../../apps/server/src/features/databases/commands/structural-handlers.ts) cover database/source metadata, source links, properties, templates, and views; ordered links, properties, and views accept neighbors rather than client-supplied full ID arrays. Source-scoped structural events fan out complete entities to every linked host.

The accepted [responsive database client and mutation protocol decision](../../decisions/0004-responsive-database-client.md) defines the collection-backed client and journal-backed mutation protocol implemented here.

The [v2 read service](../../../apps/server/src/features/databases/read/service.ts) separates metadata bootstrap from bounded record windows. Bootstrap aggregates properties for every accessible linked source without rows. Record reads materialize one complete entity per row, evaluate the selected view before slicing, default to 50 records (or a persisted 10/25/50/100 view choice), and bind continuation reads to host/source/view revisions. A changed revision raises the typed `WINDOW_STALE` conflict. The [database read routes](../../../apps/server/src/features/databases/database-read-routes.ts) expose those services as `GET /:id/bootstrap`, `GET /:id/data-sources/:dataSourceId/records`, and the ordered `GET /:id/mutations` catch-up feed, retaining authenticated and published-database access while validating source/view scope and exact window sizes. The [shared view evaluator](../../../packages/features/src/databases/view-evaluation.ts) is server-safe and reuses the tested filter and formula domains.

## Authorization and persistence

OAuth database routes require `databases.read` or `databases.write` and bind the requested resource to the granted workspace before existing ACL checks. Database routes load the database; row, property, template and direct data-source routes load the data source, whose ID is still exposed as `:id` on legacy routes. Creation validates the body workspace. [Token resource middleware](../../../apps/server/src/features/auth/pinned-resource-middleware.ts) is attached per endpoint so Hono composition cannot apply a database loader to a later data-source route. [Route regression tests](../../../apps/server/src/features/databases/database-routes.test.ts) exercise both identifier kinds.

A database is page-backed; data sources, rows, views and property values are separate persisted concepts. Rows use a required `NUMERIC(30,10)` order key with active uniqueness per data source. [Shared order-key utilities](../../../packages/features/src/databases/order-key.ts) encode the decimal as a scaled bigint for deterministic cross-runtime midpoint calculation. Inserts and moves take a transaction-scoped source advisory lock; precision exhaustion rebalances keys at intervals of 1024. Moves normally change one fractional key, while `page_item_placement.position` remains the compatibility projection for navigation; visible anchors are resolved against the complete canonical source order, so filtered-out rows retain their relative ordering. The [v2 persistence migration](../../../apps/server/drizzle/0090_database_mutation_journal.sql) also adds the durable versioned mutation journal and idempotent command receipts; command traffic and internal producers write journal events plus delivery references through the shared commit path. Resource and data-source access checks constrain mutations. Formula and value rules also have shared implementations.

## Side effects, failures and recovery

Row/property changes can update realtime outboxes, automations and page navigation. The common [database commit helper](../../../apps/server/src/features/databases/core/commit.ts) gives internal writers a shared server-generated command ID and atomically stores a v2 journal event before its delivery-only outbox reference. Partial internal deltas become scoped reset events so downstream v2 consumers never ingest partial entities. Delivery requires the canonical journal event and publishes protocol v2 only; missing history is retried instead of falling back to a payload-only message. Preserve mutation origin and transaction ordering. Database realtime revisions and cache reconciliation prevent stale UI after writes.

Runtime topology, retention, recovery, metrics, and failure diagnosis are in
the [database operations guide](../../../docs/databases/operations.md).

## Focused guides

- [Database mutation and realtime flow](realtime.md)
- [Database views and properties](views-and-properties.md)
- [Table interactions and rendering](table-interactions.md)

## Client mutation ownership

Shared mutations are grouped into database lifecycle, data sources, views, properties/templates, access and rows. The [mutation entrypoint](../../../packages/features/src/databases/mutation-hooks.ts) preserves the supported public hooks while React bindings select the operation modules directly. Interactive row, cell, schema, and view writes execute through the session-scoped database client: command lanes own optimistic overlays and isolated rollback, acknowledgements and realtime events share one ingestion path, and cached monolithic payload snapshots are never restored. Navigation-only actions remain in TanStack Query and refresh their narrow navigation queries after commit.

TanStack DB owns only interactive database entities and projections. TanStack
Query retains authentication, access/sharing, navigation, automation
management, AI, uploads, and other non-database-view workflows; Yjs owns page
documents; React-local state owns presence and transient interaction state.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/databases/database-routes.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).


The table [model](../../../apps/web/src/features/databases/views/table/model/database-table-model.ts) owns drop-target identity retention, including sub-item parent changes. List [row presentation](../../../apps/web/src/features/databases/views/list/components/list-row-presentation.ts) derives drag indicators and task completion labels. Their tests cover unchanged references, internal/external drag placement and parent nullability while controllers retain drag lifecycle and mutations.

Table, Kanban and toolbar composition keep named local render sections for property cells, grouped rows, cards and view source/actions. State remains in the existing controllers. Form title previews select the existing input or textarea with one shared set of props; question settings and mutations remain unchanged.

[Row mutations](../../../packages/features/src/databases/row-mutations.ts) complete after row confirmation. Adding a favorited page refreshes navigation in the background, so navigation latency or failure cannot delay the editor’s success callback or reject an already committed row. [Row mutation tests](../../../packages/features/src/databases/row-mutations.test.ts) cover slow and failed navigation refresh alongside optimistic rollback.
