import {
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
} from "../../interactions/database-row-reorder";
import { getDatabaseGroupMoveValue } from "../../interactions/database-group-values";
import { serializePropertyValue, type DatabasePropertyValue } from "../../schema/property-values";
import { canMoveRowsAcrossGroups, type DatabasePropertyListItem } from "./database-group-config";

export type RecordDropRow = { id: string; pageId: string; page: { name?: string } };
export type RecordDrop = {
  rowId: string;
  pageId: string;
  afterRowId: string | null;
  beforeRowId: string | null;
  group?: { propertyId: string; value: DatabasePropertyValue; serializedValue: unknown };
  pageTitle?: string;
};

/** Convert a visible-column drop into the shared neighbor-anchored command. */
export function getGroupedRecordMove<Row extends RecordDropRow>(input: {
  rows: Row[];
  targetRows: Row[];
  rowId: string;
  targetIndex: number;
  sourceGroupValue: string;
  targetGroupValue: string;
  property: DatabasePropertyListItem;
  propertyValuesByKey: Record<string, DatabasePropertyValue>;
}): RecordDrop | null {
  const row = input.rows.find(({ id }) => id === input.rowId);
  if (!row) return null;
  const crossGroup = input.sourceGroupValue !== input.targetGroupValue;
  if (crossGroup && !canMoveRowsAcrossGroups(input.property)) return null;
  // A multi-select card may already occur in the destination column. Its
  // removal must adjust the insertion index exactly like a same-column move.
  const rowIds = input.targetRows.some(({ id }) => id === row.id)
    ? getFilteredReorderedRowIds(input.rows, input.targetRows, row.id, input.targetIndex)
    : getAnchoredReorderedRowIds(input.rows, row.id, input.targetRows, input.targetIndex);
  if (!rowIds && !crossGroup) return null;
  const order = rowIds ?? input.rows.map(({ id }) => id);
  const index = order.indexOf(row.id);
  const move: RecordDrop = {
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
