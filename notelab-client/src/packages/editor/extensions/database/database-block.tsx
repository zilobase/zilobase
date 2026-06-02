import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Link } from "@tanstack/react-router"
import { FileText, GripVertical, Loader2, Maximize2, Plus } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent,
} from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useSession } from "@/features/auth/hooks"
import {
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useDatabase,
  useReorderDatabaseRows,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@/features/databases/hooks"
import { useWorkspacePersonAccessTargets } from "@/features/workspaces/hooks"

import { AddDatabasePropertyMenu } from "./add-database-property-menu"
import {
  DATABASE_PAGE_DRAG_MIME,
  databaseAddPropertyColumnDefaultWidth,
  databaseColumnMinWidth,
  databaseNameColumnDefaultWidth,
  defaultStatusOptions,
} from "./constants"
import { DatabaseInputCell } from "./database-input-cell"
import { DatabaseDateCell } from "./database-date-cell"
import { DatabasePageCell } from "./database-page-cell"
import { DatabasePropertyMenu } from "./database-property-menu"
import { DatabaseSelectCell } from "./database-select-cell"
import type { DatabaseBlockOptions } from "./types"
import {
  getPropertyValue,
  serializePropertyValue,
  type DatabasePropertyValue,
} from "./utils"

const databasePageDragEvents = new Set([
  "dragstart",
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
  "dragend",
])

type RowDragOverlay = {
  height: number
  left: number
  offsetX: number
  offsetY: number
  title: string
  top: number
  width: number
}

type DatabasePageDragPayload = {
  databaseId?: string
  pageId: string
  rowId?: string
  title?: string
}

function isDatabasePageDragEvent(event: Event) {
  if (!databasePageDragEvents.has(event.type) || !(event instanceof DragEvent)) {
    return false
  }

  return Array.from(event.dataTransfer?.types ?? []).includes(
    DATABASE_PAGE_DRAG_MIME
  )
}

function getDatabasePageDragPayload(
  dataTransfer: DataTransfer | null
): DatabasePageDragPayload | null {
  const payload = dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME)

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as {
      databaseId?: unknown
      pageId?: unknown
      rowId?: unknown
      title?: unknown
    }

    if (typeof parsed.pageId !== "string" || !parsed.pageId) {
      return null
    }

    return {
      databaseId:
        typeof parsed.databaseId === "string" ? parsed.databaseId : undefined,
      pageId: parsed.pageId,
      rowId: typeof parsed.rowId === "string" ? parsed.rowId : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    }
  } catch {
    return null
  }
}

function hasDatabasePageDragPayload(dataTransfer: DataTransfer | null) {
  return Array.from(dataTransfer?.types ?? []).includes(DATABASE_PAGE_DRAG_MIME)
}

function getPersonLimit(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "no_limit"
  }

  const personLimit = (config as { personLimit?: unknown }).personLimit

  return personLimit === "one_person" ? "one_person" : "no_limit"
}

function hideNativeDragPreview(dataTransfer: DataTransfer) {
  const dragImage = document.createElement("span")

  dragImage.style.position = "fixed"
  dragImage.style.top = "-100px"
  dragImage.style.left = "-100px"
  dragImage.style.width = "1px"
  dragImage.style.height = "1px"
  dragImage.style.opacity = "0"

  document.body.appendChild(dragImage)
  dataTransfer.setDragImage(dragImage, 0, 0)
  window.requestAnimationFrame(() => dragImage.remove())
}

type DatabaseTableViewProps = {
  databaseId: string | null | undefined
  editable?: boolean
  fullPage?: boolean
  onOpenPage?: (pageId: string) => void
  organizationId?: string | null
  showExpandButton?: boolean
  showTitle?: boolean
}

export function DatabaseTableView({
  databaseId,
  editable = true,
  fullPage = false,
  onOpenPage,
  organizationId,
  showExpandButton = false,
  showTitle = true,
}: DatabaseTableViewProps) {
  const [draftCells, setDraftCells] = useState<Record<string, string>>({})
  const updateDatabase = useUpdateDatabase()
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow(organizationId)
  const reorderRows = useReorderDatabaseRows()
  const updateValue = useUpdateDatabasePropertyValue()
  const { data: payload, isLoading } = useDatabase(databaseId)
  const { data: session } = useSession()
  const { data: accessTargets } = useWorkspacePersonAccessTargets(
    payload?.database.pageId
  )
  const [draftTitle, setDraftTitle] = useState("New database")
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [rowDragOverlay, setRowDragOverlay] =
    useState<RowDragOverlay | null>(null)
  const [rowDropTargetIndex, setRowDropTargetIndex] = useState<number | null>(
    null
  )
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [rowLayout, setRowLayout] = useState<{
    centers: Record<string, number>
    dropTops: number[]
  }>({ centers: {}, dropTops: [] })

  const propertyValues = payload?.values ?? []
  const properties = payload?.properties ?? []
  const rows = payload?.rows ?? []
  const personOptions = useMemo(
    () =>
      (accessTargets?.members ?? []).map((member) => ({
        id: member.id,
        name: member.name || member.email,
        suffix: member.id === session?.user?.id ? "(you)" : undefined,
      })),
    [accessTargets?.members, session?.user?.id]
  )
  const columnKeys = useMemo(
    () => [
      "name",
      ...properties.map((property) => property.id),
      ...(editable ? ["add-property"] : []),
    ],
    [editable, properties]
  )
  const getColumnWidth = (key: string) =>
    columnWidths[key] ??
    (key === "name"
      ? databaseNameColumnDefaultWidth
      : key === "add-property"
        ? databaseAddPropertyColumnDefaultWidth
        : databaseColumnMinWidth)
  const tableMinWidth = columnKeys.reduce(
    (width, key) => width + getColumnWidth(key),
    0
  )

  useEffect(() => {
    if (payload?.database.name) {
      setDraftTitle(payload.database.name)
    }
  }, [payload?.database.id, payload?.database.name])

  const getRowElements = useCallback(() => {
    return Array.from(
      tableWrapRef.current?.querySelectorAll<HTMLTableRowElement>(
        ".database-table tbody tr[data-database-row-id]"
      ) ?? []
    )
  }, [])

  const measureRows = useCallback(() => {
    const wrapperElement = tableWrapRef.current

    if (!wrapperElement) {
      return { centers: {}, dropTops: [] }
    }

    const wrapperRect = wrapperElement.getBoundingClientRect()
    const rowElements = getRowElements()
    const centers: Record<string, number> = {}
    const dropTops: number[] = []

    rowElements.forEach((rowElement, index) => {
      const rect = rowElement.getBoundingClientRect()
      const top = rect.top - wrapperRect.top
      const height = rect.height
      const rowId = rowElement.dataset.databaseRowId

      if (rowId) {
        centers[rowId] = top + height / 2
      }

      dropTops[index] = top

      if (index === rowElements.length - 1) {
        dropTops[index + 1] = top + height
      }
    })

    setRowLayout({ centers, dropTops })

    return { centers, dropTops }
  }, [getRowElements])

  useLayoutEffect(() => {
    measureRows()
  }, [activeCellKey, measureRows, properties.length, rows.length])

  useEffect(() => {
    window.addEventListener("resize", measureRows)

    return () => window.removeEventListener("resize", measureRows)
  }, [measureRows])

  const isDraggingDatabaseRow = Boolean(rowDragOverlay)

  useEffect(() => {
    if (!isDraggingDatabaseRow) {
      return
    }

    const moveOverlay = (event: DragEvent) => {
      setRowDragOverlay((overlay) =>
        overlay
          ? {
              ...overlay,
              left: event.clientX - overlay.offsetX,
              top: event.clientY - overlay.offsetY,
            }
          : overlay
      )
    }

    window.addEventListener("dragover", moveOverlay)

    return () => window.removeEventListener("dragover", moveOverlay)
  }, [isDraggingDatabaseRow])

  const cellValues = useMemo(() => {
    const values: Record<string, DatabasePropertyValue> = {}

    for (const row of rows) {
      for (const property of properties) {
        values[`${row.pageId}:${property.property.id}`] = getPropertyValue(
          propertyValues,
          row.pageId,
          property.property.id,
          property.property.type
        )
      }
    }

    return values
  }, [properties, propertyValues, rows])

  const addDatabaseRow = () => {
    if (!editable || !databaseId || addRow.isPending) {
      return
    }

    addRow.mutate({
      databaseId,
      title: "Untitled",
    })
  }

  const addDatabaseProperty = (type = "text", label = "Property") => {
    if (!editable || !databaseId || addProperty.isPending) {
      return
    }

    addProperty.mutate({
      config:
        type === "status"
          ? {
              defaultOptionId: defaultStatusOptions[0]?.id,
              options: defaultStatusOptions,
            }
          : undefined,
      databaseId,
      name: label,
      type,
    })
  }

  const saveCell = (
    rowId: string,
    propertyId: string,
    propertyType: string,
    value: DatabasePropertyValue
  ) => {
    if (!editable || !databaseId) {
      return
    }

    updateValue.mutate({
      databaseId,
      propertyId,
      rowId,
      value: serializePropertyValue(propertyType, value),
    })
  }

  const resizeCellEditor = (element: HTMLTextAreaElement) => {
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }

  const handleCellInput = (event: FormEvent<HTMLTextAreaElement>) => {
    resizeCellEditor(event.currentTarget)
  }

  const startColumnResize = (
    columnKey: string,
    event: PointerEvent<HTMLSpanElement>
  ) => {
    if (!editable) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = getColumnWidth(columnKey)

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.max(
        databaseColumnMinWidth,
        startWidth + moveEvent.clientX - startX
      )

      setColumnWidths((widths) => ({
        ...widths,
        [columnKey]: nextWidth,
      }))
    }

    const removeListeners = () => {
      document.body.classList.remove("database-resize-cursor")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", removeListeners)
      window.removeEventListener("pointercancel", removeListeners)
    }

    document.body.classList.add("database-resize-cursor")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", removeListeners)
    window.addEventListener("pointercancel", removeListeners)
  }

  const getRowDropTargetIndex = (clientY: number) => {
    const rowElements = getRowElements()

    if (rowElements.length === 0) {
      return 0
    }

    const targetIndex = rowElements.findIndex((rowElement) => {
      const rect = rowElement.getBoundingClientRect()

      return clientY < rect.top + rect.height / 2
    })

    return targetIndex === -1 ? rowElements.length : targetIndex
  }

  const moveDraggedRow = () => {
    if (!databaseId || !draggedRowId || rowDropTargetIndex === null) {
      return
    }

    const sourceIndex = rows.findIndex((row) => row.id === draggedRowId)

    if (sourceIndex === -1) {
      return
    }

    const nextRows = [...rows]
    const [draggedRow] = nextRows.splice(sourceIndex, 1)
    const nextTargetIndex =
      rowDropTargetIndex > sourceIndex
        ? rowDropTargetIndex - 1
        : rowDropTargetIndex

    nextRows.splice(nextTargetIndex, 0, draggedRow)

    const rowIds = nextRows.map((row) => row.id)

    if (rowIds.every((rowId, index) => rowId === rows[index]?.id)) {
      return
    }

    reorderRows.mutate({ databaseId, rowIds })
  }

  const addDraggedPageRow = (
    dragPayload: DatabasePageDragPayload,
    position = rowDropTargetIndex
  ) => {
    if (!databaseId || position === null || addRow.isPending) {
      return
    }

    if (dragPayload.pageId === payload?.database.pageId) {
      toast.error("You can't nest a page inside itself.")
      return
    }

    if (rows.some((row) => row.pageId === dragPayload.pageId)) {
      toast.error("This page is already in this database.")
      return
    }

    addRow.mutate({
      databaseId,
      pageId: dragPayload.pageId,
      position,
      title: dragPayload.title,
    })
  }

  const isTableDragEvent = (event: ReactDragEvent<HTMLElement>) =>
    event.target instanceof HTMLElement &&
    Boolean(event.target.closest(".database-table-wrap"))

  const handleDatabaseBlockDragOver = (
    event: ReactDragEvent<HTMLDivElement>
  ) => {
    if (isTableDragEvent(event)) {
      return
    }

    if (!hasDatabasePageDragPayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    measureRows()
    setRowDropTargetIndex(rows.length)
  }

  const handleDatabaseBlockDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (isTableDragEvent(event)) {
      return
    }

    const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

    if (!dragPayload) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    addDraggedPageRow(dragPayload, rows.length)
    clearRowDrag()
  }

  const clearRowDrag = () => {
    setDraggedRowId(null)
    setRowDragOverlay(null)
    setRowDropTargetIndex(null)
  }

  const rowDropLineTop =
    rowDropTargetIndex === null
      ? null
      : (rowLayout.dropTops[rowDropTargetIndex] ?? null)
  const activeDragRowId = draggedRowId ?? hoveredRowId
  const activeDragRowIndex = activeDragRowId
    ? rows.findIndex((row) => row.id === activeDragRowId)
    : -1
  const activeDragRow =
    activeDragRowIndex === -1 ? null : rows[activeDragRowIndex]
  return (
      <div
        className={
          fullPage
            ? "database-block-shell database-block-shell-full"
            : "database-block-shell"
        }
        contentEditable={false}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as globalThis.Node | null
            )
          ) {
            setRowDropTargetIndex(null)
          }
        }}
        onDragOver={handleDatabaseBlockDragOver}
        onDrop={handleDatabaseBlockDrop}
      >
        <div className="database-toolbar">
          {showTitle ? (
            <Input
              aria-label="Database title"
              className="database-title-input h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight text-foreground shadow-none placeholder:text-muted-foreground/40 focus-visible:border-transparent focus-visible:ring-0 md:text-2xl dark:bg-transparent"
              disabled={!databaseId}
              onBlur={(event) => {
                if (
                  databaseId &&
                  event.target.value !== payload?.database.name
                ) {
                  updateDatabase.mutate({
                    databaseId,
                    name: event.target.value,
                  })
                }
              }}
              onChange={(event) => {
                setDraftTitle(event.target.value)
              }}
              placeholder="New database"
              value={draftTitle}
            />
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {editable ? (
            <Button
              className="database-new-button"
              disabled={!databaseId || addRow.isPending}
              onClick={addDatabaseRow}
              type="button"
            >
              {addRow.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              <span>New</span>
            </Button>
          ) : null}
          {showExpandButton && databaseId ? (
            <Button
              aria-label="Expand database"
              asChild
              className="database-expand-button"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Link
                params={{ databaseId }}
                title="Expand database"
                to="/database/$databaseId"
              >
                <Maximize2 />
              </Link>
            </Button>
          ) : null}
        </div>
        {!databaseId ? (
          <div className="database-empty-state">
            <span>Database reference missing.</span>
          </div>
        ) : isLoading || !payload ? (
          <div className="database-empty-state">
            <Loader2 className="animate-spin" />
            <span>Loading database...</span>
          </div>
        ) : (
          <div
            className="database-table-wrap"
            ref={tableWrapRef}
            onMouseLeave={() => {
              if (!draggedRowId) {
                setHoveredRowId(null)
              }
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as globalThis.Node | null
                )
              ) {
                setRowDropTargetIndex(null)
              }
            }}
            onDragOver={(event) => {
              const hasDragPayload = hasDatabasePageDragPayload(
                event.dataTransfer
              )

              if (!draggedRowId && !hasDragPayload) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = "move"
              if (draggedRowId) {
                setRowDragOverlay((overlay) =>
                  overlay
                    ? {
                        ...overlay,
                        left: event.clientX - overlay.offsetX,
                        top: event.clientY - overlay.offsetY,
                      }
                    : overlay
                )
              }
              measureRows()
              setRowDropTargetIndex(getRowDropTargetIndex(event.clientY))
            }}
            onDrop={(event) => {
              const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

              if ((!draggedRowId && !dragPayload) || rowDropTargetIndex === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              if (draggedRowId) {
                moveDraggedRow()
              } else if (dragPayload) {
                addDraggedPageRow(dragPayload)
              }
              clearRowDrag()
            }}
          >
            {editable ? (
              <div className="database-row-drag-rail">
                {activeDragRow ? (
                <button
                  aria-label={`Drag ${activeDragRow.page.name.trim() || "Untitled"}`}
                  className="database-row-drag-handle"
                  data-database-row-drag-handle
                  data-dragging={
                    draggedRowId === activeDragRow.id ? "true" : undefined
                  }
                  data-visible="true"
                  draggable
                  key="database-row-drag-handle"
                  onClick={(event) => event.preventDefault()}
                  onDragStart={(event) => {
                    measureRows()
                    const rowElement = tableWrapRef.current?.querySelector(
                      `tr[data-database-row-id="${activeDragRow.id}"]`
                    )
                    const rowRect = rowElement?.getBoundingClientRect()
                    const tableRect = tableWrapRef.current
                      ?.querySelector(".database-table")
                      ?.getBoundingClientRect()

                    if (rowRect && tableRect) {
                      setRowDragOverlay({
                        height: rowRect.height,
                        left: rowRect.left,
                        offsetX: event.clientX - rowRect.left,
                        offsetY: event.clientY - rowRect.top,
                        title: activeDragRow.page.name.trim() || "Untitled",
                        top: rowRect.top,
                        width: tableRect.width,
                      })
                    }

                    hideNativeDragPreview(event.dataTransfer)
                    setDraggedRowId(activeDragRow.id)
                    setRowDropTargetIndex(activeDragRowIndex)
                    event.dataTransfer.effectAllowed = "copyMove"
                    event.dataTransfer.setData(
                      DATABASE_PAGE_DRAG_MIME,
                      JSON.stringify({
                        databaseId: payload.database.id,
                        pageId: activeDragRow.pageId,
                        rowId: activeDragRow.id,
                      })
                    )
                    event.dataTransfer.setData(
                      "text/plain",
                      activeDragRow.page.name.trim() || "Untitled"
                    )
                  }}
                  onDragEnd={clearRowDrag}
                  onMouseEnter={() => {
                    measureRows()
                    setHoveredRowId(activeDragRow.id)
                  }}
                  style={{
                    top: rowLayout.centers[activeDragRow.id] ?? 0,
                  }}
                  title="Drag page"
                  type="button"
                >
                  <GripVertical />
                </button>
                ) : null}
              </div>
            ) : null}
            {rowDragOverlay ? (
              <div
                aria-hidden="true"
                className="database-row-drag-overlay"
                style={{
                  height: rowDragOverlay.height,
                  left: rowDragOverlay.left,
                  top: rowDragOverlay.top,
                  width: rowDragOverlay.width,
                }}
              >
                <span className="database-row-drag-overlay-cell">
                  <FileText />
                  <span>{rowDragOverlay.title}</span>
                </span>
              </div>
            ) : null}
            {rowDropLineTop !== null ? (
              <div
                className="pointer-events-none absolute left-0 right-0 z-30 h-0.5 -translate-y-px bg-primary"
                style={{ top: rowDropLineTop }}
              />
            ) : null}
            <div className="database-table-scroll">
              <table
                className="database-table"
                style={
                  {
                    "--database-table-min-width": `${tableMinWidth}px`,
                  } as CSSProperties
                }
              >
              <colgroup>
                {columnKeys.map((key) => (
                  <col key={key} style={{ width: getColumnWidth(key) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="database-name-header">
                    <span className="database-name-header-content">
                      <span>Aa</span>
                      <span>Name</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="database-column-resize-handle"
                      onPointerDown={(event) => startColumnResize("name", event)}
                    />
                  </th>
                  {properties.map((property) => (
                    <th key={property.id} className="database-property-header">
                      {editable ? (
                        <DatabasePropertyMenu
                          config={property.property.config}
                          databaseId={payload.database.id}
                          databasePropertyId={property.id}
                          name={property.property.name}
                          type={property.property.type}
                          onRename={(name) =>
                            updateProperty.mutate({
                              databaseId: payload.database.id,
                              databasePropertyId: property.id,
                              name,
                            })
                          }
                        />
                      ) : (
                        <span className="database-property-header-label">
                          {property.property.name}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className="database-column-resize-handle"
                        onPointerDown={(event) =>
                          startColumnResize(property.id, event)
                        }
                      />
                    </th>
                  ))}
                  {editable ? (
                    <th className="database-add-property-cell">
                      <AddDatabasePropertyMenu
                        disabled={addProperty.isPending}
                        isPending={addProperty.isPending}
                        onAdd={addDatabaseProperty}
                      />
                      <span
                        aria-hidden="true"
                        className="database-column-resize-handle"
                        onPointerDown={(event) =>
                          startColumnResize("add-property", event)
                        }
                      />
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    data-database-row-id={row.id}
                    key={row.id}
                    onMouseEnter={() => {
                      measureRows()
                      setHoveredRowId(row.id)
                    }}
                  >
                    <td className="database-page-cell">
                      <DatabasePageCell
                        onOpen={onOpenPage}
                        pageId={row.pageId}
                      />
                    </td>
                    {properties.map((property) => {
                      const workspaceProperty = property.property
                      const key = `${row.pageId}:${workspaceProperty.id}`
                      const value = draftCells[key] ?? cellValues[key] ?? ""
                      const isSelectProperty =
                        workspaceProperty.type === "select" ||
                        workspaceProperty.type === "multi_select" ||
                        workspaceProperty.type === "status"
                      const isCheckboxProperty =
                        workspaceProperty.type === "checkbox"
                      const isDateProperty = workspaceProperty.type === "date"
                      const isPersonProperty = workspaceProperty.type === "person"
                      const isMultiSelectProperty =
                        workspaceProperty.type === "multi_select" ||
                        (isPersonProperty &&
                          getPersonLimit(workspaceProperty.config) !==
                            "one_person")

                      return (
                        <td
                          className="database-value-cell"
                          data-active={activeCellKey === key ? "true" : undefined}
                          key={property.id}
                        >
                          {isCheckboxProperty ? (
                            <div className="database-checkbox-cell">
                              <Checkbox
                                aria-label={`${workspaceProperty.name} value`}
                                checked={value === "true"}
                                disabled={!editable}
                                onCheckedChange={(nextChecked) =>
                                  saveCell(
                                    row.id,
                                    workspaceProperty.id,
                                    workspaceProperty.type,
                                    nextChecked === true ? "true" : "false"
                                  )
                                }
                              />
                            </div>
                          ) : isSelectProperty || isPersonProperty ? (
                            <DatabaseSelectCell
                              allowCreate={!isPersonProperty}
                              databaseId={payload.database.id}
                              editable={editable}
                              defaultOptions={
                                workspaceProperty.type === "status"
                                  ? defaultStatusOptions
                                  : isPersonProperty
                                    ? personOptions
                                  : undefined
                              }
                              multiple={isMultiSelectProperty}
                              onSelect={(optionValue) =>
                                saveCell(
                                  row.id,
                                  workspaceProperty.id,
                                  workspaceProperty.type,
                                  optionValue
                                )
                              }
                              propertyConfig={workspaceProperty.config}
                              propertyId={property.id}
                              propertyName={workspaceProperty.name}
                              showStatusDot={workspaceProperty.type === "status"}
                              value={value}
                              valueKey={isPersonProperty ? "id" : "name"}
                            />
                          ) : isDateProperty ? (
                            <DatabaseDateCell
                              databaseId={payload.database.id}
                              editable={editable}
                              label={workspaceProperty.name}
                              onOpenChange={(open) =>
                                setActiveCellKey(open ? key : null)
                              }
                              onSelect={(nextValue) =>
                                saveCell(
                                  row.id,
                                  workspaceProperty.id,
                                  workspaceProperty.type,
                                  nextValue
                                )
                              }
                              propertyConfig={workspaceProperty.config}
                              propertyId={property.id}
                              value={value}
                            />
                          ) : (
                            <DatabaseInputCell
                              label={workspaceProperty.name}
                              editable={editable}
                              onActivate={(element) => {
                                setActiveCellKey(key)
                                resizeCellEditor(element)
                              }}
                              onChange={(nextValue) =>
                                setDraftCells((drafts) => ({
                                  ...drafts,
                                  [key]: nextValue,
                                }))
                              }
                              onCommit={() => {
                                saveCell(
                                  row.id,
                                  workspaceProperty.id,
                                  workspaceProperty.type,
                                  value
                                )
                                setDraftCells((drafts) => {
                                  const nextDrafts = { ...drafts }

                                  delete nextDrafts[key]

                                  return nextDrafts
                                })
                              }}
                              onDeactivate={() =>
                                setActiveCellKey((currentKey) =>
                                  currentKey === key ? null : currentKey
                                )
                              }
                              onInput={handleCellInput}
                              propertyConfig={workspaceProperty.config}
                              type={workspaceProperty.type}
                              value={Array.isArray(value) ? value.join(", ") : value}
                            />
                          )}
                        </td>
                      )
                    })}
                    {editable ? <td /> : null}
                  </tr>
                ))}
              </tbody>
              </table>
              {editable ? (
                <div
                  className="database-page-create-row"
                  style={
                    {
                      "--database-table-min-width": `${tableMinWidth}px`,
                    } as CSSProperties
                  }
                >
                  <button
                    className="database-page-create database-page-create-full"
                    disabled={!databaseId || addRow.isPending}
                    onClick={addDatabaseRow}
                    type="button"
                  >
                    {addRow.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    <span>New page</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
  )
}

function DatabaseBlockView({ editor, extension, node }: ReactNodeViewProps) {
  const options = extension.options as DatabaseBlockOptions
  const databaseId = node.attrs.databaseId as string | null
  // Subscribe through the editor-owned runtime so this node view updates when read-only mode changes.
  const isEditable = useSyncExternalStore(
    options.editorRuntime?.subscribe ?? (() => () => {}),
    options.editorRuntime?.getEditable ??
      (() => options.editable !== false && editor.isEditable),
    options.editorRuntime?.getEditable ??
      (() => options.editable !== false && editor.isEditable)
  )

  return (
    <NodeViewWrapper
      className="database-block"
      data-database-id={databaseId ?? undefined}
      data-type="databaseBlock"
    >
      <DatabaseTableView
        databaseId={databaseId}
        editable={isEditable}
        onOpenPage={options.onOpenPage}
        organizationId={options.organizationId}
        showExpandButton
      />
    </NodeViewWrapper>
  )
}

export const DatabaseBlock = Node.create<DatabaseBlockOptions>({
  name: "databaseBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  extendNodeSchema(extension) {
    if (extension.name !== this.name) {
      return {}
    }

    return {
      disableDropCursor: (
        _view: unknown,
        _pos: unknown,
        event: DragEvent
      ) => isDatabasePageDragEvent(event),
    }
  },

  addOptions() {
    return {
      currentPageId: null,
      onOpenPage: undefined,
      organizationId: null,
    }
  },

  addAttributes() {
    return {
      databaseId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-database-id"),
        renderHTML: (attributes) =>
          attributes.databaseId ? { "data-database-id": attributes.databaseId } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="databaseBlock"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "databaseBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockView, {
      stopEvent: ({ event }) => {
        const target = event.target

        if (
          target instanceof HTMLElement &&
          target.closest(".database-block-shell")
        ) {
          return true
        }

        return isDatabasePageDragEvent(event)
      },
    })
  },
})
