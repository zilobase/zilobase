import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
} from "react"
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
} from "@notelab/features/databases"
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
import { cn } from "@/lib/utils"
import {
  getColorToken,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/packages/editor/components/editor/toolbar-data"

import { AddDatabasePropertyMenu } from "../shared/add-database-property-menu"
import { DatabaseTableCellContent } from "./database-table-cell-content"
import {
  databaseAddPropertyColumnDefaultWidth,
  databaseColumnMinWidth,
  databaseNameColumnDefaultWidth,
  defaultStatusOptions,
  DATABASE_PAGE_DRAG_MIME,
} from "../constants"
import { DatabasePageLink } from "../shared/database-page-link"
import {
  DatabaseNamePropertyMenu,
  DatabasePropertyMenu,
} from "../shared/database-property-menu"
import { DatabasePropertyValue } from "../shared/database-property-value"
import {
  serializePropertyValue,
} from "../utils"
import {
  getNameColumnWrapContent,
  getPropertyWrapContent,
} from "../shared/database-view-config"
import { useDatabaseViewContext } from "../shared/database-view-context"
import { useInlineDatabaseScroll } from "../shared/use-inline-database-scroll"
import { databaseItemMatchesFilter } from "../shared/database-item-utils"
import {
  getDatabaseGroupMoveValue,
  getRawDatabaseGroupValue,
} from "../shared/database-group-values"
import {
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
  getGroupedReorderedRowIds,
  getReorderedRowIds,
  hideNativeDatabaseRowDragPreview,
  type DatabaseRowDragOverlay,
} from "../shared/database-row-drag"

type InsertPropertySide = "left" | "right"

type PendingInsertProperty = {
  position: number
  side: InsertPropertySide
  sourceColumnKey: string
}

type PendingSortedRowReorder = {
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
}

type RowMove = PendingSortedRowReorder

type GroupSection = {
  color?: string
  groupValue: string
  id: string
  isEmpty: boolean
  name: string
  rows: any[]
}

type GroupSectionDraft = Omit<GroupSection, "rows"> & {
  rows: any[]
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

function requireDatabaseId(databaseId: string | null | undefined) {
  if (!databaseId) {
    throw new Error("DatabaseTableView requires a Database id.")
  }

  return databaseId
}

function getColumnWidth(columnWidths: Record<string, number>, key: string) {
  return (
    columnWidths[key] ??
    (key === "name"
      ? databaseNameColumnDefaultWidth
      : key === "add-property"
        ? databaseAddPropertyColumnDefaultWidth
        : key.startsWith("insert-property-")
          ? databaseAddPropertyColumnDefaultWidth
          : databaseColumnMinWidth)
  )
}

function getConditionalColorClassName(color?: string) {
  return color ? getColorToken(color).backgroundClass : undefined
}

function areRowLayoutsEqual(
  left: {
    centers: Record<string, number>
    dropTops: number[]
  },
  right: {
    centers: Record<string, number>
    dropTops: number[]
  }
) {
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

function getConfiguredPropertyOptions(config: unknown) {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return []
  }

  const options = (config as { options?: unknown }).options

  return Array.isArray(options)
    ? options.filter(
        (
          option
        ): option is {
          color?: string
          id: string
          name: string
        } =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as { id?: unknown }).id === "string" &&
          typeof (option as { name?: unknown }).name === "string"
      )
    : []
}

function getRowGroupValue(row: any, groupProperty: any, propertyValuesByKey: any) {
  if (groupProperty.id === "name") {
    return row.page.name?.trim() ?? ""
  }

  const key = `${row.pageId}:${groupProperty.property.id}`
  const value = propertyValuesByKey[key] ?? ""

  return getRawDatabaseGroupValue(value)
}

export function DatabaseTableView() {
  const {
    activeConditionalColors,
    activePropertyValueKey,
    activeDatabaseFilters,
    activeDatabaseSorts,
    addDatabaseProperty,
    addDraggedPageRow,
    propertyValuesByKey,
    databaseConfig,
    databaseId,
    draftPropertyValues,
    editable,
    getDatabasePageDragPayload,
    groupProperty,
    hasDatabasePageDragPayload,
    isAddingDatabaseProperty,
    isAddingDatabaseRow,
    titlePropertyLabel: nameColumnLabel,
    showPageIconInTitle: nameColumnShowPageIcon,
    addDatabaseRow,
    onOpenPage,
    personOptions,
    properties,
    items: rows,
    savePropertyValue,
    saveDatabaseSorts,
    setActivePropertyValueKey,
    setDraftPropertyValues,
    setViewGroupProperty,
    sortedItems: sortedRows,
    renameDatabaseProperty,
    updateDatabasePropertyConfig,
    visibleProperties,
  } = useDatabaseViewContext()
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const loadedDatabaseId = requireDatabaseId(databaseId)
  const nameColumnWrapContent = getNameColumnWrapContent(databaseConfig)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    () => new Set()
  )
  const [rowDragOverlay, setRowDragOverlay] =
    useState<DatabaseRowDragOverlay | null>(null)
  const [rowDropTargetIndex, setRowDropTargetIndex] = useState<number | null>(
    null
  )
  const [pendingInsertProperty, setPendingInsertProperty] =
    useState<PendingInsertProperty | null>(null)
  const [pendingSortedRowReorder, setPendingSortedRowReorder] =
    useState<PendingSortedRowReorder | null>(null)
  const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
    null
  )
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [rowLayout, setRowLayout] = useState<{
    centers: Record<string, number>
    dropTops: number[]
  }>({ centers: {}, dropTops: [] })
  const activeEditingPropertyKey =
    getPropertyKeyFromHeaderEditingKey(editingPropertyKey)
  const isTableSorted = activeDatabaseSorts.length > 0
  const isTableFiltered = activeDatabaseFilters.length > 0
  const isTableGrouped = Boolean(groupProperty)
  const renderedProperties = useMemo(
    () => visibleProperties,
    [visibleProperties]
  )
  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions]
  )
  const activeInsertProperty = pendingInsertProperty
  const canReorderRows = editable
  const rowDragTitle = (() => {
    if (!canReorderRows) {
      return "Manual row sorting is disabled"
    }

    if (isTableGrouped && isTableSorted) {
      return "Drag within this group. Clear sorting to save the new order."
    }

    if (isTableGrouped) {
      return "Drag within this group"
    }

    if (isTableSorted && isTableFiltered) {
      return "Drag page. Clear sorting to save the new order; hidden rows keep their relative order."
    }

    if (isTableSorted) {
      return "Drag page. Clear sorting to save the new order."
    }

    if (isTableFiltered) {
      return "Drag page. Hidden rows keep their relative order."
    }

    return "Drag page"
  })()
  const pendingInsertPropertyKey = activeInsertProperty
    ? `insert-property-${activeInsertProperty.sourceColumnKey}-${activeInsertProperty.side}`
    : null
  const columnKeys = (() => {
    const nameKeys =
      activeInsertProperty?.sourceColumnKey === "name"
        ? activeInsertProperty.side === "left"
          ? ["insert-property-name-left", "name"]
          : ["name", "insert-property-name-right"]
        : ["name"]
    const propertyKeys = renderedProperties.flatMap((property: any) => {
      if (
        !activeInsertProperty ||
        property.id !== activeInsertProperty.sourceColumnKey
      ) {
        return [property.id]
      }

      const insertKey = `insert-property-${property.id}-${activeInsertProperty.side}`

      return activeInsertProperty.side === "left"
        ? [insertKey, property.id]
        : [property.id, insertKey]
    })

    return [...nameKeys, ...propertyKeys, ...(editable ? ["add-property"] : [])]
  })()
  const tableMinWidth = columnKeys.reduce(
    (width, key) => width + getColumnWidth(columnWidths, key),
    0
  )
  const getInlineTableContentWidth = useCallback(() => tableMinWidth, [
    tableMinWidth,
  ])
  const {
    isInlineScrollEnabled: isInlineTableScrollEnabled,
    style: tableWrapStyle,
  } = useInlineDatabaseScroll({
    getContentWidth: getInlineTableContentWidth,
    scrollRef: tableScrollRef,
    wrapperRef: tableWrapRef,
  })
  const groupedSections = useMemo<GroupSection[]>(() => {
    if (!isTableGrouped || !groupProperty) {
      return []
    }

    const propertyType = groupProperty.property.type
    const configuredOptions =
      propertyType === "status"
        ? getConfiguredPropertyOptions(groupProperty.property.config).length > 0
          ? getConfiguredPropertyOptions(groupProperty.property.config)
          : defaultStatusOptions
        : getConfiguredPropertyOptions(groupProperty.property.config)
    const configuredOptionsByName = new Map(
      configuredOptions.map((option) => [option.name, option])
    )
    const configuredOptionsById = new Map(
      configuredOptions.map((option) => [option.id, option])
    )
    const sectionsById = new Map<string, GroupSectionDraft>()

    const ensureSection = (section: Omit<GroupSectionDraft, "rows">) => {
      const existingSection = sectionsById.get(section.id)

      if (existingSection) {
        return existingSection
      }

      const nextSection = { ...section, rows: [] }
      sectionsById.set(section.id, nextSection)
      return nextSection
    }

    if (configuredOptions.length > 0) {
      configuredOptions.forEach((option) => {
        ensureSection({
          color: option.color,
          groupValue: option.name,
          id: option.id,
          isEmpty: false,
          name: option.name,
        })
      })
    }

    sortedRows.forEach((row: any) => {
      const rawGroupValue = getRowGroupValue(
        row,
        groupProperty,
        propertyValuesByKey
      )

      if (!rawGroupValue) {
        ensureSection({
          color: "gray",
          groupValue: "",
          id: "empty",
          isEmpty: true,
          name: "Empty",
        }).rows.push(row)
        return
      }

      const configuredOption =
        configuredOptionsByName.get(rawGroupValue) ??
        configuredOptionsById.get(rawGroupValue)
      const groupId = configuredOption?.id ?? rawGroupValue
      const groupName =
        configuredOption?.name ??
        (propertyType === "person"
          ? personOptionsById.get(rawGroupValue) ?? rawGroupValue
          : rawGroupValue)

      ensureSection({
        color: configuredOption?.color,
        groupValue: rawGroupValue,
        id: groupId,
        isEmpty: false,
        name: groupName,
      }).rows.push(row)
    })

    return Array.from(sectionsById.values())
  }, [
    groupProperty,
    isTableGrouped,
    personOptionsById,
    propertyValuesByKey,
    sortedRows,
  ])
  const visibleRows = isTableGrouped
    ? groupedSections.flatMap((section) =>
        collapsedGroups[section.id] === true ? [] : section.rows
      )
    : sortedRows
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

    const nextLayout = { centers, dropTops }

    setRowLayout((currentLayout) =>
      areRowLayoutsEqual(currentLayout, nextLayout) ? currentLayout : nextLayout
    )

    return nextLayout
  }, [getRowElements])
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
  const getGroupSectionForRowId = (rowId: string) => {
    if (!isTableGrouped) {
      return null
    }

    return (
      groupedSections.find((section) =>
        section.rows.some((row: any) => row.id === rowId)
      ) ?? null
    )
  }
  const getGroupSectionRange = (section: GroupSection) => {
    const groupRowIds = new Set(section.rows.map((row: any) => row.id))
    const start = visibleRows.findIndex((row: any) => groupRowIds.has(row.id))

    return start === -1 ? null : { end: start + section.rows.length, start }
  }
  const getDraggedRowGroupDropTarget = () => {
    if (!draggedRowId || rowDropTargetIndex === null || !isTableGrouped) {
      return null
    }

    const sourceSection = getGroupSectionForRowId(draggedRowId)

    if (!sourceSection) {
      return null
    }

    const sourceRange = getGroupSectionRange(sourceSection)

    if (!sourceRange) {
      return null
    }

    if (
      rowDropTargetIndex >= sourceRange.start &&
      rowDropTargetIndex <= sourceRange.end
    ) {
      return {
        isCrossGroup: false,
        localTargetIndex: rowDropTargetIndex - sourceRange.start,
        section: sourceSection,
        sourceSection,
      }
    }

    for (const section of groupedSections) {
      if (section.id === sourceSection.id) {
        continue
      }

      const range = getGroupSectionRange(section)

      if (
        range &&
        rowDropTargetIndex >= range.start &&
        rowDropTargetIndex <= range.end
      ) {
        return {
          isCrossGroup: true,
          localTargetIndex: rowDropTargetIndex - range.start,
          section,
          sourceSection,
        }
      }
    }

    return null
  }
  const getDraggedRowMove = (): RowMove | null => {
    if (!draggedRowId || rowDropTargetIndex === null) {
      return null
    }

    if (isTableGrouped) {
      const groupTarget = getDraggedRowGroupDropTarget()

      if (!groupTarget) {
        return null
      }

      if (!groupTarget.isCrossGroup) {
        const rowIds = getGroupedReorderedRowIds({
          allRows: rows,
          draggedRowId,
          groupRows: groupTarget.section.rows,
          targetIndex: rowDropTargetIndex,
          visibleRows,
        })

        return rowIds ? { rowId: draggedRowId, rowIds } : null
      }

      if (!groupProperty || groupProperty.id === "name") {
        return null
      }

      const draggedRow = rows.find((row: any) => row.id === draggedRowId)

      if (!draggedRow) {
        return null
      }

      const rowIds =
        getAnchoredReorderedRowIds(
          rows,
          draggedRowId,
          groupTarget.section.rows,
          groupTarget.localTargetIndex
        ) ?? rows.map((row: any) => row.id)
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
        rowDropTargetIndex
      )

      return rowIds ? { rowId: draggedRowId, rowIds } : null
    }

    const rowIds = getReorderedRowIds(
      isTableSorted ? sortedRows : rows,
      draggedRowId,
      rowDropTargetIndex
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
    setDraggedRowId(null)
    setRowDragOverlay(null)
    setRowDropTargetIndex(null)
  }
  const rowDropLineTop =
    rowDropTargetIndex === null ||
    (draggedRowId && !getDraggedRowMove())
      ? null
      : (rowLayout.dropTops[rowDropTargetIndex] ?? null)
  const getRowConditionalColors = useCallback(
    (row: any) => {
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

      return { propertyColors, rowColor }
    },
    [
      activeConditionalColors,
      personOptionsById,
      properties,
      propertyValuesByKey,
    ]
  )
  useEffect(() => {
    if (
      activeEditingPropertyKey &&
      activeEditingPropertyKey !== "name" &&
      !renderedProperties.some(
        (property: any) => property.id === activeEditingPropertyKey
      )
    ) {
      setEditingPropertyKey(null)
    }
  }, [activeEditingPropertyKey, renderedProperties])

  useEffect(() => {
    if (
      pendingInsertProperty &&
      pendingInsertProperty.sourceColumnKey !== "name" &&
      !renderedProperties.some(
        (property: any) => property.id === pendingInsertProperty.sourceColumnKey
      )
    ) {
      setPendingInsertProperty(null)
    }
  }, [pendingInsertProperty, renderedProperties])

  useEffect(() => {
    window.addEventListener("resize", measureRows)

    return () => window.removeEventListener("resize", measureRows)
  }, [measureRows])

  useEffect(() => {
    if (!rowDragOverlay) {
      return
    }

    const moveOverlay = (event: DragEvent) => {
      setRowDragOverlay((overlay: any) =>
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
  }, [rowDragOverlay])

  useLayoutEffect(() => {
    measureRows()
  }, [
    activePropertyValueKey,
    collapsedGroups,
    measureRows,
    renderedProperties,
    sortedRows,
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

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.max(
        databaseColumnMinWidth,
        startWidth + moveEvent.clientX - startX
      )

      setColumnWidths((widths: Record<string, number>) => ({
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
    setPendingInsertProperty((current: any) => {
      const currentKey = current
        ? `insert-property-${current.sourceColumnKey}-${current.side}`
        : null

      return currentKey === insertKey ? null : current
    })
  }

  const addInsertedDatabaseProperty = (
    type: string,
    label: string,
    position: number,
    insertKey: string
  ) => {
    addDatabaseProperty(type, label, position)
    clearPendingInsertProperty(insertKey)
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

  const startRowDrag = (row: any, event: ReactDragEvent<HTMLButtonElement>) => {
    if (!canReorderRows) {
      return
    }

    measureRows()
    const rowElement = tableWrapRef.current?.querySelector(
      `tr[data-database-row-id="${row.id}"]`
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
        title: row.page.name.trim() || "Untitled",
        top: rowRect.top,
        width: tableRect.width,
      })
    }

    hideNativeDatabaseRowDragPreview(event.dataTransfer)
    setDraggedRowId(row.id)
    setRowDropTargetIndex(visibleRows.findIndex((item: any) => item.id === row.id))
    event.dataTransfer.effectAllowed = "copyMove"
    event.dataTransfer.setData(
      DATABASE_PAGE_DRAG_MIME,
      JSON.stringify({
        databaseId: loadedDatabaseId,
        pageId: row.pageId,
        rowId: row.id,
      })
    )
    event.dataTransfer.setData("text/plain", row.page.name.trim() || "Untitled")
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
      <tr>
        {pendingInsertPropertyKey === "insert-property-name-left"
          ? renderInsertPropertyHeader("insert-property-name-left", 0)
          : null}
        <th className="database-name-header">
          {editable ? (
            <DatabaseNamePropertyMenu
              config={databaseConfig}
              databaseId={loadedDatabaseId}
              isGrouped={groupProperty?.id === "name"}
              onOpenChange={(open) =>
                handleEditingPropertyOpenChange(headerScope, "name", open)
              }
              onInsertProperty={(side) => openInsertPropertyMenu("name", 0, side)}
              onToggleGroup={() =>
                togglePropertyGrouping("name", groupProperty?.id === "name")
              }
              open={editingPropertyKey === getHeaderEditingKey(headerScope, "name")}
            />
          ) : (
            <span className="database-name-header-content">
              <span>Aa</span>
              <span>{nameColumnLabel}</span>
            </span>
          )}
          <span
            aria-hidden="true"
            className="database-column-resize-handle"
            onPointerDown={(event) => startColumnResize("name", event)}
          />
        </th>
        {pendingInsertPropertyKey === "insert-property-name-right"
          ? renderInsertPropertyHeader("insert-property-name-right", 1)
          : null}
        {renderedProperties.map((property: any) => {
          const leftInsertKey = `insert-property-${property.id}-left`
          const rightInsertKey = `insert-property-${property.id}-right`
          const showLeftInsert = pendingInsertPropertyKey === leftInsertKey
          const showRightInsert = pendingInsertPropertyKey === rightInsertKey

          return (
            <Fragment key={property.id}>
              {showLeftInsert
                ? renderInsertPropertyHeader(
                    leftInsertKey,
                    pendingInsertProperty?.position ?? property.position
                  )
                : null}
              <th className="database-property-header">
                {editable ? (
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
                      openInsertPropertyMenu(property.id, property.position, side)
                    }
                    onRename={(name) => renameDatabaseProperty(property.id, name)}
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
                    type={property.property.type}
                  />
                ) : (
                  <span className="database-property-header-label">
                    {property.property.name}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className="database-column-resize-handle"
                  onPointerDown={(event) => startColumnResize(property.id, event)}
                />
              </th>
              {showRightInsert
                ? renderInsertPropertyHeader(
                    rightInsertKey,
                    pendingInsertProperty?.position ?? property.position + 1
                  )
                : null}
            </Fragment>
          )
        })}
        {editable ? (
          <th className="database-add-property-cell">
            <AddDatabasePropertyMenu
              disabled={isAddingDatabaseProperty}
              isPending={isAddingDatabaseProperty}
              onAdd={addDatabaseProperty}
            />
            <span
              aria-hidden="true"
              className="database-column-resize-handle"
              onPointerDown={(event) => startColumnResize("add-property", event)}
            />
          </th>
        ) : null}
      </tr>
    </thead>
  )

  const renderTableRows = (tableRows: any[]) => (
    <tbody>
      {tableRows.map((row: any) => {
        const conditionalColors = getRowConditionalColors(row)

        return (
          <tr
            className={getConditionalColorClassName(conditionalColors.rowColor)}
            data-database-row-id={row.id}
            key={row.id}
            onMouseEnter={() => {
              measureRows()
              setHoveredRowId(row.id)
            }}
          >
            {pendingInsertPropertyKey === "insert-property-name-left"
              ? renderInsertPropertyCell("insert-property-name-left")
              : null}
            <td
              className={cn(
                "database-page-cell",
                getConditionalColorClassName(conditionalColors.propertyColors.name)
              )}
            >
              <DatabaseTableCellContent wrapContent={nameColumnWrapContent}>
                <DatabasePageLink
                  editable={editable}
                  onOpen={onOpenPage}
                  pageId={row.pageId}
                  showPageIcon={nameColumnShowPageIcon}
                />
              </DatabaseTableCellContent>
            </td>
            {pendingInsertPropertyKey === "insert-property-name-right"
              ? renderInsertPropertyCell("insert-property-name-right")
              : null}
            {renderedProperties.map((property: any) => {
              const leftInsertKey = `insert-property-${property.id}-left`
              const rightInsertKey = `insert-property-${property.id}-right`
              const showLeftInsert = pendingInsertPropertyKey === leftInsertKey
              const showRightInsert = pendingInsertPropertyKey === rightInsertKey
              const workspaceProperty = property.property
              const key = `${row.pageId}:${workspaceProperty.id}`
              const persistedValue = propertyValuesByKey[key] ?? ""
              const value = draftPropertyValues[key] ?? persistedValue
              const wrapContent = getPropertyWrapContent(workspaceProperty.config)

              return (
                <Fragment key={property.id}>
                  {showLeftInsert ? renderInsertPropertyCell(leftInsertKey) : null}
                  <td
                    className={cn(
                      "database-value-cell",
                      getConditionalColorClassName(
                        conditionalColors.propertyColors[property.id]
                      )
                    )}
                    data-active={
                      activePropertyValueKey === key ? "true" : undefined
                    }
                    data-wrap-content={wrapContent ? "true" : undefined}
                  >
                    <DatabaseTableCellContent wrapContent={wrapContent}>
                      <DatabasePropertyValue
                        draftValues={draftPropertyValues}
                        editable={editable}
                        onActiveValueChange={setActivePropertyValueKey}
                        onDraftValuesChange={setDraftPropertyValues}
                        onPropertyConfigChange={(databasePropertyId, config) =>
                          updateDatabasePropertyConfig(databasePropertyId, config)
                        }
                        onSaveValue={savePropertyValue}
                        persistedValue={persistedValue}
                        personOptions={personOptions}
                        property={property}
                        row={row}
                        value={value}
                      />
                    </DatabaseTableCellContent>
                  </td>
                  {showRightInsert ? renderInsertPropertyCell(rightInsertKey) : null}
                </Fragment>
              )
            })}
            {editable ? <td /> : null}
          </tr>
        )
      })}
    </tbody>
  )

  return (
    <>
      <div
        className="database-table-wrap database-inline-scroll-wrap"
        data-inline-scroll={isInlineTableScrollEnabled ? "true" : undefined}
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
            setRowDropTargetIndex(null)
          }
        }}
        onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
          const hasDragPayload =
            !isTableGrouped && hasDatabasePageDragPayload(event.dataTransfer)

          if (!draggedRowId && !hasDragPayload) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = "move"
          if (draggedRowId) {
            setRowDragOverlay((overlay: any) =>
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
          if (isTableGrouped && !draggedRowId) {
            return
          }

          const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

          if ((!draggedRowId && !dragPayload) || rowDropTargetIndex === null) {
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
            addDraggedPageRow(dragPayload, rowDropTargetIndex)
          }
          clearRowDrag()
        }}
      >
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
      <div
        className="database-table-scroll database-inline-scroll"
        ref={tableScrollRef}
      >
        <div className="database-table-scroll-content database-inline-scroll-content">
          {editable ? (
            <div className="database-row-drag-rail">
              {visibleRows.map((row: any) => {
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
                      measureRows()
                      setHoveredRowId(row.id)
                    }}
                    onMouseLeave={() => {
                      if (!draggedRowId) {
                        setHoveredRowId(null)
                      }
                    }}
                    style={{ top: rowCenter }}
                  >
                    <Checkbox
                      aria-label={`Select ${row.page.name.trim() || "Untitled"}`}
                      checked={selectedRowIds.has(row.id)}
                      className="database-row-checkbox"
                      onCheckedChange={(checked) =>
                        toggleSelectedRow(row.id, checked === true)
                      }
                    />
                    <button
                      aria-label={`Drag ${row.page.name.trim() || "Untitled"}`}
                      className="database-row-drag-handle"
                      data-database-row-drag-handle
                      data-dragging={
                        draggedRowId === row.id ? "true" : undefined
                      }
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
                  </div>
                )
              })}
            </div>
          ) : null}
          {rowDropLineTop !== null ? (
            <div
              className="database-row-drop-line"
              style={{ top: rowDropLineTop }}
            />
          ) : null}
          {isTableGrouped ? (
            <div className="database-table-groups">
              {groupedSections.map((section) => {
                const isCollapsed = collapsedGroups[section.id] === true

                return (
                  <section className="database-table-group" key={section.id}>
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
                      <span className={getColorTokenBadgeClassName(section.color)}>
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
                              <col
                                key={key}
                                style={{ width: getColumnWidth(columnWidths, key) }}
                              />
                            ))}
                          </colgroup>
                          {renderTableHeader(section.id)}
                          {renderTableRows(section.rows)}
                        </table>
                        {editable && !section.isEmpty ? (
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
                              disabled={!databaseId || isAddingDatabaseRow}
                              onClick={() =>
                                addDatabaseRow(section.groupValue, groupProperty)
                              }
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
                        ) : null}
                      </>
                    ) : null}
                  </section>
                )
              })}
            </div>
          ) : (
            <>
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
                    <col
                      key={key}
                      style={{ width: getColumnWidth(columnWidths, key) }}
                    />
                  ))}
                </colgroup>
                {renderTableHeader()}
                {renderTableRows(sortedRows)}
              </table>
            </>
          )}
          {editable && !isTableGrouped ? (
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
                disabled={!databaseId || isAddingDatabaseRow}
                onClick={() => addDatabaseRow()}
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
          ) : null}
        </div>
      </div>
      </div>
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
              Row order is manual. To save this move, Notelab needs to clear the
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
