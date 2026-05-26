import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { FileText, GripVertical, Loader2, Plus } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useDatabase,
  useReorderDatabaseRows,
  useUpdateDatabase,
  useUpdateDatabaseCell,
  useUpdateDatabaseProperty,
} from "@/features/databases/hooks"

import { AddDatabasePropertyMenu } from "./add-database-property-menu"
import {
  DATABASE_PAGE_DRAG_MIME,
  databaseAddPropertyColumnDefaultWidth,
  databaseColumnMinWidth,
  databaseNameColumnDefaultWidth,
} from "./constants"
import { DatabaseInputCell } from "./database-input-cell"
import { DatabasePageCell } from "./database-page-cell"
import { DatabasePropertyMenu } from "./database-property-menu"
import { DatabaseSelectCell } from "./database-select-cell"
import type { DatabaseBlockOptions } from "./types"
import { getCellValue, type DatabaseCellValue } from "./utils"

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

function isDatabasePageDragEvent(event: Event) {
  if (!databasePageDragEvents.has(event.type) || !(event instanceof DragEvent)) {
    return false
  }

  return Array.from(event.dataTransfer?.types ?? []).includes(
    DATABASE_PAGE_DRAG_MIME
  )
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

function DatabaseBlockView({ extension, node }: ReactNodeViewProps) {
  const options = extension.options as DatabaseBlockOptions
  const databaseId = node.attrs.databaseId as string | null
  const [draftCells, setDraftCells] = useState<Record<string, string>>({})
  const updateDatabase = useUpdateDatabase()
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow(options.organizationId)
  const reorderRows = useReorderDatabaseRows()
  const updateCell = useUpdateDatabaseCell()
  const { data: payload, isLoading } = useDatabase(databaseId)
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

  const cells = payload?.cells ?? []
  const properties = payload?.properties ?? []
  const rows = payload?.rows ?? []
  const columnKeys = useMemo(
    () => ["name", ...properties.map((property) => property.id), "add-property"],
    [properties]
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
    const values: Record<string, DatabaseCellValue> = {}

    for (const row of rows) {
      for (const property of properties) {
        values[`${row.id}:${property.id}`] = getCellValue(
          cells,
          row.id,
          property.id
        )
      }
    }

    return values
  }, [cells, properties, rows])

  const addDatabaseRow = () => {
    if (!databaseId || addRow.isPending) {
      return
    }

    addRow.mutate({
      databaseId,
      title: "Untitled",
    })
  }

  const addDatabaseProperty = (type = "text", label = "Property") => {
    if (!databaseId || addProperty.isPending) {
      return
    }

    addProperty.mutate({
      databaseId,
      name: label,
      type,
    })
  }

  const saveCell = (
    rowId: string,
    propertyId: string,
    value: DatabaseCellValue
  ) => {
    if (!databaseId) {
      return
    }

    updateCell.mutate({
      databaseId,
      propertyId,
      rowId,
      value: { text: value },
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
    <NodeViewWrapper
      className="database-block"
      data-database-id={databaseId ?? undefined}
      data-type="databaseBlock"
    >
      <div className="database-block-shell" contentEditable={false}>
        <div className="database-toolbar">
          <Input
            aria-label="Database title"
            className="database-title-input h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight text-foreground shadow-none placeholder:text-muted-foreground/40 focus-visible:border-transparent focus-visible:ring-0 md:text-2xl dark:bg-transparent"
            disabled={!databaseId}
            onBlur={(event) => {
              if (databaseId && event.target.value !== payload?.database.name) {
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
          <Button
            className="database-new-button"
            disabled={!databaseId || addRow.isPending}
            onClick={addDatabaseRow}
            type="button"
          >
            {addRow.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            <span>New</span>
          </Button>
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
              if (!draggedRowId) {
                return
              }

              event.preventDefault()
              event.dataTransfer.dropEffect = "move"
              setRowDragOverlay((overlay) =>
                overlay
                  ? {
                      ...overlay,
                      left: event.clientX - overlay.offsetX,
                      top: event.clientY - overlay.offsetY,
                    }
                  : overlay
              )
              measureRows()
              setRowDropTargetIndex(getRowDropTargetIndex(event.clientY))
            }}
            onDrop={(event) => {
              if (!draggedRowId || rowDropTargetIndex === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              moveDraggedRow()
              clearRowDrag()
            }}
          >
            <div className="database-row-drag-rail">
              {activeDragRow ? (
                <button
                  aria-label={`Drag ${activeDragRow.title.trim() || "Untitled"}`}
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
                        title: activeDragRow.title.trim() || "Untitled",
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
                      activeDragRow.title.trim() || "Untitled"
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
                      <DatabasePropertyMenu
                        name={property.name}
                        type={property.type}
                        onRename={(name) =>
                          updateProperty.mutate({
                            databaseId: payload.database.id,
                            name,
                            propertyId: property.id,
                          })
                        }
                      />
                      <span
                        aria-hidden="true"
                        className="database-column-resize-handle"
                        onPointerDown={(event) =>
                          startColumnResize(property.id, event)
                        }
                      />
                    </th>
                  ))}
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
                        onOpen={options.onOpenPage}
                        pageId={row.pageId}
                      />
                    </td>
                    {properties.map((property) => {
                      const key = `${row.id}:${property.id}`
                      const value = draftCells[key] ?? cellValues[key] ?? ""
                      const isSelectProperty =
                        property.type === "select" ||
                        property.type === "multi_select"
                      const isMultiSelectProperty =
                        property.type === "multi_select"

                      return (
                        <td
                          className="database-value-cell"
                          data-active={activeCellKey === key ? "true" : undefined}
                          key={property.id}
                        >
                          {isSelectProperty ? (
                            <DatabaseSelectCell
                              databaseId={payload.database.id}
                              multiple={isMultiSelectProperty}
                              onSelect={(optionValue) =>
                                saveCell(row.id, property.id, optionValue)
                              }
                              propertyConfig={property.config}
                              propertyId={property.id}
                              propertyName={property.name}
                              value={value}
                            />
                          ) : (
                            <DatabaseInputCell
                              label={property.name}
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
                                saveCell(row.id, property.id, value)
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
                              value={Array.isArray(value) ? value.join(", ") : value}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                ))}
                <tr>
                  <td className="database-page-cell">
                    <button
                      className="database-page-create"
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
                  </td>
                  {properties.map((property) => (
                    <td key={property.id} />
                  ))}
                  <td />
                </tr>
              </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
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
          target.closest(
            "[data-database-row-drag-handle], [data-database-cell-input]"
          )
        ) {
          return true
        }

        return isDatabasePageDragEvent(event)
      },
    })
  },
})
