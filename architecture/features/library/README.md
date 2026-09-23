# Library

## Owning modules and interface

- [apps/web/src/features/library](../../../apps/web/src/features/library)

## Main flow

The [library screen](../../../apps/web/src/features/library/screens/recents.tsx) composes active and deleted navigation queries, active view settings, creation commands and page/database side panes. Trash is a normal Library tab at `/recents?view=trash`; the old `/trash` path only redirects bookmarked links to that canonical view. Selecting Trash swaps the navigation query to deleted items while retaining the Library heading, shared hierarchy table and tab strip. The [library model](../../../apps/web/src/features/library/model/library-model.ts) converts authorized page/database/meeting/agent/teamspace results into library rows and a synthetic database payload. It owns source summaries, hierarchy placement and view filtering. A hidden synthetic Parent item relation carries placement parent IDs into the [shared database sub-item model](../../../apps/web/src/features/databases/views/model/database-sub-items.ts). Each tab selects its own root items and includes their descendants; rows whose parent is outside that tab appear as roots. Skills and Instructions select page-backed items with the existing `metadata.zilobaseai` marker before adding descendants. The shared Library view IDs also support route validation, remembered selection and sidebar shortcuts. These values do not create a second persisted content store.

The Teamspaces tab uses the same [database table](../../../apps/web/src/features/databases/views/table/components/database-table-view.tsx) and expand/collapse controls as other Library tabs. Synthetic teamspace rows act as parents, including for empty teamspaces; their names open teamspace settings while their chevrons reveal member content. The shared teamspace [creation dialog](../../../apps/web/src/features/teamspaces/creation/index.ts) owns its draft and teamspace mutation feedback. Pure models use the sidebar's [model entrypoint](../../../apps/web/src/features/sidebar/model/index.ts) for view labels and the shared database appearance entrypoint for stored icons; React icons are attached by the screen.

## Authorization and persistence

Content access and persistence belong to the underlying page/database queries. Library presentation consumes their authorized results; it does not grant access.

## Side effects, failures and recovery

Opening a library database selects its side pane; pages follow the existing embedded-page policy, while agents and meetings use their own routes. These commands remain distinct from ordinary sidebar copy/open links. The synthetic database view disables realtime tickets and uses local configuration state. Failures follow the underlying query, mutation and routing behavior.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/library) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

[Library model tests](../../../apps/web/test/features/library/library-model.test.mjs) verify active/deleted content, meeting isolation, view filters, teamspace hierarchy and synthetic payload properties. Existing recent-navigation and hierarchy tests cover their pure interfaces. UI assertions retain structural wiring checks; mounted browser interaction has not been established by these tests.

Page and database rows share audit/date normalization and hierarchy placement helpers. Database rows retain their backing page fallback for creator, deletion, teamspace and source information; meeting and agent row rules remain distinct.
