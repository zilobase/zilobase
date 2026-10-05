# Shared client cache: ownership and acceptance

## Baseline

Inspected core `8e5ec0553b1c9498aeb6ed83d6b38e779329a2cd`, Cloudflare adapter
`2c095615f7ecad0f98c01fd8c5ff06cb806a8e06`, and identity
`2b59768756f14d16e8d08c0b2184c207b1c3e974`; all were clean on local main.
Implementation branch: `codex/shared-client-cache`. Production runtime state has
not been queried or changed. Historical rollback SHAs do not establish current
production state or its applied Durable Object migration history.

| Measurement                                            | Baseline status                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Production web build                                   | Initial bundle budget reports 0.54 MB; 29 route chunks below 1 MB |
| Mounted startup HTTP count, response bytes and latency | Not measured: Docker daemon unavailable                           |
| Title/value mutation HTTP count and response bytes     | Not measured: Docker daemon unavailable                           |
| Retained heap after mount/unmount cycles               | Not measured: Docker daemon unavailable                           |

`colima start` reports already running, but Docker cannot connect to its existing
socket even outside the sandbox. Do not reset the existing VM or development
database to obtain a measurement. Run the disposable application harness when
Docker is available, before installing migrated consumers. Preparation that is
not imported by the app cannot change that runtime baseline.

Baseline application verification uses
[the signed-in application harness](../../scripts/databases/test-app-browser.mjs),
which starts disposable PostgreSQL, Valkey and object storage and two independent
browser contexts. Instrument its real network responses for request count and
encoded bytes, page performance marks for latency, and browser heap/collection
counts for repeated mounts. Compare identical seeded fixtures and loaded windows;
record runtime, sample count and medians rather than treating a build as UI proof.

## Storage identities

| Entity owner     | Storage identity                | Normalization                                                                    |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| Page metadata    | `page.id`                       | Name, metadata/icon/cover, lifecycle and shared metadata; no body or actor flags |
| Database host    | `database.id`                   | Separate authorized access and private preferences                               |
| Data source      | `data_source.id`                | Exclude host-specific position/linkedAt from the shared entity                   |
| Source link      | `(database_id, data_source_id)` | `database_data_source`; position and linking data belong to this pair            |
| Definition       | `page_property.id`              | Page property and database column resolve this same definition                   |
| Binding          | `database_property.id`          | References definition/source; owns width, visibility and position                |
| Stored value     | `(page_id, property_id)`        | Unique persisted pair in `page_property_value`; retain value ID                  |
| Record           | `database_row.id`               | References source/page; embedded page/value payloads are ingestion inputs only   |
| Saved view       | `database_view.id`              | References host/source; persisted query config differs from local drafts         |
| Placement        | `page_item_placement.id`        | References page/database; membership removal is not entity deletion              |
| Private settings | `page_settings.user_id`         | Actor-scoped; sidebar/width/open-as preferences                                  |
| Favorite/visit   | Actor plus item kind/ID         | `favorites`, `item_visit`; database favorites also carry actor revision          |
| Access facet     | Viewer/capability plus resource | Derived permission or rule identity; never public entity metadata                |

Storage evidence: [pages](../../apps/server/src/infrastructure/database/schema/pages.ts),
[properties](../../apps/server/src/infrastructure/database/schema/page-properties.ts),
[databases](../../apps/server/src/infrastructure/database/schema/databases.ts),
[navigation](../../apps/server/src/infrastructure/database/schema/navigation.ts), and
[settings](../../apps/server/src/infrastructure/database/schema/user-settings.ts).

## Consumer and writer migration matrix

Each feature directory below includes its mounted layouts, menus and supporting
models. Consumer imports must be audited again at cutover: a hook migration alone
does not remove imperatively read Query data or retained presentation summaries.

| Existing owner / consumer family                                     | Writer / read boundary                                                 | Destination                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Page detail, main/side/embedded panes, header, title drafts          | `pages/queries`, `content-mutations`; server page-content routes       | Shared pages; pane-local editor input only                                         |
| Sidebar hierarchy, favorites/recents, breadcrumbs                    | Page navigation GET, nav-delta, activity and placement actions         | Entity references plus navigation membership; actor-private facets                 |
| Page properties and property presence targets                        | Page-properties GET; database row commands / page property write route | Shared definitions/values; query-owned authorized memberships and presence targets |
| Database bootstrap and metadata/header controls                      | Database bootstrap GET; host/source/schema/view commands               | Hosts, sources, links, definitions, bindings and views                             |
| Table cells/headers, Kanban, list, gallery, timeline, chart, form    | Record windows plus database controller                                | Shared records/pages/values; ordered window IDs/counts/snapshot                    |
| Database metadata on page panels and linked-source controls          | Bootstrap/secondary payload, navigation projections                    | Same canonical hosts/sources/definitions, with scoped links                        |
| Relation cells, reciprocal hierarchy, relation pickers               | Record changes, relation reads, hierarchy commands                     | Canonical stored values and referenced current labels                              |
| Search/AI page summaries and picker results                          | Search and page-summary GETs                                           | Shared labels; query-owned rankings/snippets/membership                            |
| Editor page/database blocks and references                           | Page navigation/read hooks, editor actions                             | Shared referenced metadata; body stays in Yjs                                      |
| Tasks, library, teamspace and trash references                       | Feature lists and lifecycle actions                                    | Shared metadata/lifecycle, independently owned list membership                     |
| Sidebar/navigation item menus and sharing controls                   | Item action cache, access/guest/publication actions                    | Shared entities plus viewer-scoped access/private state                            |
| AI database-tool effects and context exports                         | Tool cache effects, database context reads                             | Typed ingestion and an explicit coherent export snapshot                           |
| Guest/public pages and forms                                         | Existing authorized public/guest GETs                                  | Capability-isolated session; no authenticated private facets                       |
| Page prefetch and cached authorized detail                           | Page prefetch / document bootstrap                                     | Ingest authorized metadata; preserve Yjs document/prefetch lifecycle               |
| Persisted navigation/bootstrap/windows/properties/settings snapshots | `page-read-cache`, document-cache snapshot table                       | Remove persistence only for migrated shared domains                                |
| Custom sparse intention/controller projections                       | Database interaction store/model/navigation/favorites                  | DB transactions; retain only command scheduling/identity/status                    |
| Historical snapshots, import/export bodies, cached Yjs updates       | Their feature-specific writers                                         | Preserve historical semantics; never register as live mutable metadata             |

Canonical feature entrypoints are in
[the feature package](../../packages/features/package.json). Web ownership roots:
[pages](../../apps/web/src/features/pages),
[sidebar](../../apps/web/src/features/sidebar),
[databases](../../apps/web/src/features/databases),
[editor](../../apps/web/src/features/editor),
[search](../../apps/web/src/features/search),
[tasks](../../apps/web/src/features/tasks), and
[library](../../apps/web/src/features/library).

## Baseline edit traces and concrete gaps

Page title: pane `useTitleDraft` / `useUpdatePage` -> PATCH existing page route ->
page write and linked-record mutation batch -> returned page -> detail/navigation
Query patches and host invalidation. Rejection restores previous detail and all
captured navigation snapshots, risking rollback over another successful edit.

Stored value: cell/page-panel action -> session controller -> one existing v2
command POST (same ID/body on uncertain transport retry) -> receipt plus mutation
event/source versions -> committed intention -> host/bootstrap/window/page-property
and context invalidation. Socket delivery validates a mutation frame but currently
uses only its host version as a poke. The acknowledgement already ends the command
promise; retained projections wait for consumer-specific confirmed reads.

Ordering gaps: socket events omit acknowledgement source versions; shared page,
definition and value timestamps are assigned before lock/commit and are not a
proven commit clock. Different host versions cannot order a page/value shared by
linked hosts. Navigation partial summaries can omit configuration. Source unlink
uses `removedDataSourceIds`; property archive removes a binding ID while actually
soft-deleting its definition; record archive removes a result without necessarily
deleting the page. These shapes need operation-aware normalization.

Authorization gap: database tickets authorize a host, but bootstrap filters linked
sources using their owning hosts. Room frames are broadcast to host peers. Socket
data must not be admitted merely because the peer can view that host; prove source
authorization and narrow delivery/admission before enabling entity ingestion.

Library gap: concurrent optimistic row updates can retain whole-row snapshots.
Test retirement on authoritative conflict, rejection isolation, queued same-entity
edits and multi-collection publication on the pinned release before cutover.

## Acceptance fixtures and gates

Use a page present simultaneously in navigation, a database and a side pane;
two hosts linked to one source; two definitions/bindings sharing a definition;
two independent clients; an inaccessible linked source; a guest/public capability;
and a bounded filtered/sorted record window with more matching rows than its limit.

| Scenario                                                        | Required outcome                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Title/icon/cover edit                                           | Every mounted authorized reference in the writer updates from one owner            |
| Definition/option/value/relation edits                          | Consistent shared labels/values; current business formats preserved                |
| Ordinary non-membership edit                                    | One normal logical write; no full bootstrap/page/navigation refetch                |
| Filter/sort-affecting edit                                      | Targeted authoritative membership/count/replacement read                           |
| Partial or empty query response                                 | Omitted fields retained; other query memberships and entities survive              |
| Stale HTTP, duplicate/reordered frames, either ack/socket order | Confirmed state does not regress                                                   |
| Rejection and later collaborator update                         | Only the rejected intention disappears; valid state survives                       |
| Different-field and rapid edits                                 | Sparse server writes compose; queued edits retain command identities               |
| Validated acknowledgement                                       | Saving ends; synchronization health remains independent                            |
| Reconnect/reset/missed database event                           | Explicit authorized recovery, no global backend engine                             |
| Scope/account/capability change or known access loss            | No late publication or private/cross-viewer leakage                                |
| Navigation retirement                                           | No ticket/socket; other-client page/hierarchy updates recover on focus/reopen/read |
| Repeated mount/unmount                                          | Inactive interests expire; mounted references and pending edits are protected      |
| Rich-text editing                                               | Existing Yjs ownership, persistence and collaboration remain functional            |

Each named pass is one tested, clean commit; split an oversized pass into separately
named commits before continuing. Preparatory collections must remain uninstalled.
Run the current scripts from [testing and quality](../../architecture/setup/testing-and-quality.md).
No unsupported library API, second confirmed store, new synchronization journal,
global revision schema, service binding, Durable Object class or deployment change
may be used to pass a fixture. Report a failed proof gate instead of expanding scope.

## Release boundary

No push, deployment, production database reset or identity schema/provisioning
change is part of implementation. The final release handoff must reconcile the
actually applied Cloudflare forward rollback migration restoring
`NavigationNotificationRoom` and deleting `ApplicationDataRoom`; Git's restored
migration list is not sufficient evidence. Retiring navigation clients/producers
does not authorize deleting deployed class exports or editing migration history.
