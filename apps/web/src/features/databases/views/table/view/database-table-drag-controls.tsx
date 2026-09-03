import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { Reorder, useDragControls } from "framer-motion"
import { GripVertical } from "@/shared/components/icons"
import { cn } from "@/shared/lib/utils"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  getRowTitle,
  type RowLayout,
  type TableRow,
} from "../model/database-table-model"

export function DatabaseHeaderReorderItem({
  children,
  canReorder,
  className,
  headerScope,
  isDragging,
  columnId,
  onDragEnd,
  onDragStart,
}: {
  canReorder: boolean
  children: (
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void
  ) => ReactNode
  className?: string
  headerScope: string
  isDragging: boolean
  columnId: string
  onDragEnd: () => void
  onDragStart: () => void
}) {
  const dragControls = useDragControls()
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canReorder) return

    event.stopPropagation()
    dragControls.start(event)
  }

  return (
    <Reorder.Item
      as="th"
      className={cn("database-reorderable-header", className)}
      data-column-dragging={isDragging ? "true" : undefined}
      data-column-reorderable={canReorder ? "true" : undefined}
      data-header-scope={headerScope}
      data-property-id={columnId}
      dragControls={dragControls}
      dragListener={false}
      transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
      value={columnId}
      whileDrag={{ scale: 0.995 }}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      {children(startDrag)}
    </Reorder.Item>
  )
}

export function DatabaseRowDragControls({
  canReorderRows,
  draggedRowId,
  editable,
  hoveredRowId,
  onDragEnd,
  onDragStart,
  onHoveredRowChange,
  onSelectedRowChange,
  rowDragTitle,
  rowLayout,
  selectedRowIds,
  visibleRows,
}: {
  canReorderRows: boolean
  draggedRowId: string | null
  editable: boolean
  hoveredRowId: string | null
  onDragEnd: () => void
  onDragStart: (row: TableRow, event: ReactDragEvent<HTMLButtonElement>) => void
  onHoveredRowChange: (rowId: string | null) => void
  onSelectedRowChange: (rowId: string, selected: boolean) => void
  rowDragTitle: string
  rowLayout: RowLayout
  selectedRowIds: Set<string>
  visibleRows: TableRow[]
}) {
  if (!editable) return null

  return (
    <div className="database-row-drag-rail">
      {visibleRows.map((row) => {
        const rowCenter = rowLayout.centers[row.id]
        if (rowCenter === undefined) return null

        const isRowHandleVisible =
          hoveredRowId === row.id ||
          draggedRowId === row.id ||
          selectedRowIds.has(row.id)

        return (
          <div
            className="database-row-controls"
            data-visible={isRowHandleVisible ? "true" : undefined}
            key={row.id}
            onMouseEnter={() => onHoveredRowChange(row.id)}
            onMouseLeave={() => {
              if (!draggedRowId) onHoveredRowChange(null)
            }}
            style={
              {
                "--database-row-hit-height": `${rowLayout.heights[row.id] ?? 28}px`,
                top: rowCenter,
              } as CSSProperties
            }
          >
            <button
              aria-label={`Drag ${getRowTitle(row)}`}
              className="database-row-drag-handle"
              data-database-row-drag-handle
              data-dragging={draggedRowId === row.id ? "true" : undefined}
              disabled={!canReorderRows}
              draggable={canReorderRows}
              onClick={(event) => event.preventDefault()}
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(row, event)}
              title={rowDragTitle}
              type="button"
            >
              <GripVertical />
            </button>
            <Checkbox
              aria-label={`Select ${getRowTitle(row)}`}
              checked={selectedRowIds.has(row.id)}
              className="database-row-checkbox"
              onCheckedChange={(checked) =>
                onSelectedRowChange(row.id, checked === true)
              }
            />
          </div>
        )
      })}
    </div>
  )
}

export function DatabaseRowDropLine({
  depth,
  top,
}: {
  depth: number
  top: number | null
}) {
  if (top === null) return null

  return (
    <div
      aria-hidden="true"
      className="drag-drop-line database-row-drop-line"
      data-orientation="horizontal"
      style={
        {
          "--database-row-drop-depth": depth,
          top,
        } as CSSProperties
      }
    />
  )
}
