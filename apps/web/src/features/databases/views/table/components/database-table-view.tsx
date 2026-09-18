import {
  retainTableRowDropTarget,
  retainGroupRowDropTarget,
  propertyInsertPositions,
} from "../model/database-table-model";
import { useTableRowLayout } from "../controller/use-table-row-layout"
import { useTableColumns } from "../controller/use-table-columns"
import { useTableSelection } from "../controller/use-table-selection"
import { createCellEditHistoryAction } from "../../../interactions/cell-edit-history"
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
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom"
import { Reorder } from "framer-motion"
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
} from "@/shared/components/icons"
import { toast } from "sonner"
import { getDatabaseRowMoveAnchors, useMoveDatabaseRow } from "@zilobase/features/databases/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  useOptionalPageSidePane,
} from "@/features/pages/pane/page-side-pane";
import { DefaultPageIcon, PageIconDisplay } from "@/features/pages/index"
import { cn } from "@/shared/lib/utils"
import { useUndoHistory } from "@/shared/shortcuts"
import {
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/shared/lib/color-tokens"

import { AddDatabasePropertyMenu } from "../../../schema/editors/add-database-property-menu"
import { DatabaseCellContent } from "../../components/database-cell-content"

import {
  setDatabasePageDragPayload,
} from "../../../interactions/database-page-drop"
import { DatabasePageLink } from "../../../interactions/database-page-link"
import { DatabaseFormulaDialog } from "../../../schema/formula/view/database-formula-dialog"
import {
  DatabaseNamePropertyMenu,
  DatabasePropertyMenu,
} from "../../../schema/editors/database-property-menu"
import { DatabasePropertyValue } from "../../../schema/editors/database-property-value"
import {
  getDatabasePropertyType,
} from "../../../schema/property-catalog"
import { serializePropertyValue } from "../../../schema/property-values";
import {
  getDatabasePropertyIcon,
  getNameColumnWrapContent,
  getPropertyWrapContent,
} from "../../model/database-view-config";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/database-view-context"
import {
  getDatabaseSubItemLineParentRowId,
  getDatabaseSubItemRelationChanges,
  getSubItemCreateRowsAfterRow,
} from "../../model/database-sub-items"
import { useDatabaseRowsScroll } from "../../../interactions/use-database-rows-scroll"
import { useInlineDatabaseScroll } from "../../../interactions/use-inline-database-scroll"
import {
  areSerializedPropertyValuesEqual,
  databaseItemMatchesFilter,
} from "../../../interactions/database-item-utils"
import { getDatabaseGroupMoveValue } from "../../../interactions/database-group-values"
import { getDatabaseTableGroupSections } from "../../../interactions/database-table-group-sections"
import {
  getDatabaseCellFillRowIds,
  isDatabasePropertyFillable,
  type DatabaseCellFillHistoryChange,
} from "../../../interactions/database-cell-fill";
import { getDatabaseRowDropTarget } from "../../../interactions/database-table-layout"
import {
  claimDatabaseRowDropOwner,
  getAnchoredRowInsertPosition,
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
  finishDatabaseRowDrag,
  hideNativeDatabaseRowDragPreview,
  releaseDatabaseRowDropOwner,
  startDatabaseRowDrag,
  subscribeDatabaseRowDropOwner,
} from "../../../interactions/database-row-drag"
import { useDatabaseRowDragOverlay } from "../../../interactions/use-database-row-drag-overlay"
import {
  canCreateRowInKanbanGroup,
  canUpdateKanbanGroupProperty,
} from "../../kanban/model/database-kanban-config";

import {
  ADD_PROPERTY_COLUMN_ID,
  DATABASE_NAME_COLUMN_ID,
  DATABASE_SUB_ITEM_DRAG_INDENT,
  getHeaderEditingKey,
  getInsertPropertyColumnKey,
  getRowDragTitle,
  getRowTitle,
  getVisibleNestedTableRows,
  requireDatabaseId,
  type CellFillDrag,
  type GroupRowDropTarget,
  type GroupSection,
  type PendingSortedRowReorder,
  type RowMove,
  type TableRow,
  type TableRowDropTarget,
} from "../model/database-table-model";
import {
  DatabaseTable,
  DatabaseVirtualizedTable,
  getConditionalColorClassName,
  getTableMinWidthStyle,
  useSyncedHorizontalScroll,
} from "./database-table-shell";
import {
  CreateDatabaseRowButton,
  DatabaseActiveTableCell,
} from "./database-table-cell"
import { DatabaseTableSelectionToolbar } from "./database-table-selection-toolbar"
import {
  DatabaseHeaderReorderItem,
  DatabaseRowDragControls,
  DatabaseRowDropLine,
} from "./database-table-drag-controls"

export function DatabaseTableView() {
  const sidePane = useOptionalPageSidePane()
  const {
    addDatabaseProperty,
    addDraggedPageRow,
    fetchNextPage,
    getDatabasePageDragPayload,
    hasDatabasePageDragPayload,
    addDatabaseRow,
    onOpenPage,
    savePropertyValue,
    saveDatabaseSorts,
    setViewGroupProperty,
    renameDatabaseProperty,
    updateDatabasePropertyConfig,
    updateNameColumnConfig,
    saveDatabasePropertyOrder,
  } = useDatabaseActionsContext()
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    canAddDatabaseProperties,
    propertyValuesByKey,
    databaseConfig,
    databaseId,
    databaseName,
    databaseWorkspaceId,
    editable,
    groupProperty,
    hasNextPage,
    hostDatabaseId,
    isFetchingNextPage,
    personOptions,
    properties,
    items: rows,
    sortedItems: sortedRows,
    subItemChildRowIdsByParentId,
    subItemDepthByRowId,
    subItemParentRowIdsByRowId,
    visibleProperties,
    workspaceId,
  } = useDatabaseDataContext()
  const {
    headerMenusEnabled,
    layoutSettings,
    titlePropertyLabel: nameColumnLabel,
    showPageIconInTitle: nameColumnShowPageIcon,
    subItemsSettings,
  } = useDatabaseUiContext()
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useMoveDatabaseRow()
  const undoHistory = useUndoHistory()
  const loadedDatabaseId = requireDatabaseId(databaseId)

  const canEditStructure = editable && (canAddDatabaseProperties ?? true)

  const canUseHeaderMenus = headerMenusEnabled ?? editable
  const nameColumnWrapContent = getNameColumnWrapContent(databaseConfig)

  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [isExternalRowDragActive, setIsExternalRowDragActive] = useState(false)

  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null)
  const [cellFillDrag, setCellFillDrag] = useState<CellFillDrag | null>(null)
  const cellFillDragRef = useRef<CellFillDrag | null>(null)
  const propertyValuesByKeyRef = useRef(propertyValuesByKey)
  propertyValuesByKeyRef.current = propertyValuesByKey
  const {
    selectedRowIds,
    setSelectedRowIds,
    selectedRows,
    getSelectionValue,
    copySelectedRowLinks,
    saveSelectedPropertyValue,
    toggleSelectedRow,
  } = useTableSelection({
    rows,
    propertyValuesByKey,
    propertyValuesByKeyRef,
    savePropertyValue,
    undoHistory,
  })

  const finishRowDragRef = useRef<() => void>(() => {})
  const rowDragOverlay = useDatabaseRowDragOverlay(finishRowDragRef)
  const [rowDropTarget, setRowDropTarget] =
    useState<TableRowDropTarget | null>(null)
  const rowDropTargetRef = useRef<TableRowDropTarget | null>(null)
  const rowDragStartClientXRef = useRef<number | null>(null)
  const [groupRowDropTarget, setGroupRowDropTarget] =
    useState<GroupRowDropTarget | null>(null)
  const groupRowDropTargetRef = useRef<GroupRowDropTarget | null>(null)
  const isExternalRowDragActiveRef = useRef(false)
  const rowDropOwner = useMemo(() => ({}), [])

  const [pendingSortedRowReorder, setPendingSortedRowReorder] =
    useState<PendingSortedRowReorder | null>(null)

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

  const isTableSorted = activeDatabaseSorts.length > 0
  const isTableFiltered = activeDatabaseFilters.length > 0
  const isTableGrouped = Boolean(groupProperty)
  const isSubItemsNested =
    subItemsSettings.enabled &&
    subItemsSettings.display === "nested" &&
    !isTableGrouped
  const renderedProperties = visibleProperties
  const {
    columnWidths,
    pendingInsertProperty,
    formulaSetupPropertyId,
    setFormulaSetupPropertyId,
    draggedColumnId,
    suppressPropertyHeaderClickRef,
    editingPropertyKey,
    propertiesById,
    renderedColumnIds,
    selectionProperties,
    headerColumnIds,
    canReorderColumns,
    pendingInsertPropertyKey,
    columnKeys,
    tableMinWidth,
    getInlineTableContentWidth,
    startColumnResize,
    handleEditingPropertyOpenChange,
    openInsertPropertyMenu,
    clearPendingInsertProperty,
    addDatabasePropertyAndMaybeOpenFormula,
    addInsertedDatabaseProperty,
    startColumnHeaderReorder,
    queueColumnHeaderOrder,
    finishColumnHeaderReorder,
  } = useTableColumns({
    editable,
    canEditStructure,
    databaseConfig,
    renderedProperties,
    properties,
    tableWrapRef,
    saveDatabasePropertyOrder,
    addDatabaseProperty,
  })

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

  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions]
  )

  const canReorderRows = editable

  const rowDragTitle = getRowDragTitle({
    canReorder: canReorderRows,
    isFiltered: isTableFiltered,
    isGrouped: isTableGrouped,
    isSorted: isTableSorted,
  })

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
  const {
    rowLayout,
    rowLayoutRef,
    getRowLayoutElement,
    measureRows,
    scheduleMeasureRows,
  } = useTableRowLayout({
    tableWrapRef,
    tableScrollRef,
    isInlineTableScrollEnabled,
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
    return getVisibleNestedTableRows({
      collapsedRowIds: collapsedSubItemRowIds,
      nested: isSubItemsNested,
      parentRowIdsByRowId: subItemParentRowIdsByRowId,
      rows: sortedRows,
    })
  }, [
    collapsedSubItemRowIds,
    isSubItemsNested,
    sortedRows,
    subItemParentRowIdsByRowId,
  ])
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
        parentRowIdsByRowId: subItemParentRowIdsByRowId,
        rows: visibleRows,
      }),
    [expandedSubItemRowIds, subItemParentRowIdsByRowId, visibleRows]
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

  const getSubItemDropParentRowId = (
    targetIndex: number,
    preferPreviousRowAsParent = false
  ) =>
    isSubItemsNested &&
    subItemsSettings.parentPropertyId &&
    subItemsSettings.subItemPropertyId
      ? getDatabaseSubItemLineParentRowId({
          childRowIdsByParentId: subItemChildRowIdsByParentId,
          collapsedRowIds: collapsedSubItemRowIds,
          parentRowIdsByRowId: subItemParentRowIdsByRowId,
          preferPreviousRowAsParent,
          rows: visibleRows,
          targetIndex,
        })
      : undefined
  const resolveRowDropTarget = (clientY: number, clientX: number) => {
    const layoutElement = getRowLayoutElement()

    if (!layoutElement) {
      return null
    }

    const relativeY = clientY - layoutElement.getBoundingClientRect().top
    const target = getDatabaseRowDropTarget(
      rowLayoutRef.current.dropTops,
      relativeY
    )

    if (!target) return null

    const previousRow = visibleRows[target.index - 1]
    const dragStartClientX = rowDragStartClientXRef.current
    const preferPreviousRowAsParent = Boolean(
      draggedRowId &&
        previousRow &&
        previousRow.id !== draggedRowId &&
        dragStartClientX !== null &&
        clientX >= dragStartClientX + DATABASE_SUB_ITEM_DRAG_INDENT
    )
    const subItemParentRowId = draggedRowId
      ? getSubItemDropParentRowId(
          target.index,
          preferPreviousRowAsParent
        )
      : undefined

    return {
      ...target,
      ...(subItemParentRowId !== undefined ? { subItemParentRowId } : {}),
    }
  }
  const updateRowDropTarget = (nextTarget: TableRowDropTarget | null) => {
    rowDropTargetRef.current = nextTarget
    setRowDropTarget((currentTarget) =>
      retainTableRowDropTarget(currentTarget, nextTarget),
    );
  }
  const updateGroupRowDropTarget = (nextTarget: GroupRowDropTarget | null) => {
    groupRowDropTargetRef.current = nextTarget
    setGroupRowDropTarget((currentTarget) =>
      retainGroupRowDropTarget(currentTarget, nextTarget),
    );
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

    const targetIndex = rowDropTargetRef.current?.index ?? 0
    const rowIds = getFilteredReorderedRowIds(
      rows,
      visibleRows,
      draggedRowId,
      targetIndex
    )
    const subItemParentRowId =
      rowDropTargetRef.current?.subItemParentRowId

    return rowIds || subItemParentRowId !== undefined
      ? {
          rowId: draggedRowId,
          rowIds: rowIds ?? rows.map((row) => row.id),
          ...(subItemParentRowId !== undefined
            ? { subItemParentRowId }
            : {}),
        }
      : null
  }
  const applyRowMove = (nextMove: RowMove) => {
    if (!databaseId) {
      return
    }
    const notifyMoveError = (error: unknown) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't move row",
      )
    }

    if (nextMove.groupPropertyId) {
      moveRow.mutate({
        databaseId,
        ...(hostDatabaseId ? { hostDatabaseId } : {}),
        groupPropertyId: nextMove.groupPropertyId,
        groupValue: nextMove.groupValue,
        ...getDatabaseRowMoveAnchors(nextMove.rowIds, nextMove.rowId),
      }, { onError: notifyMoveError })
      return
    }

    if (nextMove.subItemParentRowId !== undefined) {
      const parentPropertyId = subItemsSettings.parentPropertyId
      const subItemPropertyId = subItemsSettings.subItemPropertyId
      const changes =
        parentPropertyId && subItemPropertyId
          ? getDatabaseSubItemRelationChanges({
              draggedRowId: nextMove.rowId,
              parentPropertyId,
              propertyValuesByKey: propertyValuesByKeyRef.current,
              rows,
              subItemPropertyId,
              targetParentRowId: nextMove.subItemParentRowId,
            })
          : []

      if (changes === null) {
        toast.error("A page can't be moved below itself or one of its sub-items")
        return
      }

      for (const change of changes) {
        savePropertyValue(
          change.rowId,
          change.propertyId,
          "relation",
          change.currentValue,
          change.nextValue
        )
      }

      if (nextMove.subItemParentRowId) {
        setCollapsedSubItemRowIds((current) => {
          const next = new Set(current)
          next.delete(nextMove.subItemParentRowId!)
          return next
        })
      }
    }

    if (nextMove.rowIds.some((rowId, index) => rowId !== rows[index]?.id)) {
      reorderRows.mutate({
        databaseId,
        ...(hostDatabaseId ? { hostDatabaseId } : {}),
        ...getDatabaseRowMoveAnchors(nextMove.rowIds, nextMove.rowId),
      }, { onError: notifyMoveError })
    }
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
    rowDragStartClientXRef.current = null
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
  const rowDropParentRowId = rowDropTarget?.subItemParentRowId
  const rowDropLineDepth = rowDropParentRowId
    ? (subItemDepthByRowId[rowDropParentRowId] ?? 0) + 1
    : 0
  const conditionalColorsByRowId = useMemo(() => {
    const colorsByRowId = new Map<
      string,
      { propertyColors: Record<string, string>; rowColor?: string }
    >()

    if (activeConditionalColors.length === 0) {
      return colorsByRowId
    }

    for (const row of visibleRows) {
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
    visibleRows,
  ])

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
        undoHistory.pushAction(createCellEditHistoryAction({
          label: "Fill database cells",
          changes: historyChanges,
          readValues: () => propertyValuesByKeyRef.current,
          savePropertyValue,
          runWithoutRecording: undoHistory.runWithoutRecording,
        }))
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

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  const togglePropertyGrouping = (propertyId: string, isGrouped: boolean) => {
    setViewGroupProperty(isGrouped ? null : propertyId)
  }

  const startCellFill = useCallback(
    (
      row: TableRow,
      propertyId: string,
      propertyType: string,
      sourceValue: string | string[],
      event: ReactPointerEvent<HTMLButtonElement>
    ) => {
      if (event.button !== 0) return

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
    },
    []
  )

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
    rowDragStartClientXRef.current = event.clientX
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
        disabled={false}
        isPending={false}
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

  const renderInsertPropertyCell = useCallback(
    (insertKey: string) => (
      <td
        aria-hidden="true"
        className="database-value-cell database-insert-property-placeholder"
        key={insertKey}
      />
    ),
    []
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
          const dragTitle = canReorderColumns
            ? "Drag to reorder column"
            : undefined;
          const insertPositions = propertyInsertPositions(
            pendingInsertProperty?.position,
            property?.position,
          );
          function renderNameHeader(
            startHeaderDrag: (event: ReactPointerEvent<HTMLElement>) => void,
          ) {
            return canUseHeaderMenus ? (
              <DatabaseNamePropertyMenu
                config={databaseConfig}
                databaseId={loadedDatabaseId}
                isGrouped={groupProperty?.id === "name"}
                onOpenChange={(open) =>
                  handleEditingPropertyOpenChange(headerScope, "name", open)
                }
                onInsertProperty={(side) =>
                  openInsertPropertyMenu("name", 0, side)
                }
                onToggleGroup={() =>
                  togglePropertyGrouping("name", groupProperty?.id === "name")
                }
                open={
                  editingPropertyKey ===
                  getHeaderEditingKey(headerScope, "name")
                }
                schemaActionsEnabled={canEditStructure}
                sortDirection={
                  activeDatabaseSorts.find((sort) => sort.column === "name")
                    ?.direction
                }
                onSort={(direction) =>
                  void saveDatabaseSorts([
                    ...activeDatabaseSorts.filter(
                      (sort) => sort.column !== "name",
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
                      event.preventDefault();
                      event.stopPropagation();
                      suppressPropertyHeaderClickRef.current = false;
                      return;
                    }

                    handleEditingPropertyOpenChange(headerScope, "name", true);
                  },
                  onPointerDownCapture: startHeaderDrag,
                  title: dragTitle,
                }}
                wrapContent={nameColumnWrapContent}
              />
            ) : (
              <span
                className="database-name-header-content"
                onPointerDownCapture={startHeaderDrag}
                title={dragTitle}
              >
                <span>Aa</span>
                <span>{nameColumnLabel}</span>
              </span>
            );
          }
          function renderPropertyHeader(
            startHeaderDrag: (event: ReactPointerEvent<HTMLElement>) => void,
          ) {
            if (!property) return null;
            const propertyWrapContent = getPropertyWrapContent(
              property.property.config,
            );
            const PropertyIcon = getDatabasePropertyType(
              property.property.type,
            ).icon;
            const customPropertyIcon = getDatabasePropertyIcon(
              property.property.config,
            );
            return canUseHeaderMenus ? (
              <DatabasePropertyMenu
                config={property.property.config}
                databaseConfig={databaseConfig}
                databaseId={loadedDatabaseId}
                databasePropertyId={property.id}
                isGrouped={groupProperty?.property.id === property.property.id}
                name={property.property.name}
                onOpenChange={(open) =>
                  handleEditingPropertyOpenChange(
                    headerScope,
                    property.id,
                    open,
                  )
                }
                onInsertProperty={(side) =>
                  openInsertPropertyMenu(property.id, property.position, side)
                }
                onEditFormula={() => setFormulaSetupPropertyId(property.id)}
                onRename={(name) => renameDatabaseProperty(property.id, name)}
                onToggleGroup={() =>
                  togglePropertyGrouping(
                    property.property.id,
                    groupProperty?.property.id === property.property.id,
                  )
                }
                open={
                  editingPropertyKey ===
                  getHeaderEditingKey(headerScope, property.id)
                }
                schemaActionsEnabled={canEditStructure}
                sortDirection={
                  activeDatabaseSorts.find(
                    (sort) => sort.column === property.id,
                  )?.direction
                }
                sourceDatabaseId={loadedDatabaseId}
                sourceDatabaseName={databaseName}
                sourcePropertyId={property.property.id}
                onSort={(direction) =>
                  void saveDatabaseSorts([
                    ...activeDatabaseSorts.filter(
                      (sort) => sort.column !== property.id,
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
                      event.preventDefault();
                      event.stopPropagation();
                      suppressPropertyHeaderClickRef.current = false;
                      return;
                    }

                    handleEditingPropertyOpenChange(
                      headerScope,
                      property.id,
                      true,
                    );
                  },
                  onPointerDownCapture: startHeaderDrag,
                  title: dragTitle,
                }}
                type={property.property.type}
                wrapContent={propertyWrapContent}
                workspaceId={workspaceId ?? databaseWorkspaceId}
              />
            ) : (
              <span
                className="database-property-header-label flex h-8 min-w-0 items-center gap-2 px-3 py-1"
                onPointerDownCapture={startHeaderDrag}
                title={dragTitle}
              >
                {customPropertyIcon ? (
                  <span className="shrink-0">
                    <PageIconDisplay size="sm" value={customPropertyIcon} />
                  </span>
                ) : PropertyIcon ? (
                  <PropertyIcon className="size-4 shrink-0 text-content-secondary" />
                ) : null}
                <span className="truncate">{property.property.name}</span>
              </span>
            );
          }

          return (
            <Fragment key={columnId}>
              {showLeftInsert
                ? renderInsertPropertyHeader(
                    leftInsertKey,
                    insertPositions.left,
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
                    {columnId === DATABASE_NAME_COLUMN_ID
                      ? renderNameHeader(startHeaderDrag)
                      : renderPropertyHeader(startHeaderDrag)}
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
                    insertPositions.right,
                  )
                : null}
            </Fragment>
          );
        })}
        {canEditStructure ? (
          <th className="database-add-property-cell">
            <AddDatabasePropertyMenu
              disabled={false}
              isPending={false}
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

  const renderTableRow = useCallback(
    (
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
            data-row-selected={
              selectedRowIds.has(row.id) ? "true" : undefined
            }
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

              function renderPropertyCell() {
                if (!property) {
                  return null;
                }

                const pageProperty = property.property;
                const key = `${row.pageId}:${pageProperty.id}`;
                const persistedValue = propertyValuesByKey[key] ?? "";
                const wrapContent = getPropertyWrapContent(pageProperty.config);

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
                                event,
                              )
                          : undefined
                      }
                      onSelect={() => setSelectedCellKey(key)}
                      presenceKey={`${row.id}:${pageProperty.id}`}
                      className={cn(
                        "database-value-cell",
                        getConditionalColorClassName(
                          conditionalColors.propertyColors[property.id],
                        ),
                      )}
                      wrapContent={wrapContent}
                    >
                      {() => (
                        <DatabaseCellContent wrapContent={wrapContent}>
                          <DatabasePropertyValue
                            editable={editable}
                            properties={properties}
                            propertyValuesByKey={propertyValuesByKey}
                            onPropertyConfigChange={(
                              databasePropertyId,
                              config,
                            ) =>
                              updateDatabasePropertyConfig(
                                databasePropertyId,
                                config,
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
                );
              }

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
                          className={cn(
                            "database-sub-item-name",
                            showSubItemToggle &&
                              "database-sub-item-name-has-toggle"
                          )}
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

              return renderPropertyCell();
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
                    disabled={!databaseId}
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
                    <Plus />
                    <span>New sub-item</span>
                  </button>
                </td>
              </tr>
            ))}
          </Fragment>
        )
    },
    [
      addDatabaseRow,
      cellFillDrag?.propertyId,
      columnKeys.length,
      conditionalColorsByRowId,
      databaseId,
      editable,
      expandedEmptySubItemRowIds,
      fillTargetRowIds,
      isSubItemsNested,
      nameColumnLabel,
      nameColumnShowPageIcon,
      nameColumnWrapContent,
      onOpenPage,
      pendingInsertPropertyKey,
      personOptions,
      properties,
      propertiesById,
      propertyValuesByKey,
      renderInsertPropertyCell,
      renderedColumnIds,
      savePropertyValue,
      selectedCellKey,
      selectedRowIds,
      sidePane?.sidePanePageId,
      startCellFill,
      subItemChildRowIdsByParentId,
      subItemCreateRowIdsByAfterRowId,
      subItemDepthByRowId,
      collapsedSubItemRowIds,
      updateDatabasePropertyConfig,
    ]
  )

  return (
    <>
      {selectedRows.length > 0 ? (
        <DatabaseTableSelectionToolbar
          clearSelection={() => setSelectedRowIds(new Set())}
          copyLinks={copySelectedRowLinks}
          getSelectionValue={getSelectionValue}
          onApply={saveSelectedPropertyValue}
          onUpdateConfig={updateDatabasePropertyConfig}
          personOptions={personOptions}
          properties={selectionProperties}
          selectedCount={selectedRows.length}
        />
      ) : null}
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
            editable && hasDatabasePageDragPayload(event.dataTransfer)

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
            updateRowDropTarget(
              resolveRowDropTarget(event.clientY, event.clientX)
            )
          }
        }}
        onDrop={(event) => {
          const dragPayload = getDatabasePageDragPayload(event.dataTransfer)
          const resolvedRowTarget = isTableGrouped
            ? null
            : resolveRowDropTarget(event.clientY, event.clientX)

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
          function moveInternalRow() {
            const nextMove = getDraggedRowMove();

            if (isTableSorted) {
              if (nextMove) {
                setPendingSortedRowReorder(nextMove);
              }
            } else if (nextMove) {
              applyRowMove(nextMove);
            }
          }
          function insertExternalRow(
            dragPayload: NonNullable<
              ReturnType<typeof getDatabasePageDragPayload>
            >,
          ) {
            if (isTableGrouped) {
              const target = groupRowDropTargetRef.current;
              const section = groupedSections.find(
                (candidate) => candidate.id === target?.sectionId,
              );

              if (target && section) {
                addDraggedPageRow(
                  dragPayload,
                  getAnchoredRowInsertPosition(
                    rows,
                    section.rows,
                    target.localTargetIndex,
                  ),
                  section.groupValue,
                  groupProperty,
                );
              }
            } else {
              addDraggedPageRow(
                dragPayload,
                getAnchoredRowInsertPosition(
                  rows,
                  visibleRows,
                  resolvedRowTarget?.index ?? 0,
                ),
              );
            }
          }
          if (draggedRowId) {
            moveInternalRow();
          } else if (dragPayload) {
            insertExternalRow(dragPayload);
          }
          clearRowDrag()
        }}
      >
        {!isInlineTableScrollEnabled ? (
          <DatabaseRowDragControls
            canReorderRows={canReorderRows}
            draggedRowId={draggedRowId}
            editable={editable}
            hoveredRowId={hoveredRowId}
            onDragEnd={clearRowDrag}
            onDragStart={startRowDrag}
            onHoveredRowChange={setHoveredRowId}
            onSelectedRowChange={toggleSelectedRow}
            rowDragTitle={rowDragTitle}
            rowLayout={rowLayout}
            rowsById={rowsById}
            selectedRowIds={selectedRowIds}
          />
        ) : null}
        {!isInlineTableScrollEnabled ? (
          <DatabaseRowDropLine depth={rowDropLineDepth} top={rowDropLineTop} />
        ) : null}
        {isTableGrouped ? (
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
        ) : null}
        <div
          className="database-table-scroll database-inline-scroll"
          ref={tableScrollRef}
        >
          <div className="database-table-scroll-content database-inline-scroll-content">
            {isInlineTableScrollEnabled ? (
          <DatabaseRowDragControls
            canReorderRows={canReorderRows}
            draggedRowId={draggedRowId}
            editable={editable}
            hoveredRowId={hoveredRowId}
            onDragEnd={clearRowDrag}
            onDragStart={startRowDrag}
            onHoveredRowChange={setHoveredRowId}
            onSelectedRowChange={toggleSelectedRow}
            rowDragTitle={rowDragTitle}
            rowLayout={rowLayout}
            rowsById={rowsById}
            selectedRowIds={selectedRowIds}
          />
        ) : null}
            {isInlineTableScrollEnabled ? (
          <DatabaseRowDropLine depth={rowDropLineDepth} top={rowDropLineTop} />
        ) : null}
            {isTableGrouped ? (
              <div className="database-table-groups">
                {groupedSections.map((section) => {
                  const isCollapsed = collapsedGroups[section.id] === true

                  function renderGroupRows() {
                    return (
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
                              disabled={!databaseId}
                              onClick={() =>
                                addDatabaseRow(
                                  section.groupValue,
                                  groupProperty,
                                )
                              }
                            />
                          ) : undefined
                        }
                        measurementKey={tableMeasurementKey}
                        onRowsRendered={scheduleMeasureRows}
                        renderRow={renderTableRow}
                        rows={section.rows}
                        tableMinWidth={tableMinWidth}
                        virtualizationEnabled={
                          !draggedRowId && !isExternalRowDragActive
                        }
                      />
                    );
                  }

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
                      {!isCollapsed ? <>{renderGroupRows()}</> : null}
                    </section>
                  );
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
                      disabled={!databaseId}
                      onClick={() => addDatabaseRow()}
                    />
                  ) : undefined
                }
                header={renderTableHeader("table")}
                measurementKey={tableMeasurementKey}
                onRowsRendered={scheduleMeasureRows}
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
                className="database-rows-pagination-status flex items-center justify-center gap-2 px-4 py-3 text-sm text-content-secondary"
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
                <DefaultPageIcon />
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
