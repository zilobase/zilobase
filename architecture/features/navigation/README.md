# Navigation

## Owning modules and interface

- [apps/web/src/features/sidebar](../../../apps/web/src/features/sidebar)
- [packages/features/src/pages](../../../packages/features/src/pages)

[Page query normalization](../../../packages/features/src/pages/cache.ts) owns shared page labels and Query-owned membership references.

## Main flow

The [navigation model](../../../apps/web/src/features/sidebar/model/sidebar-navigation-model.ts) derives visible sections, recents, favorites, placements and nested database views. Its [item type](../../../apps/web/src/features/sidebar/model/sidebar-nav-item.ts) owns the hierarchy shape and accepts a generic icon value. React presentation specializes that type; the model does not import the rendering component or React.

The [navigation item command hook](../../../apps/web/src/features/sidebar/commands/use-navigation-item-actions.ts) owns query/mutation coordination for the header toolbar. Its interface groups item identity, favorites, locking, width, AI mode, menu commands and trash state. The [toolbar](../../../apps/web/src/features/sidebar/components/nav-actions.tsx) renders these controls alongside comments. The [sharing command hook](../../../apps/web/src/features/sidebar/commands/use-item-sharing.ts) owns access queries, selection drafts, guest mutations and publication guards. The [sharing dropdown](../../../apps/web/src/features/sidebar/components/item-share-dropdown.tsx) renders separate target, guest, access-rule and publishing sections, each with a typed subset of that state. Its external interface remains the page/database identity pair; opening and closing still mounts and disposes the sharing state.

The [page duplication model](../../../apps/web/src/features/sidebar/model/page-duplication.ts) copies document content while stripping comment marks without mutating the source. [Navigation link decisions](../../../apps/web/src/features/sidebar/model/database-view-navigation.ts) retain database ownership and default-view selection rules, shared by sidebar links and header commands. There is no workspace navigation socket, ticket issuance, event production or Node broadcaster. Local hierarchy acknowledgements update result references; other clients recover page, hierarchy and access changes on focus, reopen or explicit authorized reads. Database collaboration continues on database sockets.

[Page links](../../../apps/web/src/features/sidebar/components/nav-pages.tsx) prefetch authorized page detail and cold Yjs state after pointer dwell or keyboard focus through the [page prefetch owner](../../../apps/web/src/features/editor/collaboration/page-prefetch.ts). Prefetch has bounded concurrency and does not open a collaboration socket; the page still checks authorization when opened.

[Navigation timing](../../../apps/web/src/features/pages/navigation/page-navigation-timing.ts) marks sidebar and embedded-page opens before route work. The page pane records visible, editable and live `PerformanceMeasure` entries from that mark, falling back to pane mount for other entry points.

## Authorization and persistence

Navigation reflects accessible content and user sidebar preferences. [Sidebar configuration](../../../packages/features/src/user-settings/sidebar-config.ts) normalizes Home, AI and Calendar as fixed tabs, including existing saved layouts. Calendar is a static route tab with account controls instead of customizable shortcuts and sections. The [application sidebar](../../../apps/web/src/features/sidebar/app-sidebar.tsx) filters Calendar by its independent feature flag and keeps selection synchronized with the Calendar route, restoring the saved workspace tab when leaving it. Page graph/hierarchy ownership stays with page modules; sidebar visibility is not a server authorization decision.

## Side effects, failures and recovery

Calendar sidebar controls share the content pane's Calendar controller through a single provider in the [application layout](../../../apps/web/src/app/shell/content/app-layout.tsx), above both sibling subtrees. This boundary keeps source selection, dock actions and travel-zone display synchronized. The [provider regression test](../../../apps/web/test/app/calendar-provider-boundary.test.mjs) renders the real shell composition with unrelated surfaces stubbed and asserts both consumers receive the same context.

Hierarchy changes and workspace switches invalidate navigation state. Preserve expansion, ordering, recency, selected view and authorized read recovery while separating actions from rendering.

Database names, view configuration/ordering, primary-source configuration and favorites
are projected over navigation GET snapshots by the session database controller, not
patched into QueryClient. [Metadata projection](../../../packages/features/src/databases/interactions/navigation.ts)
compares the host and primary-source revision envelope with each mounted consumer;
bootstrap confirmation alone cannot retire a stale sidebar's intention. Navigation
GETs use a read-only repeatable-read transaction. Out-of-order responses reconcile
host, source and actor clocks independently. Database navigation deltas invalidate
reads rather than merging unversioned labels or removals into confirmed snapshots.
[Favorite projection](../../../packages/features/src/databases/interactions/favorites.ts)
compares the receipt's actor-private revision with each navigation consumer's
`actorState`. Confirmed reads retain newer private state when an older response arrives,
independently of public metadata. [Navigation deltas](../../../packages/features/src/pages/nav-delta.ts)
cannot overwrite database metadata, actor state or favorites. Page favorites and visits retain
their page-owned mutation paths.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/pages/navigation-cache.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

[Command tests](../../../apps/web/test/features/sidebar/navigation-item-actions.test.mjs) capture the real hook through React server rendering with controlled query, mutation and navigation adapters. They exercise lock permissions, meeting/database metadata, favorites, duplicate ordering and failures, pending guards and deletion feedback. These tests do not establish mounted effect timing. [Duplication tests](../../../apps/web/test/features/sidebar/page-duplication.test.mjs) verify immutable copies and link ownership; existing navigation tests verify hierarchy and ordering.

[Sharing tests](../../../apps/web/test/features/sidebar/item-sharing.test.mjs) use real React server rendering with controlled data and mutations, including render-phase state seeding for selection. They cover page/database access payloads, agent selection, guest invitation requests, guest-specific revocation, publication permissions and pending guards. They do not claim mounted input/focus behavior. [Navigation item state](../../../apps/web/src/features/sidebar/model/navigation-item-state.ts) separately owns lock precedence, permission presentation and pending-control decisions.

The existing Cloudflare [NavigationNotificationRoom class](../../../packages/runtime-adapter/src/worker/features/navigation-realtime/navigation-notification-room.ts)
remains exported for the deployed class/migration boundary. It rejects requests
with 410 and closes existing hibernated sockets. Deployment configuration and
migration declarations are retained; reconciling actual migration history is a
separate release handoff. The old navigation outbox table is inert and is no
longer polled or dispatched. This change intentionally removes retired public
ticket/event exports; the published-export baseline excludes only those symbols.
