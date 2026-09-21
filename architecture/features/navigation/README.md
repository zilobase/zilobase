# Navigation

## Owning modules and interface

- [apps/web/src/features/sidebar](../../../apps/web/src/features/sidebar)
- [apps/server/src/features/workspaces/navigation-realtime](../../../apps/server/src/features/workspaces/navigation-realtime)
- [packages/features/src/pages](../../../packages/features/src/pages)

[Background task implementation](../../../apps/server/src/features/workspaces/navigation-realtime/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

The [navigation model](../../../apps/web/src/features/sidebar/model/sidebar-navigation-model.ts) derives visible sections, recents, favorites, placements and nested database views. Its [item type](../../../apps/web/src/features/sidebar/model/sidebar-nav-item.ts) owns the hierarchy shape and accepts a generic icon value. React presentation specializes that type; the model does not import the rendering component or React.

The [navigation item command hook](../../../apps/web/src/features/sidebar/commands/use-navigation-item-actions.ts) owns query/mutation coordination for the header toolbar. Its interface groups item identity, favorites, locking, width, AI mode, menu commands and trash state. The [toolbar](../../../apps/web/src/features/sidebar/components/nav-actions.tsx) renders these controls alongside comments. The [sharing command hook](../../../apps/web/src/features/sidebar/commands/use-item-sharing.ts) owns access queries, selection drafts, guest mutations and publication guards. The [sharing dropdown](../../../apps/web/src/features/sidebar/components/item-share-dropdown.tsx) renders separate target, guest, access-rule and publishing sections, each with a typed subset of that state. Its external interface remains the page/database identity pair; opening and closing still mounts and disposes the sharing state.

The [page duplication model](../../../apps/web/src/features/sidebar/model/page-duplication.ts) copies document content while stripping comment marks without mutating the source. [Navigation link decisions](../../../apps/web/src/features/sidebar/model/database-view-navigation.ts) retain database ownership and default-view selection rules, shared by sidebar links and header commands. Workspace navigation realtime propagates invalidations through an outbox and shared event/cache logic.

## Authorization and persistence

Navigation reflects accessible content and user sidebar preferences. [Sidebar configuration](../../../packages/features/src/user-settings/sidebar-config.ts) normalizes Home, AI, Mail and Calendar as fixed tabs, including existing saved layouts. Calendar is a static route tab with account controls instead of customizable shortcuts and sections. The [application sidebar](../../../apps/web/src/features/sidebar/app-sidebar.tsx) filters Calendar by its independent feature flag and keeps selection synchronized with the Calendar route, restoring the saved workspace tab when leaving it. Page graph/hierarchy ownership stays with page modules; sidebar visibility is not a server authorization decision.

## Side effects, failures and recovery

Calendar sidebar controls share the content pane's Calendar controller through a single provider in the [application layout](../../../apps/web/src/app/shell/content/app-layout.tsx), above both sibling subtrees. This boundary keeps source selection, dock actions and travel-zone display synchronized. The [provider regression test](../../../apps/web/test/app/calendar-provider-boundary.test.mjs) renders the real shell composition with unrelated surfaces stubbed and asserts both consumers receive the same context.

Hierarchy changes and workspace switches invalidate navigation state. Preserve expansion, ordering, recency, selected view and realtime reconciliation while separating actions from rendering.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/pages/navigation-realtime.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

[Command tests](../../../apps/web/test/features/sidebar/navigation-item-actions.test.mjs) capture the real hook through React server rendering with controlled query, mutation and navigation adapters. They exercise lock permissions, meeting/database metadata, favorites, duplicate ordering and failures, pending guards and deletion feedback. These tests do not establish mounted effect timing. [Duplication tests](../../../apps/web/test/features/sidebar/page-duplication.test.mjs) verify immutable copies and link ownership; existing navigation tests verify hierarchy and ordering.

[Sharing tests](../../../apps/web/test/features/sidebar/item-sharing.test.mjs) use real React server rendering with controlled data and mutations, including render-phase state seeding for selection. They cover page/database access payloads, agent selection, guest invitation requests, guest-specific revocation, publication permissions and pending guards. They do not claim mounted input/focus behavior. [Navigation item state](../../../apps/web/src/features/sidebar/model/navigation-item-state.ts) separately owns lock precedence, permission presentation and pending-control decisions.
