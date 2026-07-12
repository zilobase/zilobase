import { type CSSProperties } from "react"
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react"

import {
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/lib/color-tokens"

import { databaseNameColumnDefaultWidth } from "../../core/database-contracts"
import { canCreateRowInKanbanGroup } from "../kanban/database-kanban-config"
import { DatabasePageLink } from "../../interactions/database-page-link"
import { getNameColumnWrapContent } from "../database-view-config"
import {
  getDatabaseTableGroupSections,
  type DatabaseTableGroupSection,
} from "../../interactions/database-table-group-sections"
import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import { DatabaseTableCellContent } from "../table/database-table-cell-content"

export type TimelineSidebarEntry =
  | {
      row: SortableDatabaseItem
      type: "row"
    }
  | {
      isFirst?: boolean
      section: DatabaseTableGroupSection<SortableDatabaseItem>
      type: "group"
    }
  | {
      type: "group-gap"
    }
  | {
      sectionId: string
      type: "name-header"
    }
  | {
      section?: DatabaseTableGroupSection<SortableDatabaseItem>
      type: "new-page"
    }

export function getTimelineSidebarEntries({
  collapsedGroups,
  editable,
  groupProperty,
  isGrouped,
  personOptionsById,
  propertyValuesByKey,
  rows,
}: {
  collapsedGroups: Record<string, boolean>
  editable: boolean
  groupProperty: Parameters<typeof getDatabaseTableGroupSections>[0]["groupProperty"]
  isGrouped: boolean
  personOptionsById: Map<string, string>
  propertyValuesByKey: Record<string, string | string[]>
  rows: SortableDatabaseItem[]
}) {
  if (!isGrouped || !groupProperty) {
    const entries: TimelineSidebarEntry[] = [
      { sectionId: "ungrouped", type: "name-header" },
      ...rows.map(
        (row): TimelineSidebarEntry => ({
          row,
          type: "row",
        })
      ),
    ]

    if (editable) {
      entries.push({ type: "new-page" })
    }

    return entries
  }

  const sections = getDatabaseTableGroupSections({
    groupProperty,
    personOptionsById,
    propertyValuesByKey,
    rows,
  })

  return sections.flatMap((section, index): TimelineSidebarEntry[] => {
    const entries: TimelineSidebarEntry[] = []

    if (index > 0) {
      entries.push({ type: "group-gap" })
    }

    entries.push({
      isFirst: index === 0,
      section,
      type: "group",
    })

    if (collapsedGroups[section.id] !== true) {
      entries.push({ sectionId: section.id, type: "name-header" })
      entries.push(
        ...section.rows.map(
          (row): TimelineSidebarEntry => ({
            row,
            type: "row",
          })
        )
      )

      if (
        editable &&
        !section.isEmpty &&
        canCreateRowInKanbanGroup(groupProperty)
      ) {
        entries.push({
          section,
          type: "new-page",
        })
      }
    }

    return entries
  })
}

export function getTimelineEntryHeight(entry: TimelineSidebarEntry) {
  switch (entry.type) {
    case "group":
      return 40
    case "group-gap":
      return 20
    case "name-header":
    case "new-page":
    case "row":
      return 32
    default:
      return 32
  }
}

export function getTimelineEntryKey(entry: TimelineSidebarEntry, index: number) {
  switch (entry.type) {
    case "row":
      return `row-${entry.row.id}`
    case "group":
      return `group-${entry.section.id}`
    case "group-gap":
      return `group-gap-${index}`
    case "name-header":
      return `name-header-${entry.sectionId}`
    case "new-page":
      return `new-page-${entry.section?.id ?? "ungrouped"}`
    default:
      return `entry-${index}`
  }
}

export function getTimelineBodyEntries(
  entries: TimelineSidebarEntry[],
  isGrouped: boolean
) {
  return entries.filter(
    (entry) => !(entry.type === "name-header" && !isGrouped)
  )
}

const timelineTableMinWidth = databaseNameColumnDefaultWidth

export const timelineTableStyle = {
  "--database-table-min-width": `${timelineTableMinWidth}px`,
} as CSSProperties

export function TimelineNameHeaderRow({
  label,
  sticky = false,
}: {
  label: string
  sticky?: boolean
}) {
  return (
    <div
      className={
        sticky
          ? "database-timeline-sidebar-name-header database-timeline-sidebar-thead"
          : "database-timeline-sidebar-name-header h-full w-full"
      }
    >
      <span className="database-name-header-content">
        <span>Aa</span>
        <span>{label}</span>
      </span>
    </div>
  )
}

type TimelineSidebarEntryCellProps = {
  collapsedGroups: Record<string, boolean>
  databaseConfig?: unknown
  databaseId: string | null | undefined
  editable: boolean
  entry: TimelineSidebarEntry
  groupProperty: Parameters<typeof getDatabaseTableGroupSections>[0]["groupProperty"]
  isAddingDatabaseRow: boolean
  nameColumnLabel: string
  onAddPage: (
    groupValue?: string,
    groupProperty?: Parameters<
      typeof getDatabaseTableGroupSections
    >[0]["groupProperty"]
  ) => void
  onOpenPage?: (pageId: string) => void
  onRowMouseEnter?: (rowId: string) => void
  onToggleGroup: (sectionId: string) => void
  showPageIcon: boolean
}

export function TimelineSidebarEntryCell({
  collapsedGroups,
  databaseConfig,
  databaseId,
  editable,
  entry,
  groupProperty,
  isAddingDatabaseRow,
  nameColumnLabel,
  onAddPage,
  onOpenPage,
  onRowMouseEnter,
  onToggleGroup,
  showPageIcon,
}: TimelineSidebarEntryCellProps) {
  const nameColumnWrapContent = getNameColumnWrapContent(databaseConfig)

  if (entry.type === "group-gap") {
    return (
      <div
        aria-hidden
        className="database-timeline-sidebar-cell database-timeline-sidebar-gap"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      />
    )
  }

  if (entry.type === "group") {
    const isCollapsed = collapsedGroups[entry.section.id] === true

    return (
      <div
        className="database-timeline-sidebar-cell"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      >
        <button
          aria-expanded={!isCollapsed}
          className="database-table-group-toggle database-timeline-group-toggle"
          onClick={() => onToggleGroup(entry.section.id)}
          type="button"
        >
          {isCollapsed ? (
            <ChevronRight className="size-4 shrink-0" />
          ) : (
            <ChevronDown className="size-4 shrink-0" />
          )}
          <span className={getColorTokenBadgeClassName(entry.section.color)}>
            <span
              aria-hidden="true"
              className={getColorTokenDotClassName(entry.section.color)}
            />
            {entry.section.name}
          </span>
          <span className="database-table-group-count">
            {entry.section.rows.length}
          </span>
        </button>
      </div>
    )
  }

  if (entry.type === "name-header") {
    return (
      <div
        className="database-timeline-sidebar-cell"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      >
        <TimelineNameHeaderRow label={nameColumnLabel} />
      </div>
    )
  }

  if (entry.type === "new-page") {
    return (
      <div
        className="database-timeline-sidebar-cell"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      >
        <div className="database-page-create-row">
          <button
            className="database-page-create database-page-create-full"
            disabled={!databaseId || isAddingDatabaseRow}
            onClick={() => onAddPage(entry.section?.groupValue, groupProperty)}
            type="button"
          >
            {isAddingDatabaseRow ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            <span>New page</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="database-timeline-sidebar-cell"
      data-roadmap-ui="gantt-sidebar"
      style={timelineTableStyle}
    >
      <div
        className="database-timeline-sidebar-row"
        data-timeline-row-id={entry.row.id}
        onMouseEnter={() => onRowMouseEnter?.(entry.row.id)}
      >
        <DatabaseTableCellContent wrapContent={nameColumnWrapContent}>
          <DatabasePageLink
            editable={editable}
            onOpen={onOpenPage}
            pageId={entry.row.pageId}
            pageSummary={entry.row.page}
            showPageIcon={showPageIcon}
          />
        </DatabaseTableCellContent>
      </div>
    </div>
  )
}
