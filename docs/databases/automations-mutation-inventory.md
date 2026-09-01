# Database automation mutation-path inventory

Baseline commit: `e8104d56`

This is the Pass 0 audit of server-side writes that can create an active
database row or change a row title/property. Pass 3 must convert every eligible
entry to the semantic mutation-fact contract or add the documented suppression
at its canonical service boundary. Realtime deltas are not accepted as facts.

## Canonical eligible paths

| Entry point | Current implementation | Required origin and fact |
| --- | --- | --- |
| Database cell API and AI cell tool | `features/databases/properties/cell-service.ts`; AI calls the same database route/service | `user`, `api`, or confirmed `ai`; one normalized property before/after fact |
| Row-page property endpoint | `features/pages/page-routes.ts` property-value mutation using `commitDatabaseMutationBatch` | One fact per distinct data source containing the page, not per linked display container |
| Row-page title endpoint | `features/pages/page-routes.ts` page patch and database-row fan-out | Title fact with property ID `name`; metadata/type/content edits emit no automation property fact |
| New or attached database row | `features/databases/rows/service.ts:createDatabaseRowService` | `page_added` plus initial title/default/inherited property facts; caller supplies `user`, `form`, `import`, `api`, or `ai` origin |
| Move row between data sources | `features/databases/rows/service.ts` multi-source move path | Page-added fact on the target only; source removal is not a trigger |
| Kanban/group drag with property change | `features/databases/rows/position-service.ts` | `user` property before/after fact when a group property changes; pure position changes emit no fact |
| Database template application | `features/databases/templates/service.ts` | `import` page-added facts with initial property values for every created row |
| Mail-to-database synchronization | `features/mail/mail-database-sync-worker.ts` | `integration`; page-added or exact changed title/property facts |
| Public or API-key row/cell mutation | Database routes resolve the actor before calling canonical services | `api` plus resolved actor/service identity |
| Confirmed Ask AI database tools | `features/ai/tools/ask-ai-database-tools.ts` delegates to row/cell services | `ai` only after the existing confirmation/approval boundary |
| Future form submission | No dedicated submission mutation service exists at this baseline | Must call atomic row creation with `form`; page-added plus submitted initial values |
| Future CSV/import entry point | No dedicated CSV row mutation service exists at this baseline | Must call bounded atomic row creation with `import` |
| Future database button action | Existing property UI is configuration-only | Must call canonical services with `button`; direct button changes may trigger automations |

## Suppressed or non-triggering paths

| Path | Current implementation | Required treatment |
| --- | --- | --- |
| Automation internal action | Added in Pass 4 | Always `automation`; suppress before opening/merging an event window |
| Pure row reorder | `features/databases/rows/position-service.ts` | `system`/no fact for position-only writes |
| Row delete and restore | `features/databases/core/service.ts`, `features/pages/page-routes.ts`, `features/pages/mutations/soft-delete-nav-items.ts` | No parity trigger; explicit suppression |
| Property schema create/edit/delete | `features/databases/properties/service.ts` and `structure-service.ts` | Schema mutation, not row-property edit; dependency invalidation runs separately |
| Property duplication/backfill | `features/databases/properties/duplication-service.ts` | `system`; suppress copied value writes |
| Property type conversion/value cleanup | `features/databases/properties/service.ts` | `system`; suppress migration writes and invalidate incompatible definitions |
| Sub-item/relation backfill | `features/databases/views/service.ts` and shared property upsert helper | `system`; suppress schema-derived backfill |
| Page body/collaboration changes | `features/collaboration/service.ts` and page content routes | Body content is outside trigger scope |
| Navigation metadata, URL, icon, cover, type | Page and database routes | No fact unless the actual row title changes |
| Demo/seed data | `features/demo/seed.ts` | Out-of-band bootstrap; explicit `system` suppression if run through production services later |
| Meeting pages | `features/meetings/meeting-service.ts` | Not database rows unless deliberately attached through row service; attachment then follows row-added rules |

## Shared helpers requiring caller context

- `features/pages/properties/upsert.ts` writes property values but has no source,
  row, actor, origin, or before-value context. It must remain a transaction-local
  helper; callers are responsible for emitting facts or explicit suppression.
- `features/databases/core/commit.ts` is the required transaction boundary for
  source mutations. Pass 3 extends it with optional source facts and performs
  event-window merging inside the same PostgreSQL transaction.
- `features/databases/realtime/delta.ts` loads presentation after-state and must
  never be used to infer automation semantics.

## Pass 3 completion query

Before event evaluation is enabled, rerun repository searches for direct
`databaseRow`, `pagePropertyValue`, and row-title writes. Any new result must be
added above and covered by either an eligible origin/fact test or an explicit
suppression test. The audit includes hosted/self-hosted shared server code,
mail/integration workers, AI tools, imports, templates, forms, and future button
execution.
