import { memo, type CSSProperties } from "react"
import { ChevronDown, ChevronRight, Plus } from "@/components/icons"

import {
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/lib/color-tokens"

import { databaseNameColumnDefaultWidth } from "../../core/database-contracts"
import { DatabasePageLink } from "../../interactions/database-page-link"
import { getNameColumnWrapContent } from "../database-view-config"
import type { DatabasePropertyListItem } from "../kanban/database-kanban-config"
import { DatabaseCellContent } from "../database-cell-content"
import type { TimelineViewRow } from "./database-timeline-rows"

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

export type TimelineSidebarRowCellProps = {
  collapsedGroups: Record<string, boolean>
  databaseConfig?: unknown
  databaseId: string | null | undefined
  editable: boolean
  groupProperty: DatabasePropertyListItem | null
  isAddingDatabaseRow: boolean
  nameColumnLabel: string
  onAddPage: (
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null
  ) => void
  onOpenPage?: (pageId: string) => void
  onRowMouseEnter?: (rowId: string) => void
  onToggleGroup: (sectionId: string) => void
  showPageIcon: boolean
  viewRow: TimelineViewRow
}

export const TimelineSidebarRowCell = memo(function TimelineSidebarRowCell({
  collapsedGroups,
  databaseConfig,
  databaseId,
  editable,
  groupProperty,
  isAddingDatabaseRow,
  nameColumnLabel,
  onAddPage,
  onOpenPage,
  onRowMouseEnter,
  onToggleGroup,
  showPageIcon,
  viewRow,
}: TimelineSidebarRowCellProps) {
  const nameColumnWrapContent = getNameColumnWrapContent(databaseConfig)

  if (viewRow.kind === "group-gap") {
    return (
      <div
        aria-hidden
        className="database-timeline-sidebar-cell database-timeline-sidebar-gap"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      />
    )
  }

  if (viewRow.kind === "group-header") {
    const isCollapsed = collapsedGroups[viewRow.section.id] === true

    return (
      <div
        className="database-timeline-sidebar-cell"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      >
        <button
          aria-expanded={!isCollapsed}
          className="database-table-group-toggle database-timeline-group-toggle"
          onClick={() => onToggleGroup(viewRow.section.id)}
          type="button"
        >
          {isCollapsed ? (
            <ChevronRight className="size-4 shrink-0" />
          ) : (
            <ChevronDown className="size-4 shrink-0" />
          )}
          <span className={getColorTokenBadgeClassName(viewRow.section.color)}>
            <span
              aria-hidden="true"
              className={getColorTokenDotClassName(viewRow.section.color)}
            />
            {viewRow.section.name}
          </span>
          <span className="database-table-group-count">
            {viewRow.section.rows.length}
          </span>
        </button>
      </div>
    )
  }

  if (viewRow.kind === "name-header") {
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

  if (viewRow.kind === "new-page") {
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
            onClick={() =>
              onAddPage(viewRow.section?.groupValue, groupProperty)
            }
            type="button"
          >
            <Plus />
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
        data-timeline-row-id={viewRow.item.id}
        onMouseEnter={() => onRowMouseEnter?.(viewRow.item.id)}
      >
        <DatabaseCellContent wrapContent={nameColumnWrapContent}>
          <DatabasePageLink
            editable={editable}
            onOpen={onOpenPage}
            pageId={viewRow.item.pageId}
            pageSummary={viewRow.item.page}
            showPageIcon={showPageIcon}
          />
        </DatabaseCellContent>
      </div>
    </div>
  )
})
