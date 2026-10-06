# Pages

## Owning modules and interface

- [apps/server/src/features/pages](../../../apps/server/src/features/pages)
- [apps/web/src/features/pages](../../../apps/web/src/features/pages)
- [packages/features/src/pages](../../../packages/features/src/pages)

## Main flow

The page route composition mounts browse, visit, hierarchy, sharing, content and lifecycle routes in order. Web page composition selects authenticated, guest or public presentation and embeds the editor. [Page normalization](../../../packages/features/src/pages/cache.ts) stores shared metadata in session collections and returns Query-owned page references plus authorized context. [React hooks](../../../packages/features/src/pages/query-hooks.ts) resolve current metadata for panes, headers, breadcrumbs and sidebar labels; database rows resolve the same page identity.

For authenticated visits, the [route guard](../../../apps/web/src/app/routing/guards.ts) resolves already-active scoped references or awaits an authorized read before rendering. A cold reload does not restore page metadata or authorization from IndexedDB. The [read cache](../../../apps/web/src/features/pages/cache/page-read-cache.ts) retains bounded unrelated snapshots for meetings, layout and user settings; covered page/navigation/database/property/access/search snapshots are removed. Its account- and deployment-scoped store is pruned with the independent Yjs page cache.

The [page pane](../../../apps/web/src/features/pages/pane/page-editor-pane.tsx) renders authorized page metadata and its last HTTP content while a cold Yjs document loads, then binds the collaborative document when ready. Page-body and comment edits use the bounded online Yjs bridge. Metadata PATCH writes are sparse and merge JSON fields atomically on the server. Their acknowledgements update collections without full detail/navigation/bootstrap reads. [Command coordination](../../../packages/features/src/data/commands.ts) serializes overlapping page previews using supported library transactions; authoritative changes retire the preview while HTTP confirmation continues. Database and page metadata commands use their own online HTTP paths and permissions without waiting for the page socket; offline cached data is read only.

## Authorization and persistence

OAuth page routes require `pages.read` or `pages.write`. [Token resource middleware](../../../apps/server/src/features/auth/pinned-resource-middleware.ts) binds every page ID, including published and deleted-page reads, to the granted workspace before existing ACL checks. List queries, creation and visit bodies enforce the same workspace binding. [Route regression tests](../../../apps/server/src/features/pages/page-route-access.test.ts) cover cross-workspace denials and retained ACL enforcement.

Pages, placements, access grants and collaboration documents represent different concerns. The [authenticated route guard](../../../apps/server/src/features/pages/page-route-access.ts) resolves identity, page existence, effective access and active workspace in that order, returning the authorized record and access level. Content and sharing handlers use it without changing their distinct required access. Deleted-page, guest and public loading retain separate paths. [Route tests](../../../apps/server/src/features/pages/page-route-access.test.ts) verify denial and workspace-check ordering. Page lock and layout preferences also influence presentation and permitted editing.

## Side effects, failures and recovery

Writes can change hierarchy, database associations and navigation state. Preserve route ordering, optimistic rollback, structural content and editor lifecycle when separating presentation from commands.

## Client mutation ownership

Page mutations are grouped by access, guests, placement, content/lifecycle and activity. The [React entrypoint](../../../packages/features/src/pages/react.ts) exports each operation family directly; the page root exposes contracts and pure query builders, not hooks. Access mutations share invalidation of detail and access queries; guest invitation/request invalidation remains distinct. Metadata and favorite previews use supported collection transactions; body and historical snapshots keep their feature ownership.

The navigation hook resolves pages, database hosts, sources, views, placements and actor-scoped favorites from shared collections. Query owns ordered result references. Authenticated
[navigation reads](../../../apps/server/src/features/pages/page-browse-routes.ts) return
host, primary-source and actor revision envelopes from a read-only repeatable-read
snapshot. Envelopes appear only on these reads, not on workspace navigation deltas;
database deltas request a refresh instead of patching database state. Navigation source facets now use the same owning-database authorization rule as bootstrap. Local read ordinals order unversioned placement, page preference and access reads within their authorization session; they do not compare shared host/source/entity revisions or claim cross-client event ordering. Page bodies and creator profiles stay contextual.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/pages/content-state.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Screens and capabilities

[Route screens](../../../apps/web/src/features/pages/screens) contain the page route and invitation acceptance. The [page route](../../../apps/web/src/features/pages/screens/page.tsx) chooses the authorized viewer mode. Embedded consumers import the [editor pane](../../../apps/web/src/features/pages/pane/page-editor-pane.tsx) and [shared-page chrome](../../../apps/web/src/features/pages/publication/shared-page-header.tsx) directly. URLs and route parameters are unchanged.

[Pane state and composition](../../../apps/web/src/features/pages/pane/page-side-pane.tsx), [pane headers](../../../apps/web/src/features/pages/pane/page-pane-header.tsx), and [embedded dialogs](../../../apps/web/src/features/pages/pane/embedded-page-dialog.tsx) have separate interfaces. [Layout editing](../../../apps/web/src/features/pages/layout/index.ts) and [layout sidebar state](../../../apps/web/src/features/pages/layout/page-layout-sidebar.tsx) likewise remain separate entrypoints so importing state does not load editor/rendering composition. Server [page-layout routes](../../../apps/server/src/features/page-layouts/routes.ts) decode scope params and save JSON with Schema; invalid writes still return `{ error: "Invalid layout." }`. Cross-feature callers use these interfaces; feature internals import their concrete siblings. The old mixed context barrel is removed. Publication preferences and sharing access remain under publication, while breadcrumb and hierarchy derivation live beside navigation paths.

Page width and embedded-item placement are viewer preferences; obsolete page-metadata switches are ignored and no compatibility predicate is exported. Stored SVG icons render only the canonical sanitized representation produced by the current icon writer.

## Page loading and presentation

[Page-property reads](../../../packages/features/src/pages/property-cache.ts)
carry an authorized workspace ID and ordered definition IDs. Panels resolve
current definitions and stored values through session collections. No covered
page-property browser snapshot is hydrated.

Page-property presence targets carry both host and source IDs. Property edits submit
to the database controller using that explicit scope; membership properties are
matched by source, not merely by host, so linked sources cannot be confused.

The page route selects authenticated, guest or public presentation from the existing route context. [Authenticated composition](../../../apps/web/src/features/pages/screens/authenticated-page.tsx) retains workspace gates for both main and side panes. [Shared-page composition](../../../apps/web/src/features/pages/publication/shared-page.tsx) owns its resettable pane provider and guest/public chrome, preserving the different read-only flags and delayed side-pane mounting. Breadcrumb labels use the canonical icon/label formatter.

[PageEditorPane](../../../apps/web/src/features/pages/pane/page-editor-pane.tsx) keeps page queries, commands, metadata drafts and editor integration local to the pane. [Editability rules](../../../apps/web/src/features/pages/pane/page-editability.ts) distinguish body edits from comment permissions: locks stop body edits, while read-only views and deleted pages stop both. Editor-level collaboration guards remain separate.

[Content recovery](../../../apps/web/src/features/pages/pane/page-content-recovery.ts) is shared by missing database and meeting block restoration. It restores meaningful saved content only into an effectively empty editor, stops when the editor refuses a write, and preserves live content. Its narrow content-handle interface is exercised by [behavioral tests](../../../apps/web/test/features/pages/page-content-recovery.test.mjs). Content-save timing, comments and collaboration lifecycles are unchanged.

Locally created database and meeting blocks form one structural-insertion
transaction from the create request through the Tiptap insertion. Page hierarchy
recovery defers while that transaction is active, then rechecks live editor
content before restoring a missing block. This prevents a navigation or meeting
query update from replacing the document between creation and insertion.

Successful page/database embedding in [placement mutations](../../../packages/features/src/pages/placement-mutations.ts) invalidates navigation in the background. Editor callers can complete as soon as the embed request succeeds; navigation refetch latency or failure does not hold the mutation open or report a committed embed as rejected. [Mutation latency tests](../../../packages/features/src/pages/placement-mutations.test.ts) exercise this ordering with a real mutation observer and controlled save/refresh promises.

Soft-deleting a database does not delete an otherwise active page that embeds
it. Deletion through the block menu removes the database node in the same undo
operation as the resource transition. A stale node discovered after an external
or completed deletion is removed from the collaborative document without adding
a new editor-history entry. Deleted databases never start record-window or
realtime subscriptions. Active navigation also omits placements whose database
endpoint is not in the active database payload, so structural recovery cannot
reinsert a tombstoned database block and append a new trailing paragraph on
each page load. Shared lifecycle cache handling still refreshes deleted-aware
reads on delete and both active and deleted-aware reads on restore.

Page-property Query results contain ordered definition IDs, value property IDs,
page identity and authorized contextual targets. Canonical stored values retain
persisted IDs while using `(pageId, propertyId)` collection keys. The page panel
releases submitted editor drafts to the shared transaction and clears saving at
acknowledgement; it does not issue a blanket page/property read after an ordinary
value edit. Covered record-window browser snapshots are also excluded from persistence and
hydration. Its authorized row targets allow narrowly scoped socket/acknowledgement
admission without loading a database bootstrap.

## Editor sessions and structural relationships

The pane binds the app-owned document session and registers a token-owned live document handle for page and AI consumers. Opening an already open page focuses its existing view. Pane promotion preserves the editor instance, selection and session history. Body transactions reconcile structural relationship changes by inspecting changed ranges; JSON materialization is reserved for explicit reads and local/demo persistence.

Resource link mutations return the newly created `placementId`, or null when the relationship already exists. Compensation sends that ID to the existing DELETE embed endpoint, which limits deletion to the operation's placement. This preserves preexisting relationships. The identifier is a relationship receipt, not a persisted block ID or transfer journal. Hierarchy recovery waits for locally pending structural operations before restoring content.
