# Database views and properties

## Ownership and interfaces

[View models](../../../apps/web/src/features/databases/views/model) derive properties, filters, sorting and visibility from a payload and active view. [React state](../../../apps/web/src/features/databases/views/state) owns the view context and active-cell store. [Controllers](../../../apps/web/src/features/databases/views/controller) compose query results, model derivation and commands. [Common components](../../../apps/web/src/features/databases/views/components) compose the database surface and toolbar; each named view keeps its own model, interaction controller and components.

[Filter/sort contracts](../../../apps/web/src/features/databases/views/model/filter-sort-contracts.ts) define active conditions and update patches without importing component implementations. [Menu option contracts](../../../apps/web/src/features/databases/views/menu-option-contracts.ts) define UI labels, colors and optional React icons. [View settings contracts](../../../apps/web/src/features/databases/views/view-settings/view-settings-contracts.ts) describe settings controls. Model and command imports no longer point at filter, sort or condition component implementations. The pure aggregate model produces field-icon descriptors. [Presentation derivation](../../../apps/web/src/features/databases/views/components/database-view-model.tsx) renders those descriptors into React icons and preserves the existing feature interface, including shared option identity across filter/sort menus.

[Editor embedding](../../../apps/web/src/features/databases/core/database-block.tsx) owns database-block node behavior, setup content and editor runtime options. [Drag contracts](../../../apps/web/src/features/databases/interactions/database-drag-contracts.ts) own the serialized database-page MIME identifier. [Column dimensions](../../../apps/web/src/features/databases/views/model/column-dimensions.ts) own shared width defaults. The [feature entrypoint](../../../apps/web/src/features/databases/index.ts) preserves its exported names while selecting these concrete owners.

[Property implementations](../../../apps/web/src/features/databases/schema) own editing, configuration, relations, formulas and rollups. `property-catalog.ts` owns browser presentation metadata; [property defaults](../../../apps/web/src/features/databases/schema/model/property-defaults.ts) own pure status/default-configuration and classification rules; `property-values.ts` owns browser value conversion. [Shared database rules](../../../packages/features/src/databases) remain the owner of reusable contracts, canonical types, formula/filter logic and queries. Moving the browser catalog does not move shared domain rules into presentation.

Page and database selection UI is centralized in the [page/database picker](../../../apps/web/src/features/databases/components/page-database-picker.tsx). Relation values, relation configuration, data-source linking and replacement, database setup, and sidebar shortcuts supply typed options to that component rather than implementing their own search lists. Its [search model](../../../apps/web/src/features/databases/components/page-database-picker-model.ts) normalizes case and diacritics, ranks prefix and word-prefix matches before substring matches, and preserves source order for equal matches. Remote page search remains debounced by its owning consumer; the picker owns deferred local filtering, keyboard navigation, selection markers, bounded scrolling, and loading/empty presentation.

## Flow, access and persistence

The view controller selects a data source and view, derives visible rows/properties and supplies commands to presentation through the view context. Named view components preserve their distinct table, Kanban, timeline, chart, list, gallery and form behavior. Screens compose page metadata and the database surface.

The [sub-item view model](../../../apps/web/src/features/databases/views/model/database-sub-items.ts) derives nesting from each row's single Parent item relation when configured, including the relation saved during child creation. It reads the inverse Sub-item relation only when no parent relation is configured. This keeps a new child nested before the follow-up inverse relation update and keeps an explicitly cleared parent authoritative. The table disables child creation until both relation properties are configured; [view commands](../../../apps/web/src/features/databases/records/view-commands.ts) also reject a child creation attempt during setup so it cannot become a root row.

The current [view update command](../../../apps/server/src/features/databases/commands/structural/views.ts) calls [sub-item relation setup](../../../apps/server/src/features/databases/commands/structural/sub-items.ts) in the command transaction. Setup creates or reuses the source's Parent item and Sub-item relation properties, reconciles their existing values, saves the generated property IDs in the view config, and publishes property and record changes to linked hosts. The client can create children after that view update is reflected in its bootstrap data.

Server [property operations](../../../apps/server/src/features/databases/schema), [row operations](../../../apps/server/src/features/databases/records), and [data sources](../../../apps/server/src/features/databases/data-sources) enforce persistence and access. UI visibility does not grant editability. A cell edit stays local `draft` state with an `isPending` indicator until POST plus refetch succeeds; failed writes keep the draft visible and surface through the save indicator as described in the [database overview](README.md).

## Tests and recovery

Keep serialized values, query keys, mutation origin and view defaults stable. [Database web tests](../../../apps/web/test/features/databases) exercise filtering/sorting, property values, model derivation, selection, column widths and named views. They follow the concrete owners above. Shared mutation tests cover serial ordering and move-conflict invalidation, while server tests cover authoritative operations. Some UI assertions still inspect source and require behavioral coverage before substantive refactoring. Run web tests, typecheck, build, and architecture checks for responsibility moves; preserve schema and migration history.

Automations reuse the concrete condition editor, menu-option contract, property catalog and shared property controls through documented database paths. These consumers do not import the aggregate database screen. Reassess shared ownership only if the behaviors actually diverge.

## Configuration and command boundary

[View-type transitions](../../../apps/web/src/features/databases/views/model/view-type-transition.ts) calculate grouping and hidden-property changes without mutation or UI state. Converting a board to a table removes the grouping field and restores its visibility; explicit visibility selections and unrelated config survive. Timeline conversion still resolves or creates the required date property asynchronously before saving.

[View commands](../../../apps/web/src/features/databases/records/view-commands.ts) retain the existing command interface, mutation ordering, pending/editability guards and latest-config cache callbacks. The controller supplies notification and clipboard effects; commands no longer import toast presentation or read browser globals. The date resolver owns asynchronous property discovery/creation and reports failure through the supplied feedback. Filter/sort/configuration updates retain their existing timing and distinct `mutate`/`mutateAsync` semantics.

The [command tests](../../../apps/web/test/features/databases/database-view-commands.test.mjs) cover 32 existing row, filter, visibility, property, form, timeline and view-type scenarios. [Boundary tests](../../../apps/web/test/features/databases/database-command-boundary.test.mjs) additionally verify pure-model dependency reachability, presentation shape, clipboard feedback and date-creation failure. React view state and toolbar orchestration remain in their documented owners; interaction refactoring must keep these behavioral tests intact.

## Toolbar and view settings

The [toolbar](../../../apps/web/src/features/databases/views/components/database-view-toolbar.tsx) owns database title controls, tab navigation, overflow measurement, active-view selection and shared dialog visibility. [Tab appearance](../../../apps/web/src/features/databases/views/components/database-view-tab-appearance.tsx) owns icon/name editing. Its picker identity remains controlled by the toolbar; renaming still selects the view before the deferred save. The existing view-type catalog supplies icons, while the display menu retains its established ordering and Board label.

[Toolbar actions](../../../apps/web/src/features/databases/views/components/database-toolbar-actions.tsx) compose context-connected filter, sort, settings and row/form controls. The settings open state stays with navigation so a tab's “Edit view” action opens the same settings menu. Automation capability lookup remains mounted with the toolbar, uses the development gate and server capability, and scopes the manager to both database and data source. Read-only presentation still hides mutation controls. These controls grant no server permissions.

[Settings control](../../../apps/web/src/features/databases/views/components/database-settings-control.tsx) binds existing view-setting operations and source selection to the settings menu. Wrap-all retains its sequence: clear the layout override, await the name-column update, then await each property update in order. Filter/sort creation, updates and removal continue through the existing commands. Form preview/share remains distinct from normal row creation; table, board, timeline, chart, gallery and list settings retain their existing capability-specific controls.

[Source projection](../../../apps/web/src/features/databases/views/model/toolbar-source.ts) centralizes host/source identity, display titles and fallback sources without browser state or persistence. [Overflow calculation](../../../apps/web/src/features/databases/views/model/toolbar-view-overflow.ts) reserves control widths and keeps the active view visible. Their [source tests](../../../apps/web/test/features/databases/toolbar-source.test.mjs) and [overflow tests](../../../apps/web/test/features/databases/toolbar-view-overflow.test.mjs) cover linked-source identity, empty identifiers, active-view fallback, width reservation and active-tab pinning. UI source checks continue to protect structural integration; they do not substitute for interactive browser verification.

## Kanban board and moves

The [board model](../../../apps/web/src/features/databases/views/kanban/model/database-kanban-board.ts)
derives stable options and indexes column membership in one pass. The
[view](../../../apps/web/src/features/databases/views/kanban/components/database-kanban-view.tsx)
composes group creation/settings, property editors and the
[column component](../../../apps/web/src/features/databases/views/kanban/components/database-kanban-column.tsx).
Interaction state is scoped to host, source, view and grouping property.

The [drag controller](../../../apps/web/src/features/databases/views/kanban/controller/use-database-kanban-card-drag.ts)
owns native page payloads, cancellation and drop targets.
It captures the active card synchronously so dropping before the first animation
frame works. The [geometry hook](../../../apps/web/src/features/databases/views/kanban/controller/use-kanban-geometry.ts)
registers elements, observes resizes and batches layout reads. Dirty target
geometry is refreshed at hit testing, including rapid consecutive drops.
The [preview model](../../../apps/web/src/features/databases/views/kanban/model/database-kanban-card-drag.ts)
uses untransformed card positions for offsets and placeholders, so animated
cards cannot shift their own drop thresholds.

The [move model](../../../apps/web/src/features/databases/views/kanban/model/database-kanban-moves.ts)
converts drops into neighbor anchors and grouping values, including multi-select
cards already in the destination. Its move controller submits one atomic
record change to the [shared interaction hooks](../../../packages/features/src/databases/interactions/react.ts).
It owns no post-drop draft, queue, or reconciliation clock. Table, list, gallery,
Kanban and timeline read projected records from the common view controller.

The [session store](../../../packages/features/src/databases/interactions/store.ts)
serializes conflicting source writes, retains unconfirmed intentions for receipt
retry, and removes only rejected intentions. It reconciles each mounted window
against committed source versions, including placeholders and linked hosts;
stale inactive cache windows are evicted before an intention is retired.
Projection precedes filtering, sorting, grouping and hierarchy. QueryClient
contains only server snapshots, never speculative rows or versions.

The [manual placement provider](../../../apps/web/src/features/databases/views/state/manual-record-placement.tsx)
owns one clear-sort policy and [confirmation dialog](../../../apps/web/src/features/databases/views/components/database-manual-placement-dialog.tsx)
for all renderers, including external drops. Cancellation or failed sort clearing
never submits a row write; a view change cancels the pending action. List supports
sorted drag through this confirmation instead of disabling reordering. Gallery
uses the grouped-drop intention model for writable group changes, preserving
the source section for multi-select cards. Timeline dates and resizes continue
through undoable cell actions and the shared record queue; date-only edits do
not request manual-order confirmation.

[Lifecycle tests](../../../apps/web/test/features/databases/database-kanban-move-lifecycle.test.mjs)
mount the actual drag and mutation hooks with controlled responses, covering slow
saves, stale refreshes, fast drops before the first frame, rapid moves, isolated
rollback and failed sort clearing.

The [Kanban edge-scroll hook](../../../apps/web/src/features/databases/views/kanban/controller/use-kanban-edge-scroll.ts) scrolls the board horizontally while a database page is held near its visible left or right edge. A frame loop keeps scrolling with a stationary pointer and accelerates toward the edge. It supports internal cards and external database-page drags, clamps to scroll limits, and stops on drop, cancellation, leaving the board or window, blur, and unmount.

Dropping on the new-group column retains the dragged page in the Kanban controller and opens the existing group editor. Committing creates the option first, then moves the retained row through the existing grouped-row command (or adds an external page); entering an existing name uses that group. Enter with a blank name creates a uniquely named “Untitled” group (then “Untitled 2”, “Untitled 3”, and so on); numeric and date grouping still require a valid value. Dismissal cancels the retained drop, and changing the database or grouping property invalidates it. The [property input](../../../apps/web/src/features/databases/schema/editors/database-property-input.tsx) accepts an optional cancellation callback so this editor commits on Enter while other property inputs retain their existing dismissal behavior.

## Kanban group actions

The [group actions](../../../apps/web/src/features/databases/views/kanban/components/database-kanban-group-actions.tsx) provide a per-column menu and add-page shortcut. Edit groups selects the grouping property and restores hidden columns; the board retains an Edit groups entry when columns are hidden. [Group settings](../../../apps/web/src/features/databases/views/kanban/model/database-kanban-group-settings.ts) persist hidden column and count IDs in the view config under `kanbanGroups`, scoped by grouping property ID, through the shared view mutation. Other view settings are preserved.

Group trash requires confirmation and selects distinct page IDs from all loaded source rows, including rows excluded by view filters. It uses the existing recoverable page deletion mutation, retaining server authorization, Trash recovery and cache invalidation. It leaves the option itself in place, reports partial failures for retry, prevents repeat submission while running and disables the action if more rows remain to be loaded. Changing view or grouping invalidates an outstanding confirmation.
