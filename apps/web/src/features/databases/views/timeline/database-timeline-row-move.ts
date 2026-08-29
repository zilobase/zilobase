import { serializePropertyValue } from "../../core/utils"
import { getDatabaseGroupMoveValue } from "../../interactions/database-group-values"
import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import {
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
  getReorderedRowIds,
} from "../../interactions/database-row-drag"
import {
  canUpdateKanbanGroupProperty,
  type DatabasePropertyListItem,
} from "../kanban/database-kanban-config"
import type { TimelineGroupSection } from "./database-timeline-rows"

export type TimelineRowMove = {
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
}

export type TimelineRowMoveInput = {
  draggedRowId: string | null
  dropTargetIndex: number | null
  groupProperty: DatabasePropertyListItem | null
  groupSectionByRowId: Map<string, TimelineGroupSection>
  groupedSections: TimelineGroupSection[]
  isFiltered: boolean
  isGrouped: boolean
  isSorted: boolean
  items: SortableDatabaseItem[]
  propertyValuesByKey: Record<string, string | string[]>
  rowsById: Map<string, SortableDatabaseItem>
  sortedItems: SortableDatabaseItem[]
  visibleRows: SortableDatabaseItem[]
}

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
}: TimelineRowMoveInput): TimelineRowMove | null {
  if (draggedRowId === null || dropTargetIndex === null) return null

  if (!isGrouped) {
    const rowIds = isFiltered
      ? getFilteredReorderedRowIds(
          items,
          sortedItems,
          draggedRowId,
          dropTargetIndex,
        )
      : getReorderedRowIds(
          isSorted ? sortedItems : items,
          draggedRowId,
          dropTargetIndex,
        )

    return rowIds ? { rowId: draggedRowId, rowIds } : null
  }

  const sourceSection = groupSectionByRowId.get(draggedRowId)
  const targetRow = visibleRows[Math.min(dropTargetIndex, visibleRows.length - 1)]
  const targetSection = targetRow
    ? groupSectionByRowId.get(targetRow.id)
    : groupedSections.at(-1)

  if (!sourceSection || !targetSection) return null

  const localTargetIndex = getLocalTargetIndex(
    visibleRows,
    dropTargetIndex,
    targetSection.id,
    groupSectionByRowId,
  )

  if (sourceSection.id === targetSection.id) {
    const rowIds = getFilteredReorderedRowIds(
      items,
      targetSection.rows,
      draggedRowId,
      localTargetIndex,
    )
    return rowIds ? { rowId: draggedRowId, rowIds } : null
  }

  if (!groupProperty || !canUpdateKanbanGroupProperty(groupProperty)) {
    return null
  }

  const draggedRow = rowsById.get(draggedRowId)
  if (!draggedRow) return null

  const rowIds =
    getAnchoredReorderedRowIds(
      items,
      draggedRowId,
      targetSection.rows,
      localTargetIndex,
    ) ?? items.map((row) => row.id)
  const currentValue =
    propertyValuesByKey[
      `${draggedRow.pageId}:${groupProperty.property.id}`
    ] ?? ""
  const nextValue = getDatabaseGroupMoveValue({
    currentValue,
    propertyType: groupProperty.property.type,
    sourceGroupValue: sourceSection.groupValue,
    targetGroupValue: targetSection.groupValue,
  })

  return {
    groupPropertyId: groupProperty.property.id,
    groupValue: serializePropertyValue(
      groupProperty.property.type,
      nextValue,
    ),
    rowId: draggedRowId,
    rowIds,
  }
}

export function indexTimelineGroupSections(sections: TimelineGroupSection[]) {
  const sectionByRowId = new Map<string, TimelineGroupSection>()

  for (const section of sections) {
    for (const row of section.rows) {
      sectionByRowId.set(row.id, section)
    }
  }

  return sectionByRowId
}

function getLocalTargetIndex(
  visibleRows: SortableDatabaseItem[],
  dropTargetIndex: number,
  targetSectionId: string,
  groupSectionByRowId: Map<string, TimelineGroupSection>,
) {
  let localTargetIndex = 0

  for (let index = 0; index < dropTargetIndex; index += 1) {
    const row = visibleRows[index]
    if (row && groupSectionByRowId.get(row.id)?.id === targetSectionId) {
      localTargetIndex += 1
    }
  }

  return localTargetIndex
}
