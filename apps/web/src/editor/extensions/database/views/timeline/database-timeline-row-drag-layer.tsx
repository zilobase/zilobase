import { FileText, GripVertical } from "lucide-react"

import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import type { TimelineRowLayout } from "./database-timeline-layout"
import type { TimelineRowDragController } from "./database-timeline-row-drag"

export function TimelineRowDragLayer({
  controller,
  editable,
  layout,
  sidebarCollapsed,
}: {
  controller: TimelineRowDragController
  editable: boolean
  layout: TimelineRowLayout
  sidebarCollapsed: boolean
}) {
  return (
    <>
      {controller.overlay ? (
        <div
          aria-hidden="true"
          className="database-row-drag-overlay"
          ref={controller.overlayRef}
          style={{
            height: controller.overlay.height,
            left: controller.overlay.left,
            top: controller.overlay.top,
            width: controller.overlay.width,
          }}
        >
          <span className="database-row-drag-overlay-cell">
            <FileText />
            <span>{controller.overlay.title}</span>
          </span>
        </div>
      ) : null}

      {editable && !sidebarCollapsed ? (
        <TimelineRowDragRail controller={controller} layout={layout} />
      ) : null}

      {controller.dropLineTop !== null ? (
        <div
          aria-hidden="true"
          className="drag-drop-line database-row-drop-line database-timeline-row-drop-line"
          data-orientation="horizontal"
          style={{ top: controller.dropLineTop }}
        />
      ) : null}
    </>
  )
}

function TimelineRowDragRail({
  controller,
  layout,
}: {
  controller: TimelineRowDragController
  layout: TimelineRowLayout
}) {
  return (
    <div className="database-row-drag-rail database-timeline-row-drag-rail">
      {controller.controlRows.map((row) => {
        const rowCenter = layout.centers[row.id]
        if (rowCenter === undefined) return null

        return (
          <div
            className="database-row-controls"
            data-visible="true"
            key={row.id}
            onMouseEnter={() => controller.setHoveredRowId(row.id)}
            onMouseLeave={() => {
              if (!controller.draggedRowId) controller.setHoveredRowId(null)
            }}
            style={{ top: rowCenter }}
          >
            <TimelineRowDragButton controller={controller} row={row} />
          </div>
        )
      })}
    </div>
  )
}

function TimelineRowDragButton({
  controller,
  row,
}: {
  controller: TimelineRowDragController
  row: SortableDatabaseItem
}) {
  return (
    <button
      aria-label={`Drag ${getTimelineRowTitle(row)}`}
      className="database-row-drag-handle"
      data-database-row-drag-handle
      data-dragging={controller.draggedRowId === row.id ? "true" : undefined}
      draggable
      onClick={(event) => event.preventDefault()}
      onDragEnd={controller.clearDrag}
      onDragStart={(event) => controller.startDrag(row, event)}
      title="Drag page"
      type="button"
    >
      <GripVertical />
    </button>
  )
}

function getTimelineRowTitle(row: SortableDatabaseItem) {
  return row.page.name.trim() || "Untitled"
}
