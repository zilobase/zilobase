# Shared client cache: ownership and acceptance

## Baseline

Inspected core `8e5ec0553b1c9498aeb6ed83d6b38e779329a2cd`, Cloudflare adapter
`2c095615f7ecad0f98c01fd8c5ff06cb806a8e06`, and identity
`2b59768756f14d16e8d08c0b2184c207b1c3e974`; all were clean on local main.
Implementation branch: `codex/shared-client-cache`. Production runtime state has
not been queried or changed. Historical rollback SHAs do not establish current
production state or its applied Durable Object migration history.

| Measurement                            | Baseline status                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Production web build                   | Initial bundle budget reports 0.54 MB; 29 route chunks below 1 MB                                                                     |
| Mounted startup                        | 19 primary-browser API requests; 6,796 encoded response-body bytes; 3,402 ms through network-idle                                     |
| Existing Kanban move / checkbox writes | Three command POSTs, 1,829 response-body bytes; surrounding interaction phase includes 53 API requests and 25,007 response-body bytes |
| Browser heap                           | 96,428,320 bytes at startup; 155,425,640 after view switches/reloads; no forced GC                                                    |
| Title edit / retained mount-cycle heap | Not measured yet; these remain acceptance work                                                                                        |

The [one-sample baseline](cache-baseline.json) was captured while Pass 2 remained
uninstalled, using the unchanged signed-in application fixture with optional
measurement instrumentation. It is a development Vite measurement, not a
production latency claim or a median. Setup requests, peer-browser requests,
static assets and socket bytes are excluded. Response sizes are encoded body
bytes; heap readings are Chrome `JSHeapUsedSize`, not retained-size measurements.

Colima's daemon responded inside its VM but its host Unix socket was broken. A
temporary Unix-socket proxy to `colima ssh -- docker system dial-stdio` allowed
disposable PostgreSQL, Valkey and RustFS fixtures to run without resetting the VM
or development data. The real application fixture passed Kanban move and value
editing, view switches, persistence after reload, independent-peer delivery and
reconnect recovery. This establishes the existing behavior, not cache migration
acceptance.

Reproduce via `ZILOBASE_APP_MEASUREMENTS=/private/tmp/cache-measurements.json npm run
test:databases:app-browser` using a working Docker connection. The optional
instrumentation in [the harness](../../scripts/databases/test-app-browser.mjs)
records only request sizes/paths and timing/heap metrics, without headers or
bodies. Compare identical seeded fixtures and loaded windows; repeat samples for
medians and add title/mount-cycle measurements before final acceptance.

## Foundation proof

Pass 2 pins DB 0.11.3 and React DB 0.5.3. The foundation was uninstalled during that proof. Eleven focused collection/boundary proofs, the 265-test feature suite,
feature typechecking, production build, UI lint and architecture checks pass.
The [mounted browser fixture](../../scripts/data/test-cache-browser.mjs) verifies
three independent React consumers and a page/property join render only complete
publications. Run `npm run test:data:browser`; SSR lookup is not its substitute.
The fixture is independent of the application and does not prove migrated surfaces.

## Page metadata cutover

Pass 4 installs the session owner through explicit web composition. Page detail
and navigation Query results contain references and context; hooks resolve current
metadata across panes, headers, breadcrumbs, sidebar and database rows. Metadata
writes are sparse and atomically merge JSON fields. Supported transactions
serialize same-page previews. A conflicting confirmation rolls back its preview,
while independent HTTP tracking preserves acknowledgement/rejection and queue order.
No full page/navigation/bootstrap reads follow ordinary page metadata edits.
Title-dependent filters/sorts and computed dependencies use targeted window reads;
other database result refresh paths are retained until Pass 7. Full record frames
that only confirm known page metadata use this same targeted path; value,
placement, lifecycle and unknown-record changes still require recovery reads.

The signed-in Docker fixture verifies simultaneous sidebar, table row and page
pane labels, one PATCH, no full page/navigation/bootstrap GET after the edit and
no navigation ticket/socket. Existing two-client drag/value/reconnect cases pass.
The page pane proof also required guarding editor controls against a retired
Tiptap view during lifecycle replacement; Yjs storage and transport are unchanged.
Pass 4 checks: 284 feature tests, web tests, production build (0.81 MB initial
bundle within budget), UI lint, architecture links/exports, 119 runtime tests,
1,012 server tests (13 skipped), 26 core Worker tests and Cloudflare build/14
Worker tests. Final cross-surface, retention and performance acceptance remains
in Passes 9–12.

Navigation ticket issuance, clients, producers, task dispatch and Node delivery
are retired. The Cloudflare class export/declarations remain; its inactive room
returns 410 and closes old sockets. The old outbox table is inert. Retired public
exports are intentionally removed from the architecture baseline. Covered
navigation browser snapshot persistence is excluded once it holds session references.

## Storage identities

Pass 3 preparation adds typed database normalization and source-scoped socket
delivery. The collection adapters were uninstalled at the Pass 3 commit. Coverage/removal metadata
uses TanStack DB's public sync metadata API; delayed staged inputs revalidate
against the current base before a coherent publication. Result exclusion never
implicitly deletes a canonical page, definition, value or source.

Confirmed page, definition, value, record and binding ordering uses the existing
persisted timestamps, enforced by migration 0107. Hosts, sources, links and views
use their applicable host/source lanes. The existing event JSON carries source
clocks. Database tickets carry the existing linked-source authorization result;
Node and Worker rooms send an empty reset hint when an event exceeds that scope.
No additional journal, revision table, room class or authorization provider was
introduced. Apply the stamp migration before installing migrated consumers and
roll out ticket issuance with both runtime verifiers; this document does not
authorize deployment.

The proof suite covers delayed reads, both confirmation orders, duplicate
identities, partial metadata, lifecycle/hard-removal barriers, malformed batch
rejection, canonical value IDs, source unlinking and gated export snapshots.
Real PostgreSQL tests verify competing entity writers; Node and workerd tests
verify peers with different source grants. The existing signed-in application
fixture also passes with the revised ticket contract and stamp migration. Full shared-cache application acceptance remains pending the remaining consumer
cutovers and final comparison.

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
