# Table interactions and rendering

## Ownership and interface

[DatabaseTableView](../../../apps/web/src/features/databases/views/table/components/database-table-view.tsx) composes existing database data/action/UI contexts with table-local interaction owners. It renders headers, grouped and ungrouped rows, virtualized content, drag controls and dialogs. The shell accepts optional in-table header content, while drag controls consume the measured layout and the existing row index. No second table-wide context or large renderer prop interface is introduced.

- [Column controller](../../../apps/web/src/features/databases/views/table/controller/use-table-columns.ts) owns widths, saved/pending/drag column ordering, header editing, insertion and formula setup. Intermediate state and the pending-order reconciliation effects remain local. It receives property data, persistence callbacks and the wrapper ref, then exposes values and commands used by the header renderer.
- [Selection controller](../../../apps/web/src/features/databases/views/table/controller/use-table-selection.ts) owns selected row IDs, shared property values, clipboard links and bulk property edits. It reads the current value ref when applying or replaying edits.
- [Row layout controller](../../../apps/web/src/features/databases/views/table/controller/use-table-row-layout.ts) owns measured row state, the live layout ref and resize-observer cleanup. Resize bursts and virtual-range changes are coalesced to one animation-frame measurement. Measured row IDs are the drag-control render list, so virtualized tables do not scan every loaded row to render controls for the mounted range. The view requests synchronous layout measurements when rendered rows, columns or drag indicators change. Inline scrolling changes the measurement origin without changing row IDs.
- [Table model](../../../apps/web/src/features/databases/views/table/model/database-table-model.ts) owns column-key/order rules and table interaction contracts. [Row measurement](../../../apps/web/src/features/databases/views/table/model/table-row-layout.ts) computes relative centers, heights and drop boundaries, including an empty table's footer.
- [Cell edit history](../../../apps/web/src/features/databases/interactions/cell-edit-history.ts) coordinates undo/redo for both bulk selection editing and drag-fill. [Existing fill rules](../../../apps/web/src/features/databases/interactions/database-cell-fill.ts) determine which changes are still safe to replay.

## Flow and invariants

Column drag state is provisional until drop. The pending order survives until persisted configuration catches up. Inserted properties are identified against the pre-insertion IDs and placed beside the original header; formula setup waits for the new formula property. Resize applies DOM widths during pointer movement and commits state on pointer release/cancellation, retaining existing minimum widths and cursor behavior.

Bulk editing and drag-fill skip equivalent serialized values, collect the changes actually written, and create one history action. Undo only restores cells still equal to this action's applied value. Redo only reapplies cells still equal to the restored value. Intervening edits survive both operations. Undo runs without recording nested history; redo retains its existing recording behavior. The feature's mutation layer still owns `draft` plus `isPending` state and host invalidation for server reconciliation.

Row dragging, grouped-row movement, sorted-row confirmation, nested-row rendering and the active cell-fill gesture remain coordinated by the table view. Their existing pure drop/reorder/group rules and mutation adapters remain the decision owners. This allows the view to coordinate visual drop indicators without exposing all its state through a new interface.

Collapsed nested rows are derived by propagating hidden state from collapsed parents through one child index. This keeps hierarchy visibility linear in rows plus relationships and avoids repeating an ancestor walk for every row.

The [virtualized table shell](../../../apps/web/src/features/databases/views/table/components/database-table-shell.tsx) owns scroll-driven range updates. Row-key callbacks and the view's row renderer remain stable while their rendering inputs are unchanged, so hover and drop-indicator updates do not rebuild retained cells and scrolling preserves the virtualizer's measurement cache. Memoized row boundaries reuse retained row content during scrolling; changed rows, indexes or row-render inputs refresh it. Active-cell lookup is indexed by page ID, and the active cell's row remains mounted outside the visible range. Column elements are retained until column IDs or widths change.

## Access, persistence and recovery

The controller consumes existing editability and structural-editing gates; server access checks remain authoritative. Column and property callbacks persist through database commands. Selection, hover, drop targets and measurement state are transient. Neither this refactor nor the measurement helpers change schema, URLs or serialized values. Resize observation is disconnected on unmount, and existing gesture listeners are removed by their cleanup paths.

## Tests

[Table layout tests](../../../apps/web/test/features/databases/table-row-layout.test.mjs) cover coordinate origins, measured-row identity, terminal/empty drop boundaries, layout equality, pending column insertion and 10,000-row nested visibility. [History tests](../../../apps/web/test/features/databases/cell-edit-history.test.mjs) cover actual undo/redo writes and intervening edits. Existing [database tests](../../../apps/web/test/features/databases) cover column ordering, selection values, drag targets, groups, nested rows and fill safety. Browser loading complements these checks but does not establish every pointer, touch or concurrent-edit scenario.

[Scroll rendering tests](../../../apps/web/test/features/databases/database-table-scroll-rendering.test.mjs) mount the real shell with simulated DOM dimensions and 10,000 rows. They check immediate viewport coverage during scroll jumps, retained-row reuse, bounded row-key work, parent updates, active-cell retention and reorder refresh. They do not measure browser paint time or network pagination.

See [views and properties](views-and-properties.md) and the [database overview](README.md).

Header rendering keeps separate name-column and property-column menus while sharing insertion positions and drag labels. Row rendering separates name cells from property cells; grouped sections retain their own creation footer. Drop handling resolves the target first, then distinguishes moving an existing row from inserting a dragged page. Sorted moves retain their confirmation step, and drag cleanup follows either operation. These render helpers stay local to the table; they do not introduce component identities or move controller state.

Table elements use the sum of their column widths for both width and minimum width, rather than stretching to the pane width. Opening or resizing a page side pane changes the horizontal scroll viewport without redistributing column widths; manual column resizing still updates that sum. This applies to body and sticky-header tables through the shared database table styles.

Inline-database table sizing also uses the column-width sum, independent of the expanding inline scroll canvas. Generic editor table width rules exclude `.database-table` so embedded and full-page databases share this sizing behavior.
