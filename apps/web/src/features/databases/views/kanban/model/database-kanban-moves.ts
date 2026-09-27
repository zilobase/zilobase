import {
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
} from "../../../interactions/database-row-reorder";
import { getDatabaseGroupMoveValue } from "../../../interactions/database-group-values";
import {
  serializePropertyValue,
  type DatabasePropertyValue,
} from "../../../schema/property-values";
import {
  canMoveRowsAcrossKanbanGroups,
  type DatabasePropertyListItem,
} from "./database-kanban-config";

export type KanbanMoveRow = { id: string; pageId: string; page: { name?: string } };
export type KanbanMove = {
  rowId: string;
  pageId: string;
  afterRowId: string | null;
  beforeRowId: string | null;
  group?: { propertyId: string; value: DatabasePropertyValue; serializedValue: unknown };
  pageTitle?: string;
};

export type KanbanMoveDraft<Row extends KanbanMoveRow> = {
  id: number;
  move: KanbanMove;
  row: Row;
  committedVersion: number | null;
};

/** A reorder following a pending group change still intends that destination,
 * even when the earlier write fails before this one reaches the server. */
export function inheritKanbanMoveGroup<Row extends KanbanMoveRow>(
  move: KanbanMove,
  drafts: KanbanMoveDraft<Row>[],
): KanbanMove {
  const previous = [...drafts].reverse().find((draft) => draft.move.rowId === move.rowId)?.move;
  return previous
    ? {
        ...move,
        group: move.group ?? previous.group,
        pageTitle: move.pageTitle ?? previous.pageTitle,
      }
    : move;
}

/** Convert a visible-column drop into the shared neighbor-anchored command. */
export function getKanbanMove<Row extends KanbanMoveRow>(input: {
  rows: Row[];
  targetRows: Row[];
  rowId: string;
  targetIndex: number;
  sourceGroupValue: string;
  targetGroupValue: string;
  property: DatabasePropertyListItem;
  propertyValuesByKey: Record<string, DatabasePropertyValue>;
}): KanbanMove | null {
  const row = input.rows.find(({ id }) => id === input.rowId);
  if (!row) return null;
  const crossGroup = input.sourceGroupValue !== input.targetGroupValue;
  if (crossGroup && !canMoveRowsAcrossKanbanGroups(input.property)) return null;
  // A multi-select card may already occur in the destination column. Its
  // removal must adjust the insertion index exactly like a same-column move.
  const rowIds = input.targetRows.some(({ id }) => id === row.id)
    ? getFilteredReorderedRowIds(input.rows, input.targetRows, row.id, input.targetIndex)
    : getAnchoredReorderedRowIds(input.rows, row.id, input.targetRows, input.targetIndex);
  if (!rowIds && !crossGroup) return null;
  const order = rowIds ?? input.rows.map(({ id }) => id);
  const index = order.indexOf(row.id);
  const move: KanbanMove = {
    rowId: row.id,
    pageId: row.pageId,
    afterRowId: order[index - 1] ?? null,
    beforeRowId: order[index + 1] ?? null,
  };
  if (!crossGroup) return move;
  if (input.property.id === "name") return { ...move, pageTitle: input.targetGroupValue };
  const property = input.property.property;
  const value = getDatabaseGroupMoveValue({
    currentValue: input.propertyValuesByKey[`${row.pageId}:${property.id}`] ?? "",
    propertyType: property.type,
    sourceGroupValue: input.sourceGroupValue,
    targetGroupValue: input.targetGroupValue,
  });
  return {
    ...move,
    group: {
      propertyId: property.id,
      value,
      serializedValue: serializePropertyValue(property.type, value),
    },
  };
}

export function getPendingKanbanMoves<Row extends KanbanMoveRow>(
  drafts: KanbanMoveDraft<Row>[],
  windowVersion: number | null | undefined,
) {
  return drafts.filter(
    (draft) =>
      draft.committedVersion === null ||
      windowVersion == null ||
      windowVersion < draft.committedVersion,
  );
}

/** Reapply pending intentions to fresh rows, retaining unrelated edits and new rows. */
export function projectKanbanMoves<Row extends KanbanMoveRow>(
  rows: Row[],
  propertyValuesByKey: Record<string, DatabasePropertyValue>,
  drafts: KanbanMoveDraft<Row>[],
) {
  if (drafts.length === 0) return { rows, propertyValuesByKey };
  let nextRows = [...rows];
  const values = { ...propertyValuesByKey };
  for (const { move, row: originalRow } of drafts) {
    let row = nextRows.find(({ id }) => id === move.rowId) ?? originalRow;
    if (move.pageTitle !== undefined) row = { ...row, page: { ...row.page, name: move.pageTitle } };
    if (move.group) values[`${row.pageId}:${move.group.propertyId}`] = move.group.value;
    nextRows = nextRows.filter(({ id }) => id !== move.rowId);
    const before = nextRows.findIndex(({ id }) => id === move.beforeRowId);
    const after = nextRows.findIndex(({ id }) => id === move.afterRowId);
    const index =
      before >= 0
        ? before
        : after >= 0
          ? after + 1
          : move.afterRowId === null
            ? 0
            : nextRows.length;
    nextRows.splice(index, 0, row);
  }
  return { rows: nextRows, propertyValuesByKey: values };
}
