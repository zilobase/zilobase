# Databases

## Owning modules and interface

- [apps/server/src/features/databases](../../../apps/server/src/features/databases)
- [apps/web/src/features/databases](../../../apps/web/src/features/databases)
- [packages/features/src/databases](../../../packages/features/src/databases)

[Background task implementation](../../../apps/server/src/features/databases/realtime/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

Database routes compose reads, rows, properties and data-source operations. The web database surface derives a view model and commands from shared payloads; feature mutations coordinate optimistic state and realtime invalidation.

Database JSON routes use shared authenticated input parsing, retaining each operation’s payload validation and permission decisions. [Transport tests](../../../apps/server/src/features/databases/route-input.test.ts) cover malformed input and authentication ordering.

The accepted [responsive database client and mutation protocol decision](../../decisions/0004-responsive-database-client.md) defines the staged replacement for the full-payload and snapshot-rollback flow described here. Until each compatibility pass lands, this guide continues to describe the implemented v1 system.

## Authorization and persistence

OAuth database routes require `databases.read` or `databases.write` and bind the requested resource to the granted workspace before existing ACL checks. Database routes load the database; row, property, template and direct data-source routes load the data source, whose ID is still exposed as `:id` on legacy routes. Creation validates the body workspace. [Token resource middleware](../../../apps/server/src/features/auth/pinned-resource-middleware.ts) is attached per endpoint so Hono composition cannot apply a database loader to a later data-source route. [Route regression tests](../../../apps/server/src/features/databases/database-routes.test.ts) exercise both identifier kinds.

A database is page-backed; data sources, rows, views and property values are separate persisted concepts. Rows now have a nullable, backfilled `NUMERIC(30,10)` order key alongside the active integer-position compatibility field. [Shared order-key utilities](../../../packages/features/src/databases/order-key.ts) encode the decimal as a scaled bigint for deterministic cross-runtime midpoint calculation. Existing inserts and full-order operations take a transaction-scoped source advisory lock and dual-write order keys; precision exhaustion rebalances keys at intervals of 1024. Integer row positions and page-item placement positions remain the v1 compatibility projection. The [v2 persistence migration](../../../apps/server/drizzle/0090_database_mutation_journal.sql) also adds the durable versioned mutation journal and idempotent command receipts; runtime writers adopt them in later passes. Resource and data-source access checks constrain mutations. Formula and value rules also have shared implementations.

## Side effects, failures and recovery

Row/property changes can update realtime outboxes, automations and page navigation. Preserve mutation origin and transaction ordering. Database realtime revisions and cache reconciliation prevent stale UI after writes.

## Focused guides

- [Database mutation and realtime flow](realtime.md)
- [Database views and properties](views-and-properties.md)
- [Table interactions and rendering](table-interactions.md)

## Client mutation ownership

Shared mutations are grouped into database lifecycle, data sources, views, properties/templates, access and rows. The [legacy mutation entrypoint](../../../packages/features/src/databases/mutation-hooks.ts) preserves public exports; React bindings select the operation modules directly. [Cache policy](../../../packages/features/src/databases/mutation-cache-policy.ts) owns confirmed response application and version-aware rollback. [Query cache](../../../packages/features/src/databases/query-cache.ts) cancels, snapshots and updates every surface showing a data source before row writes. Reorder, move and value mutations restore those snapshots on failure; they receive the active data-source ID even though the legacy input field is named databaseId. [Row-addition cache transactions](../../../packages/features/src/databases/add-row-transaction.ts) own source/target snapshots, optimistic transfer, confirmed response reconciliation and rollback; the hook owns HTTP and subsequent navigation refresh. Favorite and view rollbacks retain their different version/navigation policies.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/databases/database-routes.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).


The table [model](../../../apps/web/src/features/databases/views/table/model/database-table-model.ts) owns drop-target identity retention, including sub-item parent changes. List [row presentation](../../../apps/web/src/features/databases/views/list/components/list-row-presentation.ts) derives drag indicators and task completion labels. Their tests cover unchanged references, internal/external drag placement and parent nullability while controllers retain drag lifecycle and mutations.

Table, Kanban and toolbar composition keep named local render sections for property cells, grouped rows, cards and view source/actions. State remains in the existing controllers. Form title previews select the existing input or textarea with one shared set of props; question settings and mutations remain unchanged.

[Row mutations](../../../packages/features/src/databases/row-mutations.ts) complete after row confirmation. Adding a favorited page refreshes navigation in the background, so navigation latency or failure cannot delay the editor’s success callback or reject an already committed row. [Row mutation tests](../../../packages/features/src/databases/row-mutations.test.ts) cover slow and failed navigation refresh alongside optimistic rollback.
