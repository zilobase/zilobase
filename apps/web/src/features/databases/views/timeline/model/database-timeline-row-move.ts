import { getGroupedRecordMove, type RecordDrop } from "../../model/database-record-drop";
import type { SortableDatabaseItem } from "../../../interactions/database-item-utils";
import {
  getFilteredReorderedRowIds,
  getReorderedRowIds,
} from "../../../interactions/database-row-drag";
import { type DatabasePropertyListItem } from "../../model/database-group-config";
import type { TimelineGroupSection } from "./database-timeline-rows";

export type TimelineRowMoveInput = {
  draggedRowId: string | null;
  dropTargetIndex: number | null;
  groupProperty: DatabasePropertyListItem | null;
  groupSectionByRowId: Map<string, TimelineGroupSection>;
  groupedSections: TimelineGroupSection[];
  isFiltered: boolean;
  isGrouped: boolean;
  isSorted: boolean;
  items: SortableDatabaseItem[];
  propertyValuesByKey: Record<string, string | string[]>;
  rowsById: Map<string, SortableDatabaseItem>;
  sortedItems: SortableDatabaseItem[];
  visibleRows: SortableDatabaseItem[];
};

export function getTimelineRowMove({
  draggedRowId,
  dropTargetIndex,
  groupProperty,
  groupSectionByRowId,
  groupedSections,
  isFiltered,
  isGrouped,
  isSorted,
  items,
  propertyValuesByKey,
  rowsById,
  sortedItems,
  visibleRows,
}: TimelineRowMoveInput): RecordDrop | null {
  if (draggedRowId === null || dropTargetIndex === null) return null;

  if (!isGrouped) {
    const rowIds = isFiltered
      ? getFilteredReorderedRowIds(items, sortedItems, draggedRowId, dropTargetIndex)
      : getReorderedRowIds(isSorted ? sortedItems : items, draggedRowId, dropTargetIndex);

    const row = rowsById.get(draggedRowId);
    if (!rowIds || !row) return null;
    const index = rowIds.indexOf(draggedRowId);
    return {
      rowId: draggedRowId,
      pageId: row.pageId,
      afterRowId: rowIds[index - 1] ?? null,
      beforeRowId: rowIds[index + 1] ?? null,
    };
  }

  const sourceSection = groupSectionByRowId.get(draggedRowId);
  const targetRow = visibleRows[Math.min(dropTargetIndex, visibleRows.length - 1)];
  const targetSection = targetRow ? groupSectionByRowId.get(targetRow.id) : groupedSections.at(-1);

  if (!sourceSection || !targetSection) return null;

  const localTargetIndex = getLocalTargetIndex(
    visibleRows,
    dropTargetIndex,
    targetSection.id,
    groupSectionByRowId,
  );

  if (!groupProperty) return null;
  return getGroupedRecordMove({
    rows: items,
    targetRows: targetSection.rows,
    rowId: draggedRowId,
    targetIndex: localTargetIndex,
    property: groupProperty,
    propertyValuesByKey,
    sourceGroupValue: sourceSection.groupValue,
    targetGroupValue: targetSection.groupValue,
  });
}

export function indexTimelineGroupSections(sections: TimelineGroupSection[]) {
  const sectionByRowId = new Map<string, TimelineGroupSection>();

  for (const section of sections) {
    for (const row of section.rows) {
      sectionByRowId.set(row.id, section);
    }
  }

  return sectionByRowId;
}

function getLocalTargetIndex(
  visibleRows: SortableDatabaseItem[],
  dropTargetIndex: number,
  targetSectionId: string,
  groupSectionByRowId: Map<string, TimelineGroupSection>,
) {
  let localTargetIndex = 0;

  for (let index = 0; index < dropTargetIndex; index += 1) {
    const row = visibleRows[index];
    if (row && groupSectionByRowId.get(row.id)?.id === targetSectionId) {
      localTargetIndex += 1;
    }
  }

  return localTargetIndex;
}
