import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { Reorder, useDragControls } from "framer-motion"
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Loader2,
  Plus,
} from "lucide-react"
import { toast } from "sonner"
import {
  useMoveDatabaseRow,
  useReorderDatabaseRows,
} from "@zilobase/features/databases"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { useOptionalPageSidePane } from "@/contexts/page-side-pane"
import { cn } from "@/lib/utils"
import { useUndoHistory } from "@/shortcuts"
import {
  getColorToken,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/lib/color-tokens"

import { AddDatabasePropertyMenu } from "../../properties/add-database-property-menu"
import { DatabaseCellContent } from "../database-cell-content"
import {
  databaseAddPropertyColumnDefaultWidth,
  databaseColumnMinWidth,
  databaseNameColumnDefaultWidth,
} from "../../core/database-contracts"
import {
  setDatabasePageDragPayload,
} from "../../interactions/database-page-drop"
import { DatabasePageLink } from "../../interactions/database-page-link"
import { DatabaseFormulaDialog } from "../../properties/formula/database-formula-dialog"
import {
  DatabaseNamePropertyMenu,
  DatabasePropertyMenu,
} from "../../properties/database-property-menu"
import { DatabasePropertyValue } from "../../properties/database-property-value"
import { serializePropertyValue } from "../../core/utils"
import {
  getDatabasePropertyOrder,
  getNameColumnWrapContent,
  getPropertyWrapContent,
} from "../database-view-config"
import {
  useDatabaseRealtimeState,
  useDatabaseViewContext,
} from "../database-view-context"
import { getSubItemCreateRowsAfterRow } from "../database-sub-items"
import {
  useActiveDatabaseCellKey,
  useDatabaseCellIsActive,
  useSetActiveDatabaseCell,
} from "../database-cell-state"
import { useDatabaseRowsScroll } from "../../interactions/use-database-rows-scroll"
import { useInlineDatabaseScroll } from "../../interactions/use-inline-database-scroll"
import { getDatabaseHorizontalScrollSync } from "../../interactions/database-wheel-scroll"
import {
  areSerializedPropertyValuesEqual,
  databaseItemMatchesFilter,
  type SortableDatabaseItem,
} from "../../interactions/database-item-utils"
import { getDatabaseGroupMoveValue } from "../../interactions/database-group-values"
import {
  getDatabaseTableGroupSections,
  type DatabaseTableGroupSection,
} from "../../interactions/database-table-group-sections"
import {
  getDatabaseCellFillRowIds,
  getRedoableDatabaseCellFillChanges,
  getUndoableDatabaseCellFillChanges,
  isDatabasePropertyFillable,
  type DatabaseCellFillHistoryChange,
} from "../../interactions/database-cell-fill"
import {
  getDatabaseRowDropTarget,
  type DatabaseRowDropTarget,
} from "../../interactions/database-table-layout"
import {
  claimDatabaseRowDropOwner,
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
  getReorderedRowIds,
  finishDatabaseRowDrag,
  hideNativeDatabaseRowDragPreview,
  releaseDatabaseRowDropOwner,
  startDatabaseRowDrag,
  subscribeDatabaseRowDropOwner,
} from "../../interactions/database-row-drag"
import { useDatabaseRowDragOverlay } from "../../interactions/use-database-row-drag-overlay"
import {
  canCreateRowInKanbanGroup,
  canUpdateKanbanGroupProperty,
} from "../kanban/database-kanban-config"
import {
  isVerticalScrollContainer,
  shouldRenderVirtualizedDatabaseRows,
} from "../database-view-scroll"

type InsertPropertySide = "left" | "right"

type PendingInsertProperty = {
  position: number
  side: InsertPropertySide
  sourceColumnKey: string
}

type PendingPropertyInsertOrder = {
  columnIds: string[]
  existingPropertyIds: string[]
  side: InsertPropertySide
  sourceColumnKey: string
}

type PendingFormulaSetup = {
  existingPropertyIds: string[]
}

type PendingSortedRowReorder = {
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
}

type RowMove = PendingSortedRowReorder

const DATABASE_NAME_COLUMN_ID = "name"
const ADD_PROPERTY_COLUMN_ID = "add-property"
const INSERT_PROPERTY_COLUMN_PREFIX = "insert-property"

type TableRow = SortableDatabaseItem
type GroupSection = DatabaseTableGroupSection<TableRow>
type RowLayout = {
  centers: Record<string, number>
  dropTops: number[]
}
type GroupRowDropTarget = {
  localTargetIndex: number
  sectionId: string
  top: number
}
type CellFillDrag = {
  propertyId: string
  propertyType: string
  sourceRowId: string
  sourceValue: string | string[]
  targetRowId: string
}
function DatabaseHeaderReorderItem({
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
    if (!canReorder) {
      return
    }

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

function getHeaderEditingKey(headerScope: string, propertyKey: string) {
  return `${headerScope}:${propertyKey}`
}

function getPropertyKeyFromHeaderEditingKey(editingKey: string | null) {
  if (!editingKey) {
    return null
  }

  const separatorIndex = editingKey.indexOf(":")

  return separatorIndex === -1
    ? editingKey
    : editingKey.slice(separatorIndex + 1)
}

function areColumnOrdersEqual(left: string[] | null, right: string[]) {
  return (
    left !== null &&
    left.length === right.length &&
    left.every((propertyId, index) => propertyId === right[index])
  )
}

function getMergedColumnIds(
  columnIds: string[],
  preferredColumnIds: string[] | null
) {
  if (!preferredColumnIds) {
    return columnIds
  }

  const validColumnIds = new Set(columnIds)
  const seenColumnIds = new Set<string>()
  const orderedColumnIds = preferredColumnIds.filter((columnId) => {
    if (!validColumnIds.has(columnId) || seenColumnIds.has(columnId)) {
      return false
    }

    seenColumnIds.add(columnId)
    return true
  })

  return [
    ...orderedColumnIds,
    ...columnIds.filter((columnId) => !seenColumnIds.has(columnId)),
  ]
}

function getColumnIdsWithInsertedProperty(
  pendingInsert: PendingPropertyInsertOrder,
  propertyId: string,
  currentColumnIds: string[]
) {
  const columnIds = pendingInsert.columnIds.filter(
    (columnId) => columnId !== propertyId
  )
  const sourceIndex = columnIds.indexOf(pendingInsert.sourceColumnKey)
  const insertIndex =
    sourceIndex === -1
      ? columnIds.length
      : sourceIndex + (pendingInsert.side === "right" ? 1 : 0)

  columnIds.splice(insertIndex, 0, propertyId)

  return getMergedColumnIds(currentColumnIds, columnIds)
}

function requireDatabaseId(databaseId: string | null | undefined) {
  if (!databaseId) {
    throw new Error("DatabaseTableView requires a Database id.")
  }

  return databaseId
}

function getColumnWidth(columnWidths: Record<string, number>, key: string) {
  return (
    columnWidths[key] ??
    (key === DATABASE_NAME_COLUMN_ID
      ? databaseNameColumnDefaultWidth
      : key === ADD_PROPERTY_COLUMN_ID
        ? databaseAddPropertyColumnDefaultWidth
        : key.startsWith(`${INSERT_PROPERTY_COLUMN_PREFIX}-`)
          ? databaseAddPropertyColumnDefaultWidth
          : databaseColumnMinWidth)
  )
}

function getInsertPropertyColumnKey(
  sourceColumnKey: string,
  side: InsertPropertySide
) {
  return `${INSERT_PROPERTY_COLUMN_PREFIX}-${sourceColumnKey}-${side}`
}

function getRowTitle(row: TableRow) {
  return row.page.name.trim() || "Untitled"
}

function getRowDragTitle({
  canReorder,
  isFiltered,
  isGrouped,
  isSorted,
}: {
  canReorder: boolean
  isFiltered: boolean
  isGrouped: boolean
  isSorted: boolean
}) {
  if (!canReorder) {
    return "Manual row sorting is disabled"
  }

  if (isGrouped && isSorted) {
    return "Drag within this group. Clear sorting to save the new order."
  }

  if (isGrouped) {
    return "Drag within this group"
  }

  if (isSorted && isFiltered) {
    return "Drag page. Clear sorting to save the new order; hidden rows keep their relative order."
  }

  if (isSorted) {
    return "Drag page. Clear sorting to save the new order."
  }

  if (isFiltered) {
    return "Drag page. Hidden rows keep their relative order."
  }

  return "Drag page"
}

function getTableColumnKeys({
  canEditStructure,
  columnIds,
  pendingInsert,
}: {
  canEditStructure: boolean
  columnIds: string[]
  pendingInsert: PendingInsertProperty | null
}) {
  const dataColumnKeys = columnIds.flatMap((columnId) => {
    if (!pendingInsert || columnId !== pendingInsert.sourceColumnKey) {
      return [columnId]
    }

    const insertKey = getInsertPropertyColumnKey(columnId, pendingInsert.side)

    return pendingInsert.side === "left"
      ? [insertKey, columnId]
      : [columnId, insertKey]
  })

  return [
    ...dataColumnKeys,
    ...(canEditStructure ? [ADD_PROPERTY_COLUMN_ID] : []),
  ]
}

function getConditionalColorClassName(color?: string) {
  return color ? getColorToken(color).backgroundClass : undefined
}

function getTableMinWidthStyle(tableMinWidth: number) {
  return {
    "--database-table-min-width": `${tableMinWidth}px`,
  } as CSSProperties
}

function DatabaseTable({
  children,
  columnKeys,
  columnWidths,
  tableMinWidth,
}: {
  children: ReactNode
  columnKeys: string[]
  columnWidths: Record<string, number>
  tableMinWidth: number
}) {
  return (
    <table
      className="database-table"
      style={getTableMinWidthStyle(tableMinWidth)}
    >
      <colgroup>
        {columnKeys.map((key) => (
          <col
            data-column-id={key}
            key={key}
            style={{ width: getColumnWidth(columnWidths, key) }}
          />
        ))}
      </colgroup>
      {children}
    </table>
  )
}

function DatabaseVirtualizedTable({
  columnKeys,
  columnWidths,
  footerRow,
  measurementKey,
  renderRow,
  rows,
  tableMinWidth,
  virtualizationEnabled,
}: {
  columnKeys: string[]
  columnWidths: Record<string, number>
  footerRow?: ReactNode
  measurementKey: string
  renderRow: (
    row: TableRow,
    index: number,
    measureElement: (node: Element | null) => void
  ) => ReactNode
  rows: TableRow[]
  tableMinWidth: number
  virtualizationEnabled: boolean
}) {
  const tableRef = useRef<HTMLDivElement | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const activeCellKey = useActiveDatabaseCellKey()
  const activeRowIndex = activeCellKey
    ? rows.findIndex((row) => activeCellKey.startsWith(`${row.pageId}:`))
    : -1
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)

      if (activeRowIndex < 0 || indexes.includes(activeRowIndex)) {
        return indexes
      }

      return [...indexes, activeRowIndex].sort((left, right) => left - right)
    },
    [activeRowIndex]
  )
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 32,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 8,
    rangeExtractor,
    scrollMargin,
  })

  useLayoutEffect(() => {
    virtualizer.measure()
  }, [measurementKey, virtualizer])

  useLayoutEffect(() => {
    const element = tableRef.current

    if (!element) {
      return
    }

    let parent = element.parentElement
    let nextScrollElement: HTMLElement | null = null

    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY

      if (
        isVerticalScrollContainer({
          clientHeight: parent.clientHeight,
          overflowY,
          scrollHeight: parent.scrollHeight,
        })
      ) {
        nextScrollElement = parent
        break
      }

      parent = parent.parentElement
    }

    nextScrollElement ??= document.scrollingElement as HTMLElement | null
    setScrollElement(nextScrollElement)

    const measureOffset = () => {
      const elementRect = element.getBoundingClientRect()
      const scrollRect = nextScrollElement?.getBoundingClientRect()
      const scrollTop = nextScrollElement?.scrollTop ?? window.scrollY

      setScrollMargin(
        elementRect.top - (scrollRect?.top ?? 0) + scrollTop
      )
    }

    measureOffset()
    const observer = new ResizeObserver(measureOffset)
    observer.observe(element)
    if (nextScrollElement) {
      observer.observe(nextScrollElement)
    }
    window.addEventListener("resize", measureOffset)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measureOffset)
    }
  }, [])

  const virtualRows = virtualizer.getVirtualItems()
  const renderVirtualRows = shouldRenderVirtualizedDatabaseRows({
    hasScrollElement: scrollElement !== null,
    virtualRowCount: virtualRows.length,
    virtualizationEnabled,
  })
  const getLocalVirtualStart = (start: number) => start - scrollMargin
  const getLocalVirtualEnd = (end: number) => end - scrollMargin
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() -
        getLocalVirtualEnd(virtualRows[virtualRows.length - 1].end)
      : 0

  return (
    <div ref={tableRef}>
      <DatabaseTable
        columnKeys={columnKeys}
        columnWidths={columnWidths}
        tableMinWidth={tableMinWidth}
      >
        <tbody>
          {renderVirtualRows
            ? virtualRows.map((virtualRow, virtualIndex) => {
                const previousEnd =
                  virtualIndex === 0
                    ? 0
                    : getLocalVirtualEnd(virtualRows[virtualIndex - 1].end)
                const gap =
                  getLocalVirtualStart(virtualRow.start) - previousEnd

                return (
                  <Fragment key={virtualRow.key}>
                    {gap > 0 ? (
                      <tr aria-hidden="true">
                        <td
                          className="database-virtual-spacer"
                          colSpan={columnKeys.length}
                          style={{ height: gap }}
                        />
                      </tr>
                    ) : null}
                    {renderRow(
                      rows[virtualRow.index],
                      virtualRow.index,
                      virtualizer.measureElement
                    )}
                  </Fragment>
                )
              })
            : rows.map((row, index) =>
                renderRow(row, index, virtualizer.measureElement)
              )}
          {renderVirtualRows && paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td
                className="database-virtual-spacer"
                colSpan={columnKeys.length}
                style={{ height: paddingBottom }}
              />
            </tr>
          ) : null}
          {footerRow}
        </tbody>
      </DatabaseTable>
    </div>
  )
}

function useSyncedHorizontalScroll(
  headerRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  syncVersion: unknown
) {
  useLayoutEffect(() => {
    const header = headerRef.current
    const body = bodyRef.current

    if (!header || !body) {
      return
    }

    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
      const syncState = getDatabaseHorizontalScrollSync(
        source,
        target.scrollLeft
      )

      source.style.removeProperty("--database-horizontal-rubber-band-offset")
      delete source.dataset.databaseRubberBand

      if (syncState.isRubberBanding) {
        target.style.setProperty(
          "--database-horizontal-rubber-band-offset",
          `${syncState.rubberBandOffset}px`
        )
        target.dataset.databaseRubberBand = "true"
        return
      }

      target.style.removeProperty("--database-horizontal-rubber-band-offset")
      delete target.dataset.databaseRubberBand

      if (target.scrollLeft !== syncState.scrollLeft) {
        target.scrollLeft = syncState.scrollLeft
      }
    }
    const syncHeaderToBody = () => syncScroll(body, header)
    const syncBodyToHeader = () => syncScroll(header, body)

    syncHeaderToBody()
    body.addEventListener("scroll", syncHeaderToBody, { passive: true })
    header.addEventListener("scroll", syncBodyToHeader, { passive: true })

    return () => {
      body.removeEventListener("scroll", syncHeaderToBody)
      header.removeEventListener("scroll", syncBodyToHeader)
      body.style.removeProperty("--database-horizontal-rubber-band-offset")
      header.style.removeProperty("--database-horizontal-rubber-band-offset")
      delete body.dataset.databaseRubberBand
      delete header.dataset.databaseRubberBand
    }
  }, [bodyRef, headerRef, syncVersion])
}

function DatabaseActiveTableCell({
  cellKey,
  children,
  className,
  isFillTarget,
  isSelected,
  onFillStart,
  onSelect,
  presenceKey,
  selectOnPointerDown,
  wrapContent,
}: {
  cellKey: string
  children: (setActive: (active: boolean) => void) => ReactNode
  className?: string
  isFillTarget?: boolean
  isSelected: boolean
  onFillStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSelect: () => void
  presenceKey: string
  selectOnPointerDown?: boolean
  wrapContent?: boolean
}) {
  const isActive = useDatabaseCellIsActive(cellKey)
  const setActiveCell = useSetActiveDatabaseCell()
  const { cellPresenceByKey } = useDatabaseRealtimeState()
  const presence = cellPresenceByKey[presenceKey] ?? []

  return (
    <td
      className={className}
      data-active={isActive ? "true" : undefined}
      data-fill-target={isFillTarget ? "true" : undefined}
      data-presence={presence.length > 0 ? "true" : undefined}
      data-selected={isSelected ? "true" : undefined}
      data-wrap-content={wrapContent ? "true" : undefined}
      onClick={onSelect}
      onPointerDownCapture={
        selectOnPointerDown
          ? (event) => {
              if (
                (event.target as Element).closest(
                  ".database-page-open, .database-sub-item-toggle"
                )
              ) {
                return
              }

              onSelect()
            }
          : undefined
      }
    >
      {presence.length > 0 ? (
        <div
          aria-hidden="true"
          className="database-cell-presence"
          title={presence.map((item) => item.user.name).join(", ")}
        >
          <span
            className="database-cell-presence-border"
            style={{
              "--database-presence-color": presence[0]?.color,
            } as CSSProperties}
          />
          <span className="database-cell-presence-stack">
            {presence.slice(0, 3).map((collaborator) => (
              <span
                className="database-cell-presence-dot"
                key={collaborator.sessionId}
                style={{
                  "--database-presence-color": collaborator.color,
                } as CSSProperties}
              />
            ))}
          </span>
        </div>
      ) : null}
      {children((active) => setActiveCell(active ? cellKey : null))}
      {isSelected && onFillStart ? (
        <button
          aria-label="Drag vertically to fill value"
          className="database-cell-fill-handle"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onFillStart}
          title="Drag vertically to fill value"
          type="button"
        />
      ) : null}
    </td>
  )
}

function CreateDatabaseRowButton({
  columnCount,
  disabled,
  isPending,
  onClick,
}: {
  columnCount: number
  disabled: boolean
  isPending: boolean
  onClick: () => void
}) {
  return (
    <tr
      className="database-table-create-row"
      data-database-row-drop-footer
    >
      <td colSpan={columnCount}>
        <button
          className="database-table-create"
          disabled={disabled}
          onClick={onClick}
          type="button"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          <span>New page</span>
        </button>
      </td>
    </tr>
  )
}

function areRowLayoutsEqual(left: RowLayout, right: RowLayout) {
  const leftCenterKeys = Object.keys(left.centers)
  const rightCenterKeys = Object.keys(right.centers)

  if (leftCenterKeys.length !== rightCenterKeys.length) {
    return false
  }

  for (const key of leftCenterKeys) {
    if (left.centers[key] !== right.centers[key]) {
      return false
    }
  }

  if (left.dropTops.length !== right.dropTops.length) {
    return false
  }

  return left.dropTops.every((top, index) => top === right.dropTops[index])
}

export function DatabaseTableView() {
  const sidePane = useOptionalPageSidePane()
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    canAddDatabaseProperties,
    addDatabaseProperty,
    addDraggedPageRow,
    propertyValuesByKey,
    databaseConfig,
    databaseId,
    databaseName,
    databaseWorkspaceId,
    editable,
    fetchNextPage,
    getDatabasePageDragPayload,
    groupProperty,
    headerMenusEnabled,
    hasDatabasePageDragPayload,
    hasNextPage,
    isAddingDatabaseProperty,
    isAddingDatabaseRow,
    isFetchingNextPage,
    layoutSettings,
    titlePropertyLabel: nameColumnLabel,
    showPageIconInTitle: nameColumnShowPageIcon,
    addDatabaseRow,
    onOpenPage,
    personOptions,
    properties,
    items: rows,
    savePropertyValue,
    saveDatabaseSorts,
    setViewGroupProperty,
    sortedItems: sortedRows,
    subItemChildRowIdsByParentId,
    subItemDepthByRowId,
    subItemsSettings,
    renameDatabaseProperty,
    updateDatabasePropertyConfig,
    updateNameColumnConfig,
    saveDatabasePropertyOrder,
    visibleProperties,
    workspaceId,
  } = useDatabaseViewContext()
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const undoHistory = useUndoHistory()
  const loadedDatabaseId = requireDatabaseId(databaseId)
  const canEditStructure = editable && (canAddDatabaseProperties ?? true)
  const canUseHeaderMenus = headerMenusEnabled ?? editable
  const nameColumnWrapContent = getNameColumnWrapContent(databaseConfig)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [isExternalRowDragActive, setIsExternalRowDragActive] = useState(false)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    () => new Set()
  )
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null)
  const [cellFillDrag, setCellFillDrag] = useState<CellFillDrag | null>(null)
  const cellFillDragRef = useRef<CellFillDrag | null>(null)
  const propertyValuesByKeyRef = useRef(propertyValuesByKey)
  propertyValuesByKeyRef.current = propertyValuesByKey
  const finishRowDragRef = useRef<() => void>(() => {})
  const rowDragOverlay = useDatabaseRowDragOverlay(finishRowDragRef)
  const [rowDropTarget, setRowDropTarget] =
    useState<DatabaseRowDropTarget | null>(null)
  const rowDropTargetRef = useRef<DatabaseRowDropTarget | null>(null)
  const [groupRowDropTarget, setGroupRowDropTarget] =
    useState<GroupRowDropTarget | null>(null)
  const groupRowDropTargetRef = useRef<GroupRowDropTarget | null>(null)
  const isExternalRowDragActiveRef = useRef(false)
  const rowDropOwner = useMemo(() => ({}), [])
  const [pendingInsertProperty, setPendingInsertProperty] =
    useState<PendingInsertProperty | null>(null)
  const [pendingPropertyInsertOrder, setPendingPropertyInsertOrder] =
    useState<PendingPropertyInsertOrder | null>(null)
  const [pendingFormulaSetup, setPendingFormulaSetup] =
    useState<PendingFormulaSetup | null>(null)
  const [formulaSetupPropertyId, setFormulaSetupPropertyId] = useState<
    string | null
  >(null)
  const [pendingSortedRowReorder, setPendingSortedRowReorder] =
    useState<PendingSortedRowReorder | null>(null)
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
  const [dragColumnOrder, setDragColumnOrder] = useState<string[] | null>(null)
  const dragColumnOrderRef = useRef<string[] | null>(null)
  const [pendingColumnOrder, setPendingColumnOrder] = useState<string[] | null>(
    null
  )
  const suppressPropertyHeaderClickRef = useRef(false)
  const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
    null
  )
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({})
  const [collapsedSubItemRowIds, setCollapsedSubItemRowIds] = useState<
    Set<string>
  >(() => new Set())
  const [expandedEmptySubItemRowIds, setExpandedEmptySubItemRowIds] = useState<
    Set<string>
  >(() => new Set())
  const stickyHeaderScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [rowLayout, setRowLayout] = useState<RowLayout>({
    centers: {},
    dropTops: [],
  })
  const rowLayoutRef = useRef(rowLayout)
  rowLayoutRef.current = rowLayout
  const activeEditingPropertyKey =
    getPropertyKeyFromHeaderEditingKey(editingPropertyKey)
  const isTableSorted = activeDatabaseSorts.length > 0
  const isTableFiltered = activeDatabaseFilters.length > 0
  const isTableGrouped = Boolean(groupProperty)
  const isSubItemsNested =
    subItemsSettings.enabled &&
    subItemsSettings.display === "nested" &&
    !isTableGrouped
  const renderedProperties = visibleProperties
  const tableMeasurementKey = useMemo(
    () =>
      [
        nameColumnWrapContent ? "name-wrap" : "name-nowrap",
        ...renderedProperties.map((property) =>
          getPropertyWrapContent(property.property.config)
            ? `${property.id}:wrap`
            : `${property.id}:nowrap`
        ),
      ].join("|"),
    [nameColumnWrapContent, renderedProperties]
  )
  const propertiesById = useMemo(
    () =>
      new Map(renderedProperties.map((property) => [property.id, property])),
    [renderedProperties]
  )
  const baseColumnIds = useMemo(
    () => [
      DATABASE_NAME_COLUMN_ID,
      ...renderedProperties.map((property) => property.id),
    ],
    [renderedProperties]
  )
  const savedColumnIds = useMemo(() => {
    const configuredColumnOrder = getDatabasePropertyOrder(databaseConfig)

    return configuredColumnOrder.includes(DATABASE_NAME_COLUMN_ID)
      ? getMergedColumnIds(baseColumnIds, configuredColumnOrder)
      : baseColumnIds
  }, [baseColumnIds, databaseConfig])
  const renderedColumnIds = useMemo(
    () =>
      pendingColumnOrder
        ? getMergedColumnIds(baseColumnIds, pendingColumnOrder)
        : savedColumnIds,
    [baseColumnIds, pendingColumnOrder, savedColumnIds]
  )
  const headerColumnIds = useMemo(
    () =>
      dragColumnOrder
        ? getMergedColumnIds(renderedColumnIds, dragColumnOrder)
        : renderedColumnIds,
    [dragColumnOrder, renderedColumnIds]
  )
  useEffect(() => {
    if (
      pendingColumnOrder &&
      areColumnOrdersEqual(pendingColumnOrder, savedColumnIds)
    ) {
      setPendingColumnOrder(null)
    }
  }, [pendingColumnOrder, savedColumnIds])
  useEffect(() => {
    if (!pendingPropertyInsertOrder) {
      return
    }

    const existingPropertyIds = new Set(
      pendingPropertyInsertOrder.existingPropertyIds
    )
    const insertedProperty = renderedProperties.find(
      (property) => !existingPropertyIds.has(property.id)
    )

    if (!insertedProperty) {
      return
    }

    const nextColumnIds = getColumnIdsWithInsertedProperty(
      pendingPropertyInsertOrder,
      insertedProperty.id,
      renderedColumnIds
    )

    setPendingPropertyInsertOrder(null)
    setPendingColumnOrder(nextColumnIds)
    saveDatabasePropertyOrder(nextColumnIds)
  }, [
    pendingPropertyInsertOrder,
    renderedColumnIds,
    renderedProperties,
    saveDatabasePropertyOrder,
  ])
  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions]
  )
  const activeInsertProperty = pendingInsertProperty
  const canReorderRows = editable
  const canReorderColumns = editable && renderedColumnIds.length > 1
  const rowDragTitle = getRowDragTitle({
    canReorder: canReorderRows,
    isFiltered: isTableFiltered,
    isGrouped: isTableGrouped,
    isSorted: isTableSorted,
  })
  const pendingInsertPropertyKey = activeInsertProperty
    ? getInsertPropertyColumnKey(
        activeInsertProperty.sourceColumnKey,
        activeInsertProperty.side
      )
    : null
  const columnKeys = getTableColumnKeys({
    canEditStructure,
    columnIds: renderedColumnIds,
    pendingInsert: activeInsertProperty,
  })
  const tableMinWidth = columnKeys.reduce(
    (width, key) => width + getColumnWidth(columnWidths, key),
    0
  )
  const getInlineTableContentWidth = useCallback(
    () => tableMinWidth,
    [tableMinWidth]
  )
  const {
    isInlineScrollEnabled: isInlineTableScrollEnabled,
    style: tableWrapStyle,
  } = useInlineDatabaseScroll({
    getContentWidth: getInlineTableContentWidth,
    scrollRef: tableScrollRef,
    wrapperRef: tableWrapRef,
  })
  useSyncedHorizontalScroll(
    stickyHeaderScrollRef,
    tableScrollRef,
    `${tableMinWidth}:${isTableGrouped ? "grouped" : "ungrouped"}`
  )
  const { sentinelRef: rowsScrollSentinelRef } = useDatabaseRowsScroll({
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  })
  const groupedSections = useMemo<GroupSection[]>(() => {
    if (!isTableGrouped) {
      return []
    }

    return getDatabaseTableGroupSections({
      groupProperty,
      personOptionsById,
      propertyValuesByKey,
      rows: sortedRows,
    })
  }, [
    groupProperty,
    isTableGrouped,
    personOptionsById,
    propertyValuesByKey,
    sortedRows,
  ])
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  )
  const nestedVisibleRows = useMemo(() => {
    if (!isSubItemsNested || collapsedSubItemRowIds.size === 0) {
      return sortedRows
    }

    return sortedRows.filter((row) => {
      const seen = new Set<string>()
      let parentRowId = row.parentRowId

      while (parentRowId && !seen.has(parentRowId)) {
        if (collapsedSubItemRowIds.has(parentRowId)) return false

        seen.add(parentRowId)
        parentRowId = rowsById.get(parentRowId)?.parentRowId
      }

      return true
    })
  }, [collapsedSubItemRowIds, isSubItemsNested, rowsById, sortedRows])
  const visibleRows = useMemo(
    () =>
      isTableGrouped
        ? groupedSections.flatMap((section) =>
            collapsedGroups[section.id] === true ? [] : section.rows
          )
        : nestedVisibleRows,
    [collapsedGroups, groupedSections, isTableGrouped, nestedVisibleRows]
  )
  const expandedSubItemRowIds = useMemo(() => {
    const expandedRowIds = new Set<string>()

    if (!isSubItemsNested) return expandedRowIds

    for (const row of visibleRows) {
      const hasSubItems =
        (subItemChildRowIdsByParentId[row.id]?.length ?? 0) > 0
      const isExpanded = hasSubItems
        ? !collapsedSubItemRowIds.has(row.id)
        : expandedEmptySubItemRowIds.has(row.id)

      if (isExpanded) expandedRowIds.add(row.id)
    }

    return expandedRowIds
  }, [
    collapsedSubItemRowIds,
    expandedEmptySubItemRowIds,
    isSubItemsNested,
    subItemChildRowIdsByParentId,
    visibleRows,
  ])
  const subItemCreateRowIdsByAfterRowId = useMemo(
    () =>
      getSubItemCreateRowsAfterRow({
        expandedRowIds: expandedSubItemRowIds,
        rows: visibleRows,
      }),
    [expandedSubItemRowIds, visibleRows]
  )
  const visibleRowIndexById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index])),
    [visibleRows]
  )
  const visibleRowIds = useMemo(
    () => visibleRows.map((row) => row.id),
    [visibleRows]
  )
  const fillTargetRowIds = useMemo(
    () =>
      new Set(
        cellFillDrag
          ? getDatabaseCellFillRowIds(
              visibleRowIds,
              cellFillDrag.sourceRowId,
              cellFillDrag.targetRowId
            )
          : []
      ),
    [cellFillDrag, visibleRowIds]
  )
  const groupSectionByRowId = useMemo(() => {
    const sectionsByRowId = new Map<string, GroupSection>()

    groupedSections.forEach((section) => {
      section.rows.forEach((row) => sectionsByRowId.set(row.id, section))
    })

    return sectionsByRowId
  }, [groupedSections])
  const getRowElements = useCallback(() => {
    return Array.from(
      tableWrapRef.current?.querySelectorAll<HTMLTableRowElement>(
        ".database-table tbody tr[data-database-row-id]"
      ) ?? []
    )
  }, [])
  const getRowLayoutElement = useCallback(() => {
    const wrapperElement = tableWrapRef.current

    if (!isInlineTableScrollEnabled) {
      return wrapperElement
    }

    return (
      tableScrollRef.current?.querySelector<HTMLElement>(
        ".database-table-scroll-content"
      ) ?? wrapperElement
    )
  }, [isInlineTableScrollEnabled])
  const measureRows = useCallback(() => {
    const layoutElement = getRowLayoutElement()

    if (!layoutElement) {
      const emptyLayout = { centers: {}, dropTops: [] }
      rowLayoutRef.current = emptyLayout
      return emptyLayout
    }

    const layoutRect = layoutElement.getBoundingClientRect()
    const rowElements = getRowElements()
    const centers: Record<string, number> = {}
    const dropTops: number[] = []

    rowElements.forEach((rowElement, index) => {
      const rect = rowElement.getBoundingClientRect()
      const top = rect.top - layoutRect.top
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

    if (rowElements.length === 0) {
      const footerElement = layoutElement.querySelector<HTMLElement>(
        "[data-database-row-drop-footer]"
      )

      if (footerElement) {
        dropTops[0] =
          footerElement.getBoundingClientRect().top - layoutRect.top
      }
    }

    const nextLayout = { centers, dropTops }
    rowLayoutRef.current = nextLayout

    setRowLayout((currentLayout) =>
      areRowLayoutsEqual(currentLayout, nextLayout) ? currentLayout : nextLayout
    )

    return nextLayout
  }, [getRowElements, getRowLayoutElement])
  const resolveRowDropTarget = (clientY: number) => {
    const layoutElement = getRowLayoutElement()

    if (!layoutElement) {
      return null
    }

    const relativeY = clientY - layoutElement.getBoundingClientRect().top

    return getDatabaseRowDropTarget(
      rowLayoutRef.current.dropTops,
      relativeY
    )
  }
  const updateRowDropTarget = (nextTarget: DatabaseRowDropTarget | null) => {
    rowDropTargetRef.current = nextTarget
    setRowDropTarget((currentTarget) =>
      currentTarget?.index === nextTarget?.index &&
      currentTarget?.lineTop === nextTarget?.lineTop
        ? currentTarget
        : nextTarget
    )
  }
  const updateGroupRowDropTarget = (nextTarget: GroupRowDropTarget | null) => {
    groupRowDropTargetRef.current = nextTarget
    setGroupRowDropTarget((currentTarget) =>
      currentTarget?.localTargetIndex === nextTarget?.localTargetIndex &&
      currentTarget?.sectionId === nextTarget?.sectionId &&
      currentTarget?.top === nextTarget?.top
        ? currentTarget
        : nextTarget
    )
  }
  const getGroupRowDropTarget = (clientY: number): GroupRowDropTarget | null => {
    const wrapperElement = tableWrapRef.current

    if (!wrapperElement) {
      return null
    }

    const groupElements = Array.from(
      wrapperElement.querySelectorAll<HTMLElement>(
        ".database-table-group[data-database-group-id]"
      )
    )
    const groupElement =
      groupElements.find((element) => {
        const rect = element.getBoundingClientRect()

        return clientY >= rect.top && clientY <= rect.bottom
      }) ??
      groupElements.reduce<HTMLElement | null>((closest, element) => {
        if (!closest) return element

        const rect = element.getBoundingClientRect()
        const closestRect = closest.getBoundingClientRect()
        const distance = Math.min(
          Math.abs(clientY - rect.top),
          Math.abs(clientY - rect.bottom)
        )
        const closestDistance = Math.min(
          Math.abs(clientY - closestRect.top),
          Math.abs(clientY - closestRect.bottom)
        )

        return distance < closestDistance ? element : closest
      }, null)

    if (!groupElement?.dataset.databaseGroupId) {
      return null
    }

    const rowElements = Array.from(
      groupElement.querySelectorAll<HTMLTableRowElement>(
        "tbody tr[data-database-row-id]"
      )
    )
    const localTargetIndex = rowElements.findIndex((rowElement) => {
      const rect = rowElement.getBoundingClientRect()

      return clientY < rect.top + rect.height / 2
    })
    const resolvedTargetIndex =
      localTargetIndex === -1 ? rowElements.length : localTargetIndex
    const targetRow = rowElements[resolvedTargetIndex]
    const previousRow = rowElements[resolvedTargetIndex - 1]
    const groupRect = groupElement.getBoundingClientRect()
    const layoutRect = getRowLayoutElement()?.getBoundingClientRect()

    if (!layoutRect) {
      return null
    }

    const top =
      (targetRow?.getBoundingClientRect().top ??
        previousRow?.getBoundingClientRect().bottom ??
        groupRect.bottom) - layoutRect.top

    return {
      localTargetIndex: resolvedTargetIndex,
      sectionId: groupElement.dataset.databaseGroupId,
      top,
    }
  }
  const getGroupSectionForRowId = (rowId: string) => {
    if (!isTableGrouped) {
      return null
    }

    return groupSectionByRowId.get(rowId) ?? null
  }
  const getDraggedRowGroupDropTarget = () => {
    const activeGroupDropTarget = groupRowDropTargetRef.current

    if (!draggedRowId || !activeGroupDropTarget || !isTableGrouped) {
      return null
    }

    const sourceSection = getGroupSectionForRowId(draggedRowId)

    if (!sourceSection) {
      return null
    }

    const targetSection = groupedSections.find(
      (section) => section.id === activeGroupDropTarget.sectionId
    )

    if (!targetSection) {
      return null
    }

    return {
      isCrossGroup: targetSection.id !== sourceSection.id,
      localTargetIndex: activeGroupDropTarget.localTargetIndex,
      section: targetSection,
      sourceSection,
    }
  }
  const getDraggedRowMove = (): RowMove | null => {
    if (
      !draggedRowId ||
      (isTableGrouped
        ? groupRowDropTargetRef.current === null
        : rowDropTargetRef.current === null)
    ) {
      return null
    }

    if (isTableGrouped) {
      const groupTarget = getDraggedRowGroupDropTarget()

      if (!groupTarget) {
        return null
      }

      if (!groupTarget.isCrossGroup) {
        const rowIds = getFilteredReorderedRowIds(
          rows,
          groupTarget.section.rows,
          draggedRowId,
          groupTarget.localTargetIndex
        )

        return rowIds ? { rowId: draggedRowId, rowIds } : null
      }

      if (!groupProperty || !canUpdateKanbanGroupProperty(groupProperty)) {
        return null
      }

      const draggedRow = rowsById.get(draggedRowId)

      if (!draggedRow) {
        return null
      }

      const rowIds =
        getAnchoredReorderedRowIds(
          rows,
          draggedRowId,
          groupTarget.section.rows,
          groupTarget.localTargetIndex
        ) ?? rows.map((row) => row.id)
      const key = `${draggedRow.pageId}:${groupProperty.property.id}`
      const currentValue = propertyValuesByKey[key] ?? ""
      const nextValue = getDatabaseGroupMoveValue({
        currentValue,
        propertyType: groupProperty.property.type,
        sourceGroupValue: groupTarget.sourceSection.groupValue,
        targetGroupValue: groupTarget.section.groupValue,
      })

      return {
        groupPropertyId: groupProperty.property.id,
        groupValue: serializePropertyValue(
          groupProperty.property.type,
          nextValue
        ),
        rowId: draggedRowId,
        rowIds,
      }
    }

    if (isTableFiltered) {
      const rowIds = getFilteredReorderedRowIds(
        rows,
        sortedRows,
        draggedRowId,
        rowDropTargetRef.current?.index ?? 0
      )

      return rowIds ? { rowId: draggedRowId, rowIds } : null
    }

    const rowIds = getReorderedRowIds(
      isTableSorted ? sortedRows : rows,
      draggedRowId,
      rowDropTargetRef.current?.index ?? 0
    )

    return rowIds ? { rowId: draggedRowId, rowIds } : null
  }
  const applyRowMove = (nextMove: RowMove) => {
    if (!databaseId) {
      return
    }

    if (nextMove.groupPropertyId) {
      moveRow.mutate({
        databaseId,
        groupPropertyId: nextMove.groupPropertyId,
        groupValue: nextMove.groupValue,
        rowId: nextMove.rowId,
        rowIds: nextMove.rowIds,
      })
      return
    }

    reorderRows.mutate({ databaseId, rowIds: nextMove.rowIds })
  }
  const confirmSortedRowReorder = () => {
    if (!databaseId || !pendingSortedRowReorder) {
      setPendingSortedRowReorder(null)
      return
    }

    const nextMove = pendingSortedRowReorder

    setPendingSortedRowReorder(null)
    void saveDatabaseSorts([])
      .then(() => {
        applyRowMove(nextMove)
      })
      .catch(() => {
        toast.error("Couldn't clear sort")
      })
  }
  const clearRowDrag = () => {
    finishDatabaseRowDrag()
    rowDragOverlay.clear()
    setDraggedRowId(null)
    updateRowDropTarget(null)
    updateGroupRowDropTarget(null)
    isExternalRowDragActiveRef.current = false
    setIsExternalRowDragActive(false)
  }
  finishRowDragRef.current = clearRowDrag
  const rowDropLineTop =
    (isTableGrouped ? !groupRowDropTarget : rowDropTarget === null)
      ? null
      : isTableGrouped
        ? groupRowDropTarget?.top ?? null
        : rowDropTarget?.lineTop ?? null
  const conditionalColorsByRowId = useMemo(() => {
    const colorsByRowId = new Map<
      string,
      { propertyColors: Record<string, string>; rowColor?: string }
    >()

    for (const row of sortedRows) {
      const propertyColors: Record<string, string> = {}
      let rowColor: string | undefined

      for (const setting of activeConditionalColors) {
        if (
          !databaseItemMatchesFilter({
            filter: setting.filter,
            item: row,
            personOptionsById,
            properties,
            propertyValuesByKey,
          })
        ) {
          continue
        }

        if (setting.applyTo === "entire-row") {
          rowColor ??= setting.color
        } else {
          propertyColors[setting.filter.propertyId] ??= setting.color
        }
      }

      colorsByRowId.set(row.id, { propertyColors, rowColor })
    }

    return colorsByRowId
  }, [
    activeConditionalColors,
    personOptionsById,
    properties,
    propertyValuesByKey,
    sortedRows,
  ])
  useEffect(() => {
    if (
      activeEditingPropertyKey &&
      activeEditingPropertyKey !== "name" &&
      !renderedProperties.some(
        (property) => property.id === activeEditingPropertyKey
      )
    ) {
      setEditingPropertyKey(null)
    }
  }, [activeEditingPropertyKey, renderedProperties])

  useEffect(() => {
    if (!selectedCellKey) {
      return
    }

    const cellStillExists = visibleRows.some((row) =>
      selectedCellKey.startsWith(`${row.pageId}:`)
    )

    if (!cellStillExists) {
      setSelectedCellKey(null)
    }
  }, [selectedCellKey, visibleRows])

  useEffect(() => {
    const clearSelectionInAnotherTable = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return
      }

      const targetTable = event.target.closest(".database-table-wrap")

      if (targetTable && targetTable !== tableWrapRef.current) {
        setSelectedCellKey(null)
      }
    }

    document.addEventListener("pointerdown", clearSelectionInAnotherTable, true)

    return () =>
      document.removeEventListener(
        "pointerdown",
        clearSelectionInAnotherTable,
        true
      )
  }, [])

  useEffect(() => {
    if (!pendingFormulaSetup) {
      return
    }

    const existingPropertyIds = new Set(pendingFormulaSetup.existingPropertyIds)
    const formulaProperty = properties.find(
      (property) =>
        !existingPropertyIds.has(property.id) &&
        property.property.type === "formula"
    )

    if (!formulaProperty) {
      return
    }

    setFormulaSetupPropertyId(formulaProperty.id)
    setPendingFormulaSetup(null)
  }, [pendingFormulaSetup, properties])

  useEffect(() => {
    if (
      pendingInsertProperty &&
      pendingInsertProperty.sourceColumnKey !== "name" &&
      !renderedProperties.some(
        (property) => property.id === pendingInsertProperty.sourceColumnKey
      )
    ) {
      setPendingInsertProperty(null)
    }
  }, [pendingInsertProperty, renderedProperties])

  useEffect(() => {
    window.addEventListener("resize", measureRows)
    const resizeObserver = new ResizeObserver(() => measureRows())
    const wrapperElement = tableWrapRef.current

    if (wrapperElement) {
      resizeObserver.observe(wrapperElement)
    }

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", measureRows)
    }
  }, [measureRows])

  useEffect(() => {
    if (!draggedRowId && !isExternalRowDragActive) {
      return
    }

    let dropCleanupTimer: number | null = null
    const clearDropVisuals = () => {
      releaseDatabaseRowDropOwner(rowDropOwner)
      updateRowDropTarget(null)
      updateGroupRowDropTarget(null)

      if (!draggedRowId) {
        isExternalRowDragActiveRef.current = false
        setIsExternalRowDragActive(false)
      }
    }
    const clearWhenPointerLeavesTable = (event: DragEvent) => {
      const tableElement = tableWrapRef.current
      const pointerElement = document.elementFromPoint(
        event.clientX,
        event.clientY
      )

      if (
        tableElement &&
        pointerElement &&
        tableElement.contains(pointerElement)
      ) {
        return
      }

      clearDropVisuals()
    }
    const clearAfterDrop = () => {
      if (dropCleanupTimer !== null) {
        window.clearTimeout(dropCleanupTimer)
      }

      dropCleanupTimer = window.setTimeout(clearDropVisuals, 0)
    }

    window.addEventListener("dragover", clearWhenPointerLeavesTable, true)
    window.addEventListener("dragend", clearDropVisuals, true)
    window.addEventListener("drop", clearAfterDrop, true)

    return () => {
      window.removeEventListener("dragover", clearWhenPointerLeavesTable, true)
      window.removeEventListener("dragend", clearDropVisuals, true)
      window.removeEventListener("drop", clearAfterDrop, true)

      if (dropCleanupTimer !== null) {
        window.clearTimeout(dropCleanupTimer)
      }
    }
  }, [draggedRowId, isExternalRowDragActive, rowDropOwner])

  useEffect(
    () =>
      subscribeDatabaseRowDropOwner((owner) => {
        if (owner === rowDropOwner) {
          return
        }

        // Exactly one table owns row-drop feedback. When another database
        // claims the drag, synchronously release this table's previous line.
        updateRowDropTarget(null)
        updateGroupRowDropTarget(null)

        if (!draggedRowId) {
          isExternalRowDragActiveRef.current = false
          setIsExternalRowDragActive(false)
        }
      }),
    [draggedRowId, rowDropOwner]
  )

  const isCellFillDragging = cellFillDrag !== null

  useEffect(() => {
    if (!isCellFillDragging) {
      return
    }

    const clearCellFillDrag = () => {
      cellFillDragRef.current = null
      setCellFillDrag(null)
      document.body.classList.remove("database-cell-fill-cursor")
    }
    const getTargetRowId = (event: globalThis.PointerEvent) =>
      document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLTableRowElement>("tr[data-database-row-id]")
        ?.dataset.databaseRowId ?? null
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const targetRowId = getTargetRowId(event)
      const currentDrag = cellFillDragRef.current

      if (
        !targetRowId ||
        !currentDrag ||
        !visibleRowIndexById.has(targetRowId) ||
        currentDrag.targetRowId === targetRowId
      ) {
        return
      }

      event.preventDefault()
      const nextDrag = { ...currentDrag, targetRowId }

      cellFillDragRef.current = nextDrag
      setCellFillDrag(nextDrag)
    }
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      const currentDrag = cellFillDragRef.current
      const pointerTargetRowId = getTargetRowId(event)

      if (!currentDrag) {
        clearCellFillDrag()
        return
      }

      const targetRowId =
        pointerTargetRowId && visibleRowIndexById.has(pointerTargetRowId)
          ? pointerTargetRowId
          : currentDrag.targetRowId
      const targetRowIds = getDatabaseCellFillRowIds(
        visibleRowIds,
        currentDrag.sourceRowId,
        targetRowId
      )
      const historyChanges: DatabaseCellFillHistoryChange[] = []

      undoHistory.runWithoutRecording(() => {
        for (const targetRowId of targetRowIds) {
          const targetRow = rowsById.get(targetRowId)

          if (!targetRow) {
            continue
          }

          const currentValue =
            propertyValuesByKey[
              `${targetRow.pageId}:${currentDrag.propertyId}`
            ] ?? ""
          const nextValue = Array.isArray(currentDrag.sourceValue)
            ? [...currentDrag.sourceValue]
            : currentDrag.sourceValue

          if (
            areSerializedPropertyValuesEqual(
              currentDrag.propertyType,
              currentValue,
              nextValue
            )
          ) {
            continue
          }

          historyChanges.push({
            nextValue: Array.isArray(nextValue) ? [...nextValue] : nextValue,
            pageId: targetRow.pageId,
            previousValue: Array.isArray(currentValue)
              ? [...currentValue]
              : currentValue,
            propertyId: currentDrag.propertyId,
            propertyType: currentDrag.propertyType,
            rowId: targetRow.id,
          })

          savePropertyValue(
            targetRow.id,
            currentDrag.propertyId,
            currentDrag.propertyType,
            currentValue,
            nextValue
          )
        }
      })

      if (historyChanges.length > 0) {
        let appliedChanges = historyChanges
        let undoneChanges: DatabaseCellFillHistoryChange[] = []

        undoHistory.pushAction({
          label: "Fill database cells",
          redo: () => {
            const redoableChanges = getRedoableDatabaseCellFillChanges(
              undoneChanges,
              propertyValuesByKeyRef.current
            )

            for (const change of redoableChanges) {
              const currentValue =
                propertyValuesByKeyRef.current[
                  `${change.pageId}:${change.propertyId}`
                ] ?? ""

              savePropertyValue(
                change.rowId,
                change.propertyId,
                change.propertyType,
                currentValue,
                change.nextValue
              )
            }

            appliedChanges = redoableChanges
            undoneChanges = []
            return redoableChanges.length > 0
          },
          undo: () => {
            const undoableChanges = getUndoableDatabaseCellFillChanges(
              appliedChanges,
              propertyValuesByKeyRef.current
            )

            undoHistory.runWithoutRecording(() => {
              for (const change of undoableChanges) {
                const currentValue =
                  propertyValuesByKeyRef.current[
                    `${change.pageId}:${change.propertyId}`
                  ] ?? ""

                savePropertyValue(
                  change.rowId,
                  change.propertyId,
                  change.propertyType,
                  currentValue,
                  change.previousValue
                )
              }
            })

            appliedChanges = []
            undoneChanges = undoableChanges
            return undoableChanges.length > 0
          },
        })
      }

      clearCellFillDrag()
    }
    const handlePointerCancel = () => clearCellFillDrag()

    document.body.classList.add("database-cell-fill-cursor")
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      document.body.classList.remove("database-cell-fill-cursor")
    }
  }, [
    isCellFillDragging,
    propertyValuesByKey,
    rowsById,
    savePropertyValue,
    undoHistory,
    visibleRowIds,
    visibleRowIndexById,
  ])

  useLayoutEffect(() => {
    measureRows()
  }, [
    collapsedGroups,
    measureRows,
    renderedColumnIds,
    isExternalRowDragActive,
    draggedRowId,
    visibleRows,
  ])
  const startColumnResize = (
    columnKey: string,
    event: React.PointerEvent<HTMLSpanElement>
  ) => {
    if (!editable) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = getColumnWidth(columnWidths, columnKey)
    let nextWidth = startWidth
    let animationFrame: number | null = null

    const applyWidth = () => {
      animationFrame = null
      const wrapper = tableWrapRef.current

      wrapper
        ?.querySelectorAll<HTMLTableColElement>("col[data-column-id]")
        .forEach((column) => {
          if (column.dataset.columnId === columnKey) {
            column.style.width = `${nextWidth}px`
          }
        })

      wrapper
        ?.querySelectorAll<HTMLElement>(".database-table")
        .forEach((table) => {
          table.style.setProperty(
            "--database-table-min-width",
            `${tableMinWidth + nextWidth - startWidth}px`
          )
        })
    }

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      nextWidth = Math.max(
        databaseColumnMinWidth,
        startWidth + moveEvent.clientX - startX
      )

      if (animationFrame === null) {
        animationFrame = requestAnimationFrame(applyWidth)
      }
    }

    const removeListeners = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
        applyWidth()
      }

      setColumnWidths((widths) => ({ ...widths, [columnKey]: nextWidth }))
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

  const handleEditingPropertyOpenChange = (
    headerScope: string,
    propertyKey: string,
    nextOpen: boolean
  ) => {
    const scopedPropertyKey = getHeaderEditingKey(headerScope, propertyKey)

    setEditingPropertyKey((currentKey: string | null) =>
      nextOpen
        ? scopedPropertyKey
        : currentKey === scopedPropertyKey
          ? null
          : currentKey
    )
  }

  const openInsertPropertyMenu = (
    sourceColumnKey: string,
    sourcePosition: number,
    side: "left" | "right"
  ) => {
    setPendingInsertProperty({
      position: sourcePosition + (side === "right" ? 1 : 0),
      side,
      sourceColumnKey,
    })
  }

  const clearPendingInsertProperty = (insertKey: string) => {
    setPendingInsertProperty((current) => {
      const currentKey = current
        ? getInsertPropertyColumnKey(current.sourceColumnKey, current.side)
        : null

      return currentKey === insertKey ? null : current
    })
  }

  const addDatabasePropertyAndMaybeOpenFormula = (
    type = "text",
    label = "Property",
    position?: number
  ) => {
    if (type === "formula") {
      setPendingFormulaSetup({
        existingPropertyIds: properties.map((property) => property.id),
      })
    }

    addDatabaseProperty(type, label, position)
  }

  const addInsertedDatabaseProperty = (
    type: string,
    label: string,
    position: number,
    insertKey: string
  ) => {
    if (pendingInsertProperty) {
      setPendingPropertyInsertOrder({
        columnIds: headerColumnIds,
        existingPropertyIds: renderedProperties.map((property) => property.id),
        side: pendingInsertProperty.side,
        sourceColumnKey: pendingInsertProperty.sourceColumnKey,
      })
    }

    addDatabasePropertyAndMaybeOpenFormula(type, label, position)
    clearPendingInsertProperty(insertKey)
  }

  const startColumnHeaderReorder = (columnId: string) => {
    if (!canReorderColumns) {
      return
    }

    setEditingPropertyKey(null)
    suppressPropertyHeaderClickRef.current = true
    setDraggedColumnId(columnId)
    dragColumnOrderRef.current = headerColumnIds
  }

  const queueColumnHeaderOrder = (columnIds: string[]) => {
    if (!canReorderColumns) {
      return
    }

    if (areColumnOrdersEqual(dragColumnOrder, columnIds)) {
      return
    }

    dragColumnOrderRef.current = columnIds
    setDragColumnOrder(columnIds)
  }

  const finishColumnHeaderReorder = () => {
    const columnIds = dragColumnOrderRef.current

    if (columnIds && !areColumnOrdersEqual(columnIds, renderedColumnIds)) {
      setPendingColumnOrder(columnIds)
      saveDatabasePropertyOrder(columnIds)
    }

    dragColumnOrderRef.current = null
    setDraggedColumnId(null)
    setDragColumnOrder(null)
    window.setTimeout(() => {
      suppressPropertyHeaderClickRef.current = false
    }, 0)
  }

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  const togglePropertyGrouping = (propertyId: string, isGrouped: boolean) => {
    setViewGroupProperty(isGrouped ? null : propertyId)
  }

  const toggleSelectedRow = (rowId: string, checked: boolean) => {
    setSelectedRowIds((current) => {
      const next = new Set(current)

      if (checked) {
        next.add(rowId)
      } else {
        next.delete(rowId)
      }

      return next
    })
  }

  const startCellFill = (
    row: TableRow,
    propertyId: string,
    propertyType: string,
    sourceValue: string | string[],
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const nextDrag = {
      propertyId,
      propertyType,
      sourceRowId: row.id,
      sourceValue: Array.isArray(sourceValue)
        ? [...sourceValue]
        : sourceValue,
      targetRowId: row.id,
    }

    cellFillDragRef.current = nextDrag
    setCellFillDrag(nextDrag)
  }

  const startRowDrag = (
    row: TableRow,
    event: ReactDragEvent<HTMLButtonElement>
  ) => {
    if (!canReorderRows) {
      return
    }

    const measuredLayout = measureRows()
    const rowElement = tableWrapRef.current?.querySelector(
      `tr[data-database-row-id="${row.id}"]`
    )
    const rowRect = rowElement?.getBoundingClientRect()
    const tableRect = tableWrapRef.current
      ?.querySelector(".database-table")
      ?.getBoundingClientRect()

    if (rowRect && tableRect) {
      const nextOverlay = {
        height: rowRect.height,
        left: rowRect.left,
        offsetX: event.clientX - rowRect.left,
        offsetY: event.clientY - rowRect.top,
        title: getRowTitle(row),
        top: rowRect.top,
        width: tableRect.width,
      }

      rowDragOverlay.start(nextOverlay)
    }

    startDatabaseRowDrag()
    hideNativeDatabaseRowDragPreview(event.dataTransfer)
    setDraggedRowId(row.id)
    claimDatabaseRowDropOwner(rowDropOwner)
    const sourceRowIndex = visibleRowIndexById.get(row.id) ?? 0
    updateRowDropTarget({
      index: sourceRowIndex,
      lineTop: measuredLayout.dropTops[sourceRowIndex] ?? 0,
    })
    const sourceSection = groupSectionByRowId.get(row.id)
    const sourceLocalIndex = sourceSection?.rows.findIndex(
      (sourceRow) => sourceRow.id === row.id
    )

    updateGroupRowDropTarget(
      sourceSection && sourceLocalIndex !== undefined
        ? {
            localTargetIndex: sourceLocalIndex,
            sectionId: sourceSection.id,
            top:
              measuredLayout.dropTops[
                sourceRowIndex
              ] ?? 0,
          }
        : null
    )
    setDatabasePageDragPayload(event.dataTransfer, {
      databaseId: loadedDatabaseId,
      pageId: row.pageId,
      rowId: row.id,
      title: getRowTitle(row),
    })
  }

  const renderInsertPropertyHeader = (insertKey: string, position: number) => (
    <th
      className="database-add-property-cell database-insert-property-cell"
      key={insertKey}
    >
      <AddDatabasePropertyMenu
        disabled={isAddingDatabaseProperty}
        isPending={isAddingDatabaseProperty}
        onAdd={(type, label) =>
          addInsertedDatabaseProperty(type, label, position, insertKey)
        }
        onOpenChange={(open) => {
          if (!open) {
            clearPendingInsertProperty(insertKey)
          }
        }}
        open={pendingInsertPropertyKey === insertKey}
        triggerLabel="Select type"
      />
      <span
        aria-hidden="true"
        className="database-column-resize-handle"
        onPointerDown={(event) => startColumnResize(insertKey, event)}
      />
    </th>
  )

  const renderInsertPropertyCell = (insertKey: string) => (
    <td
      aria-hidden="true"
      className="database-value-cell database-insert-property-placeholder"
      key={insertKey}
    />
  )
  const renderTableHeader = (headerScope = "default") => (
    <thead>
      <Reorder.Group
        as="tr"
        axis="x"
        values={headerColumnIds}
        onReorder={queueColumnHeaderOrder}
      >
        {headerColumnIds.map((columnId) => {
          const leftInsertKey = getInsertPropertyColumnKey(columnId, "left")
          const rightInsertKey = getInsertPropertyColumnKey(columnId, "right")
          const showLeftInsert = pendingInsertPropertyKey === leftInsertKey
          const showRightInsert = pendingInsertPropertyKey === rightInsertKey
          const property = propertiesById.get(columnId)
          const propertyWrapContent = property
            ? getPropertyWrapContent(property.property.config)
            : false

          return (
            <Fragment key={columnId}>
              {showLeftInsert
                ? renderInsertPropertyHeader(
                    leftInsertKey,
                    pendingInsertProperty?.position ?? property?.position ?? 0
                  )
                : null}
              <DatabaseHeaderReorderItem
                canReorder={canReorderColumns}
                className={
                  columnId === DATABASE_NAME_COLUMN_ID
                    ? "database-name-header"
                    : "database-property-header"
                }
                headerScope={headerScope}
                isDragging={draggedColumnId === columnId}
                columnId={columnId}
                onDragEnd={finishColumnHeaderReorder}
                onDragStart={() => startColumnHeaderReorder(columnId)}
              >
                {(startHeaderDrag) => (
                  <>
                    {columnId === DATABASE_NAME_COLUMN_ID ? (
                      canUseHeaderMenus ? (
                        <DatabaseNamePropertyMenu
                          config={databaseConfig}
                          databaseId={loadedDatabaseId}
                          isGrouped={groupProperty?.id === "name"}
                          onOpenChange={(open) =>
                            handleEditingPropertyOpenChange(
                              headerScope,
                              "name",
                              open
                            )
                          }
                          onInsertProperty={(side) =>
                            openInsertPropertyMenu("name", 0, side)
                          }
                          onToggleGroup={() =>
                            togglePropertyGrouping(
                              "name",
                              groupProperty?.id === "name"
                            )
                          }
                          open={
                            editingPropertyKey ===
                            getHeaderEditingKey(headerScope, "name")
                          }
                          schemaActionsEnabled={canEditStructure}
                          sortDirection={
                            activeDatabaseSorts.find(
                              (sort) => sort.column === "name"
                            )?.direction
                          }
                          onSort={(direction) =>
                            void saveDatabaseSorts([
                              ...activeDatabaseSorts.filter(
                                (sort) => sort.column !== "name"
                              ),
                              { column: "name", direction },
                            ])
                          }
                          onUpdateConfig={(config) =>
                            void updateNameColumnConfig?.(config)
                          }
                          triggerDragProps={{
                            onClick: (event) => {
                              if (suppressPropertyHeaderClickRef.current) {
                                event.preventDefault()
                                event.stopPropagation()
                                suppressPropertyHeaderClickRef.current = false
                                return
                              }

                              handleEditingPropertyOpenChange(
                                headerScope,
                                "name",
                                true
                              )
                            },
                            onPointerDownCapture: startHeaderDrag,
                            title: canReorderColumns
                              ? "Drag to reorder column"
                              : undefined,
                          }}
                          wrapContent={nameColumnWrapContent}
                        />
                      ) : (
                        <span
                          className="database-name-header-content"
                          onPointerDownCapture={startHeaderDrag}
                          title={
                            canReorderColumns
                              ? "Drag to reorder column"
                              : undefined
                          }
                        >
                          <span>Aa</span>
                          <span>{nameColumnLabel}</span>
                        </span>
                      )
                    ) : property && canUseHeaderMenus ? (
                      <DatabasePropertyMenu
                        config={property.property.config}
                        databaseConfig={databaseConfig}
                        databaseId={loadedDatabaseId}
                        databasePropertyId={property.id}
                        isGrouped={
                          groupProperty?.property.id === property.property.id
                        }
                        name={property.property.name}
                        onOpenChange={(open) =>
                          handleEditingPropertyOpenChange(
                            headerScope,
                            property.id,
                            open
                          )
                        }
                        onInsertProperty={(side) =>
                          openInsertPropertyMenu(
                            property.id,
                            property.position,
                            side
                          )
                        }
                        onEditFormula={() =>
                          setFormulaSetupPropertyId(property.id)
                        }
                        onRename={(name) =>
                          renameDatabaseProperty(property.id, name)
                        }
                        onToggleGroup={() =>
                          togglePropertyGrouping(
                            property.property.id,
                            groupProperty?.property.id === property.property.id
                          )
                        }
                        open={
                          editingPropertyKey ===
                          getHeaderEditingKey(headerScope, property.id)
                        }
                        schemaActionsEnabled={canEditStructure}
                        sortDirection={
                          activeDatabaseSorts.find(
                            (sort) => sort.column === property.id
                          )?.direction
                        }
                        sourceDatabaseId={loadedDatabaseId}
                        sourceDatabaseName={databaseName}
                        sourcePropertyId={property.property.id}
                        onSort={(direction) =>
                          void saveDatabaseSorts([
                            ...activeDatabaseSorts.filter(
                              (sort) => sort.column !== property.id
                            ),
                            { column: property.id, direction },
                          ])
                        }
                        onUpdateConfig={(config) =>
                          void updateDatabasePropertyConfig(property.id, config)
                        }
                        triggerDragProps={{
                          onClick: (event) => {
                            if (suppressPropertyHeaderClickRef.current) {
                              event.preventDefault()
                              event.stopPropagation()
                              suppressPropertyHeaderClickRef.current = false
                              return
                            }

                            handleEditingPropertyOpenChange(
                              headerScope,
                              property.id,
                              true
                            )
                          },
                          onPointerDownCapture: startHeaderDrag,
                          title: canReorderColumns
                            ? "Drag to reorder column"
                            : undefined,
                        }}
                        type={property.property.type}
                        wrapContent={propertyWrapContent}
                        workspaceId={workspaceId ?? databaseWorkspaceId}
                      />
                    ) : property ? (
                      <span
                        className="database-property-header-label"
                        onPointerDownCapture={startHeaderDrag}
                        title={
                          canReorderColumns
                            ? "Drag to reorder column"
                            : undefined
                        }
                      >
                        {property.property.name}
                      </span>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className="database-column-resize-handle"
                      onPointerDown={(event) =>
                        startColumnResize(columnId, event)
                      }
                    />
                  </>
                )}
              </DatabaseHeaderReorderItem>
              {showRightInsert
                ? renderInsertPropertyHeader(
                    rightInsertKey,
                    pendingInsertProperty?.position ??
                      (property?.position ?? 0) + 1
                  )
                : null}
            </Fragment>
          )
        })}
        {canEditStructure ? (
          <th className="database-add-property-cell">
            <AddDatabasePropertyMenu
              disabled={isAddingDatabaseProperty}
              isPending={isAddingDatabaseProperty}
              onAdd={addDatabasePropertyAndMaybeOpenFormula}
            />
            <span
              aria-hidden="true"
              className="database-column-resize-handle"
              onPointerDown={(event) =>
                startColumnResize(ADD_PROPERTY_COLUMN_ID, event)
              }
            />
          </th>
        ) : null}
      </Reorder.Group>
    </thead>
  )

  const renderTableRow = (
    row: TableRow,
    index: number,
    measureElement: (node: Element | null) => void
  ) => {
        const conditionalColors = conditionalColorsByRowId.get(row.id) ?? {
          propertyColors: {},
          rowColor: undefined,
        }
        const nameCellKey = `${row.pageId}:name`

        const childRowIds = subItemChildRowIdsByParentId[row.id] ?? []
        const hasSubItems = childRowIds.length > 0
        const subItemDepth = isSubItemsNested
          ? subItemDepthByRowId[row.id] ?? 0
          : 0
        const subItemsExpanded = hasSubItems
          ? !collapsedSubItemRowIds.has(row.id)
          : expandedEmptySubItemRowIds.has(row.id)
        const showSubItemToggle =
          isSubItemsNested && (hasSubItems || editable)
        const toggleSubItems = () => {
          if (hasSubItems) {
            setCollapsedSubItemRowIds((current) => {
              const next = new Set(current)

              if (next.has(row.id)) next.delete(row.id)
              else next.add(row.id)

              return next
            })
            return
          }

          setExpandedEmptySubItemRowIds((current) => {
            const next = new Set(current)

            if (next.has(row.id)) next.delete(row.id)
            else next.add(row.id)

            return next
          })
        }

        const tableRow = (
          <tr
            className={getConditionalColorClassName(conditionalColors.rowColor)}
            data-index={index}
            data-database-row-id={row.id}
            data-side-pane-open={
              sidePane?.sidePanePageId === row.pageId ? "true" : undefined
            }
            key={row.id}
            onMouseEnter={
              editable
                ? () => {
                    setHoveredRowId(row.id)
                  }
                : undefined
            }
            ref={measureElement}
          >
            {renderedColumnIds.map((columnId) => {
              const leftInsertKey = getInsertPropertyColumnKey(columnId, "left")
              const rightInsertKey = getInsertPropertyColumnKey(
                columnId,
                "right"
              )
              const showLeftInsert = pendingInsertPropertyKey === leftInsertKey
              const showRightInsert =
                pendingInsertPropertyKey === rightInsertKey
              const property = propertiesById.get(columnId)

              if (columnId === DATABASE_NAME_COLUMN_ID) {
                return (
                  <Fragment key={columnId}>
                    {showLeftInsert
                      ? renderInsertPropertyCell(leftInsertKey)
                      : null}
                    <DatabaseActiveTableCell
                      cellKey={nameCellKey}
                      isSelected={selectedCellKey === nameCellKey}
                      onSelect={() => setSelectedCellKey(nameCellKey)}
                      presenceKey={`${row.id}:name`}
                      selectOnPointerDown
                      className={cn(
                        "database-page-cell",
                        getConditionalColorClassName(
                          conditionalColors.propertyColors.name
                        )
                      )}
                      wrapContent={nameColumnWrapContent}
                    >
                      {(setActive) => (
                        <div
                          className="database-sub-item-name"
                          data-sub-item-depth={subItemDepth}
                          style={
                            isSubItemsNested
                              ? ({
                                  "--database-sub-item-depth": subItemDepth,
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          {showSubItemToggle ? (
                            <button
                              aria-expanded={subItemsExpanded}
                              aria-label={`${subItemsExpanded ? "Collapse" : "Expand"} sub-items for ${getRowTitle(row)}`}
                              className="database-sub-item-toggle"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                toggleSubItems()
                              }}
                              onPointerDown={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                              }}
                              type="button"
                            >
                              {subItemsExpanded ? (
                                <ChevronDown />
                              ) : (
                                <ChevronRight />
                              )}
                            </button>
                          ) : null}
                          <DatabaseCellContent
                            wrapContent={nameColumnWrapContent}
                          >
                            <DatabasePageLink
                              editable={editable}
                              onActiveChange={setActive}
                              onOpen={onOpenPage}
                              pageId={row.pageId}
                              pageSummary={row.page}
                              showPageIcon={nameColumnShowPageIcon}
                            />
                          </DatabaseCellContent>
                        </div>
                      )}
                    </DatabaseActiveTableCell>
                    {showRightInsert
                      ? renderInsertPropertyCell(rightInsertKey)
                      : null}
                  </Fragment>
                )
              }

              if (!property) {
                return null
              }

              const pageProperty = property.property
              const key = `${row.pageId}:${pageProperty.id}`
              const persistedValue = propertyValuesByKey[key] ?? ""
              const wrapContent = getPropertyWrapContent(pageProperty.config)

              return (
                <Fragment key={property.id}>
                  {showLeftInsert
                    ? renderInsertPropertyCell(leftInsertKey)
                    : null}
                  <DatabaseActiveTableCell
                    cellKey={key}
                    isFillTarget={
                      cellFillDrag?.propertyId === pageProperty.id &&
                      fillTargetRowIds.has(row.id)
                    }
                    isSelected={selectedCellKey === key}
                    onFillStart={
                      editable &&
                      isDatabasePropertyFillable(pageProperty.type)
                        ? (event) =>
                            startCellFill(
                              row,
                              pageProperty.id,
                              pageProperty.type,
                              persistedValue,
                              event
                            )
                        : undefined
                    }
                    onSelect={() => setSelectedCellKey(key)}
                    presenceKey={`${row.id}:${pageProperty.id}`}
                    className={cn(
                      "database-value-cell",
                      getConditionalColorClassName(
                        conditionalColors.propertyColors[property.id]
                      )
                    )}
                    wrapContent={wrapContent}
                  >
                    {() => (
                      <DatabaseCellContent wrapContent={wrapContent}>
                        <DatabasePropertyValue
                          editable={editable}
                          properties={properties}
                          propertyValuesByKey={propertyValuesByKey}
                          onPropertyConfigChange={(databasePropertyId, config) =>
                            updateDatabasePropertyConfig(
                              databasePropertyId,
                              config
                            )
                          }
                          onSaveValue={savePropertyValue}
                          persistedValue={persistedValue}
                          personOptions={personOptions}
                          property={property}
                          row={row}
                          titlePropertyLabel={nameColumnLabel}
                          wrapContent={wrapContent}
                        />
                      </DatabaseCellContent>
                    )}
                  </DatabaseActiveTableCell>
                  {showRightInsert
                    ? renderInsertPropertyCell(rightInsertKey)
                    : null}
                </Fragment>
              )
            })}
            {editable ? <td /> : null}
          </tr>
        )

        const subItemCreateRowIds =
          subItemCreateRowIdsByAfterRowId[row.id] ?? []

        if (!editable || subItemCreateRowIds.length === 0) {
          return tableRow
        }

        return (
          <Fragment key={row.id}>
            {tableRow}
            {subItemCreateRowIds.map((parentRowId) => (
              <tr
                className="database-sub-item-create-row"
                key={`create-sub-item:${parentRowId}`}
              >
                <td colSpan={columnKeys.length}>
                  <button
                    className="database-sub-item-create"
                    disabled={!databaseId || isAddingDatabaseRow}
                    onClick={() =>
                      addDatabaseRow(undefined, undefined, parentRowId)
                    }
                    style={
                      {
                        "--database-sub-item-depth":
                          (subItemDepthByRowId[parentRowId] ?? 0) + 1,
                      } as CSSProperties
                    }
                    type="button"
                  >
                    {isAddingDatabaseRow ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    <span>New sub-item</span>
                  </button>
                </td>
              </tr>
            ))}
          </Fragment>
        )
  }

  const renderRowDragRail = () =>
    editable ? (
      <div className="database-row-drag-rail">
        {visibleRows.map((row) => {
          const rowCenter = rowLayout.centers[row.id]

          if (rowCenter === undefined) {
            return null
          }

          const isRowHandleVisible =
            hoveredRowId === row.id || draggedRowId === row.id

          return (
            <div
              className="database-row-controls"
              data-visible={isRowHandleVisible ? "true" : undefined}
              key={row.id}
              onMouseEnter={() => {
                setHoveredRowId(row.id)
              }}
              onMouseLeave={() => {
                if (!draggedRowId) {
                  setHoveredRowId(null)
                }
              }}
              style={{ top: rowCenter }}
            >
              <button
                aria-label={`Drag ${getRowTitle(row)}`}
                className="database-row-drag-handle"
                data-database-row-drag-handle
                data-dragging={draggedRowId === row.id ? "true" : undefined}
                disabled={!canReorderRows}
                draggable={canReorderRows}
                onClick={(event) => event.preventDefault()}
                onDragEnd={clearRowDrag}
                onDragStart={(event) => startRowDrag(row, event)}
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
                  toggleSelectedRow(row.id, checked === true)
                }
              />
            </div>
          )
        })}
      </div>
    ) : null

  const renderRowDropLine = () =>
    rowDropLineTop !== null ? (
      <div
        aria-hidden="true"
        className="drag-drop-line database-row-drop-line"
        data-orientation="horizontal"
        style={{ top: rowDropLineTop }}
      />
    ) : null

  return (
    <>
      <div
        className="database-table-wrap database-inline-scroll-wrap"
        data-inline-scroll={isInlineTableScrollEnabled ? "true" : undefined}
        data-vertical-lines={
          layoutSettings.showVerticalLines ? "true" : "false"
        }
        ref={tableWrapRef}
        style={tableWrapStyle}
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
            releaseDatabaseRowDropOwner(rowDropOwner)
            updateRowDropTarget(null)
            updateGroupRowDropTarget(null)
            isExternalRowDragActiveRef.current = false
            setIsExternalRowDragActive(false)
          }
        }}
        onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
          const hasDragPayload =
            !isTableGrouped && hasDatabasePageDragPayload(event.dataTransfer)

          if (!draggedRowId && !hasDragPayload) {
            return
          }

          if (
            !draggedRowId &&
            hasDragPayload &&
            !isExternalRowDragActiveRef.current
          ) {
            isExternalRowDragActiveRef.current = true
            setIsExternalRowDragActive(true)
            measureRows()
          }

          event.preventDefault()
          claimDatabaseRowDropOwner(rowDropOwner)
          // Keep propagating so the editor clears its previous block drop line
          // and the source table can release its local drop indicator.
          event.dataTransfer.dropEffect = "move"
          if (isTableGrouped) {
            updateGroupRowDropTarget(getGroupRowDropTarget(event.clientY))
          } else {
            updateRowDropTarget(resolveRowDropTarget(event.clientY))
          }
        }}
        onDrop={(event) => {
          if (isTableGrouped && !draggedRowId) {
            return
          }

          const dragPayload = getDatabasePageDragPayload(event.dataTransfer)
          const resolvedRowTarget = isTableGrouped
            ? null
            : resolveRowDropTarget(event.clientY)

          if (isTableGrouped) {
            updateGroupRowDropTarget(getGroupRowDropTarget(event.clientY))
          } else {
            updateRowDropTarget(resolvedRowTarget)
          }

          const hasDropTarget = isTableGrouped
            ? groupRowDropTargetRef.current !== null
            : resolvedRowTarget !== null

          if ((!draggedRowId && !dragPayload) || !hasDropTarget) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          if (draggedRowId) {
            const nextMove = getDraggedRowMove()

            if (isTableSorted) {
              if (nextMove) {
                setPendingSortedRowReorder(nextMove)
              }
            } else if (nextMove) {
              applyRowMove(nextMove)
            }
          } else if (dragPayload) {
            addDraggedPageRow(dragPayload, resolvedRowTarget?.index ?? 0)
          }
          clearRowDrag()
        }}
      >
        {!isInlineTableScrollEnabled ? renderRowDragRail() : null}
        {!isInlineTableScrollEnabled ? renderRowDropLine() : null}
        <div
          className="database-table-sticky-header database-inline-scroll"
          ref={stickyHeaderScrollRef}
        >
          <div className="database-table-scroll-content database-inline-scroll-content">
            <DatabaseTable
              columnKeys={columnKeys}
              columnWidths={columnWidths}
              tableMinWidth={tableMinWidth}
            >
              {renderTableHeader("sticky")}
            </DatabaseTable>
          </div>
        </div>
        <div
          className="database-table-scroll database-inline-scroll"
          ref={tableScrollRef}
        >
          <div className="database-table-scroll-content database-inline-scroll-content">
            {isInlineTableScrollEnabled ? renderRowDragRail() : null}
            {isInlineTableScrollEnabled ? renderRowDropLine() : null}
            {isTableGrouped ? (
              <div className="database-table-groups">
                {groupedSections.map((section) => {
                  const isCollapsed = collapsedGroups[section.id] === true

                  return (
                    <section
                      className="database-table-group"
                      data-database-group-id={section.id}
                      data-drag-over={
                        groupRowDropTarget?.sectionId === section.id
                          ? "true"
                          : undefined
                      }
                      key={section.id}
                    >
                      <button
                        aria-expanded={!isCollapsed}
                        className="database-table-group-toggle"
                        onClick={() => toggleGroupCollapsed(section.id)}
                        type="button"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="size-4 shrink-0" />
                        ) : (
                          <ChevronDown className="size-4 shrink-0" />
                        )}
                        <span
                          className={getColorTokenBadgeClassName(section.color)}
                        >
                          <span
                            aria-hidden="true"
                            className={getColorTokenDotClassName(section.color)}
                          />
                          {section.name}
                        </span>
                        <span className="database-table-group-count">
                          {section.rows.length}
                        </span>
                      </button>
                      {!isCollapsed ? (
                        <>
                          <DatabaseVirtualizedTable
                            columnKeys={columnKeys}
                            columnWidths={columnWidths}
                            footerRow={
                              editable &&
                              !section.isEmpty &&
                              groupProperty &&
                              canCreateRowInKanbanGroup(groupProperty) ? (
                                <CreateDatabaseRowButton
                                  columnCount={columnKeys.length}
                                  disabled={!databaseId || isAddingDatabaseRow}
                                  isPending={isAddingDatabaseRow}
                                  onClick={() =>
                                    addDatabaseRow(
                                      section.groupValue,
                                      groupProperty
                                    )
                                  }
                                />
                              ) : undefined
                            }
                            measurementKey={tableMeasurementKey}
                            renderRow={renderTableRow}
                            rows={section.rows}
                            tableMinWidth={tableMinWidth}
                            virtualizationEnabled={
                              !draggedRowId && !isExternalRowDragActive
                            }
                          />
                        </>
                      ) : null}
                    </section>
                  )
                })}
              </div>
            ) : (
              <DatabaseVirtualizedTable
                columnKeys={columnKeys}
                columnWidths={columnWidths}
                footerRow={
                  editable ? (
                    <CreateDatabaseRowButton
                      columnCount={columnKeys.length}
                      disabled={!databaseId || isAddingDatabaseRow}
                      isPending={isAddingDatabaseRow}
                      onClick={() => addDatabaseRow()}
                    />
                  ) : undefined
                }
                measurementKey={tableMeasurementKey}
                renderRow={renderTableRow}
                rows={visibleRows}
                tableMinWidth={tableMinWidth}
                virtualizationEnabled={
                  !draggedRowId &&
                  !isExternalRowDragActive &&
                  !isSubItemsNested
                }
              />
            )}
            {hasNextPage || isFetchingNextPage ? (
              <div
                aria-hidden={!isFetchingNextPage}
                className="database-rows-pagination-status flex items-center justify-center gap-2 px-4 py-3 text-sm text-muted-foreground"
                ref={rowsScrollSentinelRef}
                style={getTableMinWidthStyle(tableMinWidth)}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Loading more rows...</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {rowDragOverlay.overlay
        ? createPortal(
            <div
              aria-hidden="true"
              className="database-row-drag-overlay"
              ref={rowDragOverlay.elementRef}
              style={{
                height: rowDragOverlay.overlay.height,
                left: 0,
                top: 0,
                transform: `translate3d(${rowDragOverlay.positionRef.current.left}px, ${rowDragOverlay.positionRef.current.top}px, 0)`,
                width: rowDragOverlay.overlay.width,
              }}
            >
              <span className="database-row-drag-overlay-cell">
                <FileText />
                <span>{rowDragOverlay.overlay.title}</span>
              </span>
            </div>,
            document.body
          )
        : null}
      <DatabaseFormulaDialog
        databasePropertyId={formulaSetupPropertyId}
        onOpenChange={(open) => {
          if (!open) {
            setFormulaSetupPropertyId(null)
          }
        }}
        open={formulaSetupPropertyId !== null}
      />
      <AlertDialog
        open={pendingSortedRowReorder !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSortedRowReorder(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
            <AlertDialogDescription>
              Row order is manual. To save this move, Zilobase needs to clear the
              active sorting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSortedRowReorder}>
              Clear sorting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
