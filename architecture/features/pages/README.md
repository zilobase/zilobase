# Pages

## Owning modules and interface

- [apps/server/src/features/pages](../../../apps/server/src/features/pages)
- [apps/web/src/features/pages](../../../apps/web/src/features/pages)
- [packages/features/src/pages](../../../packages/features/src/pages)

## Main flow

The page route composition mounts browse, visit, hierarchy, sharing, content and lifecycle routes in order. Web page composition selects authenticated, guest or public presentation and embeds the editor. Shared queries and mutation hooks coordinate cache state.

## Authorization and persistence

OAuth page routes require `pages.read` or `pages.write`. [Token resource middleware](../../../apps/server/src/features/auth/pinned-resource-middleware.ts) binds every page ID, including published and deleted-page reads, to the granted workspace before existing ACL checks. List queries, creation and visit bodies enforce the same workspace binding. [Route regression tests](../../../apps/server/src/features/pages/page-route-access.test.ts) cover cross-workspace denials and retained ACL enforcement.

Pages, placements, access grants and collaboration documents represent different concerns. The [authenticated route guard](../../../apps/server/src/features/pages/page-route-access.ts) resolves identity, page existence, effective access and active workspace in that order, returning the authorized record and access level. Content and sharing handlers use it without changing their distinct required access. Deleted-page, guest and public loading retain separate paths. [Route tests](../../../apps/server/src/features/pages/page-route-access.test.ts) verify denial and workspace-check ordering. Page lock and layout preferences also influence presentation and permitted editing.

## Side effects, failures and recovery

Writes can change hierarchy, database associations and navigation state. Preserve route ordering, optimistic rollback, structural content and editor lifecycle when separating presentation from commands.

## Client mutation ownership

Page mutations are grouped by access, guests, placement, content/lifecycle and activity. The [legacy mutation entrypoint](../../../packages/features/src/pages/mutation-hooks.ts) preserves exports; React bindings select each operation family directly. Access mutations share invalidation of detail and access queries; guest invitation/request invalidation remains distinct. Content and favorite rollbacks retain their existing snapshot scopes.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/pages/content-state.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Screens and capabilities

[Route screens](../../../apps/web/src/features/pages/screens) contain the page route and invitation acceptance. The [page route](../../../apps/web/src/features/pages/screens/page.tsx) chooses the authorized viewer mode. Embedded consumers import the [editor pane](../../../apps/web/src/features/pages/pane/page-editor-pane.tsx) and [shared-page chrome](../../../apps/web/src/features/pages/publication/shared-page-header.tsx) directly. URLs and route parameters are unchanged.

[Pane state and composition](../../../apps/web/src/features/pages/pane/page-side-pane.tsx), [pane headers](../../../apps/web/src/features/pages/pane/page-pane-header.tsx), and [embedded dialogs](../../../apps/web/src/features/pages/pane/embedded-page-dialog.tsx) have separate interfaces. [Layout editing](../../../apps/web/src/features/pages/layout/index.ts) and [layout sidebar state](../../../apps/web/src/features/pages/layout/page-layout-sidebar.tsx) likewise remain separate entrypoints so importing state does not load editor/rendering composition. Server [page-layout routes](../../../apps/server/src/features/page-layouts/routes.ts) decode scope params and save JSON with Schema; invalid writes still return `{ error: "Invalid layout." }`. Cross-feature callers use these interfaces; feature internals import their concrete siblings. The old mixed context barrel is removed. Publication preferences and sharing access remain under publication, while breadcrumb and hierarchy derivation live beside navigation paths.

## Page loading and presentation

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
it. The page's Yjs database node remains the stable restore anchor, while the
database feature owns its trash presentation and edit lock. Shared lifecycle
cache handling refreshes deleted-aware database reads on delete and both active
and deleted-aware reads on restore; restoration therefore does not depend on a
page reload, navigation change, or realtime delivery.
