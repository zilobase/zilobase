import type { DatabaseTableGroupSection } from "../../interactions/database-table-group-sections"
import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import {
  canCreateRowInKanbanGroup,
  type DatabasePropertyListItem,
} from "../kanban/database-kanban-config"

export const TIMELINE_ROW_HEIGHT = 32
export const TIMELINE_GROUP_HEADER_HEIGHT = 40
export const TIMELINE_GROUP_GAP_HEIGHT = 20

export type TimelineGroupSection = DatabaseTableGroupSection<SortableDatabaseItem>

export type TimelineViewRow =
  | {
      item: SortableDatabaseItem
      kind: "item"
    }
  | {
      isFirst: boolean
      kind: "group-header"
      section: TimelineGroupSection
    }
  | {
      kind: "group-gap"
    }
  | {
      kind: "name-header"
      sectionId: string
    }
  | {
      kind: "new-page"
      section?: TimelineGroupSection
    }

type BuildTimelineViewRowsInput = {
  collapsedGroups: Record<string, boolean>
  editable: boolean
  groupProperty: DatabasePropertyListItem | null
  items: SortableDatabaseItem[]
  sections: TimelineGroupSection[]
}

export function buildTimelineViewRows({
  collapsedGroups,
  editable,
  groupProperty,
  items,
  sections,
}: BuildTimelineViewRowsInput): TimelineViewRow[] {
  if (!groupProperty) {
    return buildUngroupedRows(items, editable)
  }

  return sections.flatMap((section, index) =>
    buildGroupRows({
      collapsed: collapsedGroups[section.id] === true,
      editable,
      groupProperty,
      isFirst: index === 0,
      section,
    }),
  )
}

export function getTimelineContentRows(
  rows: TimelineViewRow[],
  grouped: boolean,
) {
  return grouped
    ? rows
    : rows.filter((row) => row.kind !== "name-header")
}

export function getTimelineViewRowHeight(row: TimelineViewRow) {
  switch (row.kind) {
    case "group-header":
      return TIMELINE_GROUP_HEADER_HEIGHT
    case "group-gap":
      return TIMELINE_GROUP_GAP_HEIGHT
    default:
      return TIMELINE_ROW_HEIGHT
  }
}

export function getTimelineViewRowKey(row: TimelineViewRow, index: number) {
  switch (row.kind) {
    case "item":
      return `item-${row.item.id}`
    case "group-header":
      return `group-${row.section.id}`
    case "group-gap":
      return `group-gap-${index}`
    case "name-header":
      return `name-header-${row.sectionId}`
    case "new-page":
      return `new-page-${row.section?.id ?? "ungrouped"}`
  }
}

export function getTimelineItems(rows: TimelineViewRow[]) {
  return rows.flatMap((row) => (row.kind === "item" ? [row.item] : []))
}

function buildUngroupedRows(
  items: SortableDatabaseItem[],
  editable: boolean,
): TimelineViewRow[] {
  const rows: TimelineViewRow[] = [
    { kind: "name-header", sectionId: "ungrouped" },
    ...items.map((item): TimelineViewRow => ({ item, kind: "item" })),
  ]

  if (editable) {
    rows.push({ kind: "new-page" })
  }

  return rows
}

function buildGroupRows({
  collapsed,
  editable,
  groupProperty,
  isFirst,
  section,
}: {
  collapsed: boolean
  editable: boolean
  groupProperty: DatabasePropertyListItem
  isFirst: boolean
  section: TimelineGroupSection
}): TimelineViewRow[] {
  const rows: TimelineViewRow[] = []

  if (!isFirst) {
    rows.push({ kind: "group-gap" })
  }

  rows.push({ isFirst, kind: "group-header", section })

  if (collapsed) {
    return rows
  }

  rows.push({ kind: "name-header", sectionId: section.id })
  rows.push(
    ...section.rows.map(
      (item): TimelineViewRow => ({ item, kind: "item" }),
    ),
  )

  if (
    editable &&
    !section.isEmpty &&
    canCreateRowInKanbanGroup(groupProperty)
  ) {
    rows.push({ kind: "new-page", section })
  }

  return rows
}
