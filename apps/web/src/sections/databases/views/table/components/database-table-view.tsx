import { useDatabaseMarquee } from "../../shared/hooks/use-database-marquee";
import { DatabaseRowActionsProvider } from "../../shared/components/database-row-actions";
import { DataGrid } from "@/components/ui/data-grid/data-grid";
import { DataGridCellSelection } from "@/components/ui/data-grid/data-grid-cell-selection";
import { DataGridTableBodyRow } from "@/components/ui/data-grid/data-grid-table";
import { useDatabaseGrid, DatabaseGridScrollContext } from "../hooks/use-database-grid";
import {
  DatabaseRowDragControls,
  DatabaseRowDropLine,
} from "../../../interactions/components/database-row-controls";
import { getDatabaseRowMoveAnchors } from "@zilobase/features/databases";
import { useManualRecordPlacement } from "../../state/components/manual-record-placement";
import {
  retainTableRowDropTarget,
  retainGroupRowDropTarget,
  propertyInsertPositions,
} from "../lib/database-table-model";
import { useTableRowLayout } from "../hooks/row-layout";
import { useTableColumns } from "../hooks/use-table-columns";
import { useDatabaseSelection } from "../../shared/hooks/selection";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Reorder } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Loader2, Plus } from "@/components/icons";
import { toast } from "sonner";
import { useChangeDatabaseRow } from "@zilobase/features/databases/react";
import { useOptionalPageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { DefaultPageIcon, PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import { cn } from "@/lib/utils";
import { useUndoHistory } from "@/app/shortcuts/undo-history";
import { getColorTokenBadgeClassName, getColorTokenDotClassName } from "@/lib/color-tokens";

import { AddDatabasePropertyMenu } from "../../../properties/editors/components/add-database-property-menu";
import { DatabaseCellContent } from "../../shared/components/database-cell-content";

import { setDatabasePageDragPayload } from "../../../interactions/lib/database-page-drop";
import { DatabasePageLink } from "../../../interactions/components/database-page-link";
import { DatabaseFormulaDialog } from "../../../properties/formula/components/database-formula-dialog";
import {
  DatabaseNamePropertyMenu,
  DatabasePropertyMenu,
} from "../../../properties/editors/components/database-property-menu";
import { DatabasePropertyValue } from "../../../properties/editors/components/database-property-value";
import { getDatabasePropertyType } from "../../../properties/lib/property-catalog";
import { getGroupedRecordMove } from "@zilobase/features/databases";
import {
  getDatabasePropertyIcon,
  getNameColumnWrapContent,
  getPropertyWrapContent,
} from "@zilobase/features/databases";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/components/database-view-context";
import {
  getDatabaseSubItemLineParentRowId,
  getSubItemCreateRowsAfterRow,
} from "@zilobase/features/databases";
import { useDatabaseRowsScroll } from "../../../interactions/hooks/use-database-rows-scroll";
import { useInlineDatabaseScroll } from "../../../interactions/hooks/use-inline-database-scroll";
import { databaseItemMatchesFilter } from "@zilobase/features/databases";
import { getDatabaseTableGroupSections } from "@zilobase/features/databases";
import { getDatabaseRowDropTarget } from "../../../interactions/lib/database-table-layout";
import {
  claimDatabaseRowDropOwner,
  getAnchoredRowInsertPosition,
  getFilteredReorderedRowIds,
  finishDatabaseRowDrag,
  hideNativeDatabaseRowDragPreview,
  releaseDatabaseRowDropOwner,
  startDatabaseRowDrag,
  subscribeDatabaseRowDropOwner,
} from "../../../interactions/lib/database-row-drag";
import { useDatabaseRowDragOverlay } from "../../../interactions/hooks/use-database-row-drag-overlay";
import { canCreateRowInGroup } from "@zilobase/features/databases";

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
  type GroupRowDropTarget,
  type GroupSection,
  type RowMove,
  type TableRow,
  type TableRowDropTarget,
} from "../lib/database-table-model";
import {
  DatabaseTable,
  DatabaseVirtualizedTable,
  getConditionalColorClassName,
  getTableMinWidthStyle,
  useSyncedHorizontalScroll,
} from "./database-table-shell";
import { CreateDatabaseRowButton, DatabaseActiveTableCell } from "./database-table-cell";
import { DatabaseSelectionToolbar } from "../../shared/components/database-selection-toolbar";
import { DatabaseHeaderReorderItem } from "./database-table-drag-controls";

export type TableRowInteractions = {
  newRowLabel?: string;
  canCreateRow: (parentRowId?: string) => boolean;
  createRow: (parentRowId?: string) => void;
  dragRow?: (row: TableRow, event: ReactDragEvent<HTMLButtonElement>) => void;
  canDragRow?: (row: TableRow) => boolean;
  moveRow?: (move: RowMove) => void | Promise<void>;
  renderSelectionToolbar: (selectedRows: TableRow[], clearSelection: () => void) => ReactNode;
};

export function DatabaseTableView({
  rowInteractions,
}: { rowInteractions?: TableRowInteractions } = {}) {
  const sidePane = useOptionalPageSidePane();
  const {
    addDatabaseProperty,
    addDraggedPageRow,
    fetchNextPage,
    getDatabasePageDragPayload,
    hasDatabasePageDragPayload,
    addDatabaseRow,
    onOpenPage,
    savePropertyValue,
    setViewGroupProperty,
    renameDatabaseProperty,
    updateDatabasePropertyConfig,
    updateNameColumnConfig,
    saveDatabasePropertyOrder,
    saveDatabaseSorts,
  } = useDatabaseActionsContext();
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
  } = useDatabaseDataContext();
  const {
    activeView,
    headerMenusEnabled,
    layoutSettings,
    titlePropertyLabel: nameColumnLabel,
    showPageIconInTitle: nameColumnShowPageIcon,
    subItemsSettings,
  } = useDatabaseUiContext();
  const moveRow = useChangeDatabaseRow({ dataSourceId: databaseId ?? undefined });
  const undoHistory = useUndoHistory();
  const loadedDatabaseId = requireDatabaseId(databaseId);

  const canEditStructure = editable && (canAddDatabaseProperties ?? true);

  const canUseHeaderMenus = headerMenusEnabled ?? editable;
  const nameColumnWrapContent = getNameColumnWrapContent(databaseConfig);

  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [isExternalRowDragActive, setIsExternalRowDragActive] = useState(false);

  const propertyValuesByKeyRef = useRef(propertyValuesByKey);
  propertyValuesByKeyRef.current = propertyValuesByKey;
  const {
    selectedRowIds,
    setSelectedRowIds,
    selectedRows,
    getSelectionValue,
    saveSelectedPropertyValue,
    toggleSelectedRow,
  } = useDatabaseSelection({
    rows,
    propertyValuesByKey,
    propertyValuesByKeyRef,
    savePropertyValue,
    undoHistory,
  });

  const finishRowDragRef = useRef<() => void>(() => {});
  const rowDragOverlay = useDatabaseRowDragOverlay(finishRowDragRef);
  const [rowDropTarget, setRowDropTarget] = useState<TableRowDropTarget | null>(null);
  const rowDropTargetRef = useRef<TableRowDropTarget | null>(null);
  const rowDragStartClientXRef = useRef<number | null>(null);
  const [groupRowDropTarget, setGroupRowDropTarget] = useState<GroupRowDropTarget | null>(null);
  const groupRowDropTargetRef = useRef<GroupRowDropTarget | null>(null);
  const isExternalRowDragActiveRef = useRef(false);
  const rowDropOwner = useMemo(() => ({}), []);

  const manualPlacement = useManualRecordPlacement();

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const gridScope = [databaseWorkspaceId, hostDatabaseId, databaseId, activeView?.id].join(":");
  const [subItemExpansionScope, setSubItemExpansionScope] = useState(gridScope);
  const [openedSubItemRowIds, setOpenedSubItemRowIds] = useState<Set<string>>(() => new Set());
  if (subItemExpansionScope !== gridScope) {
    setSubItemExpansionScope(gridScope);
    setOpenedSubItemRowIds(new Set());
  }
  const collapsedSubItemRowIds = useMemo(
    () =>
      new Set(
        Object.keys(subItemChildRowIdsByParentId).filter((id) => !openedSubItemRowIds.has(id)),
      ),
    [openedSubItemRowIds, subItemChildRowIdsByParentId],
  );
  const stickyHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  const isTableSorted = activeDatabaseSorts.length > 0;
  const isTableFiltered = activeDatabaseFilters.length > 0;
  const isTableGrouped = Boolean(groupProperty);
  const isSubItemsNested =
    subItemsSettings.enabled && subItemsSettings.display === "nested" && !isTableGrouped;
  const renderedProperties = visibleProperties;
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
  });

  const tableMeasurementKey = useMemo(
    () =>
      [
        nameColumnWrapContent ? "name-wrap" : "name-nowrap",
        ...renderedProperties.map((property) =>
          getPropertyWrapContent(property.property.config)
            ? `${property.id}:wrap`
            : `${property.id}:nowrap`,
        ),
      ].join("|"),
    [nameColumnWrapContent, renderedProperties],
  );

  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions],
  );

  const canSelectRows = editable || Boolean(rowInteractions);
  const canReorderRows = editable || Boolean(rowInteractions?.moveRow);
  const canDragRows = canReorderRows || Boolean(rowInteractions?.dragRow);
  const canCreateRow = (parentRowId?: string) =>
    rowInteractions ? rowInteractions.canCreateRow(parentRowId) : editable;
  const createRow = (parentRowId?: string) => {
    if (rowInteractions) rowInteractions.createRow(parentRowId);
    else addDatabaseRow(undefined, undefined, parentRowId);
  };

  const rowDragTitle = getRowDragTitle({
    canReorder: canReorderRows,
    isFiltered: isTableFiltered,
    isGrouped: isTableGrouped,
    isSorted: isTableSorted,
  });

  const { isInlineScrollEnabled: isInlineTableScrollEnabled, style: tableWrapStyle } =
    useInlineDatabaseScroll({
      getContentWidth: getInlineTableContentWidth,
      scrollRef: tableScrollRef,
      wrapperRef: tableWrapRef,
    });
  useSyncedHorizontalScroll(
    stickyHeaderScrollRef,
    tableScrollRef,
    `${tableMinWidth}:${isTableGrouped ? "grouped" : "ungrouped"}`,
  );
  const { sentinelRef: rowsScrollSentinelRef } = useDatabaseRowsScroll({
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  });
  const {
    headerCheckboxRef,
    rowLayout,
    rowLayoutRef,
    getRowLayoutElement,
    measureRows,
    scheduleMeasureRows,
  } = useTableRowLayout({
    tableWrapRef,
    tableScrollRef,
    isInlineTableScrollEnabled,
  });
  const groupedSections = useMemo<GroupSection[]>(() => {
    if (!isTableGrouped) {
      return [];
    }

    return getDatabaseTableGroupSections({
      groupProperty,
      personOptionsById,
      propertyValuesByKey,
      rows: sortedRows,
    });
  }, [groupProperty, isTableGrouped, personOptionsById, propertyValuesByKey, sortedRows]);
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const nestedVisibleRows = useMemo(() => {
    return getVisibleNestedTableRows({
      collapsedRowIds: collapsedSubItemRowIds,
      nested: isSubItemsNested,
      parentRowIdsByRowId: subItemParentRowIdsByRowId,
      rows: sortedRows,
    });
  }, [collapsedSubItemRowIds, isSubItemsNested, sortedRows, subItemParentRowIdsByRowId]);
  const visibleRows = useMemo(
    () =>
      isTableGrouped
        ? groupedSections.flatMap((section) =>
            collapsedGroups[section.id] === true ? [] : section.rows,
          )
        : nestedVisibleRows,
    [collapsedGroups, groupedSections, isTableGrouped, nestedVisibleRows],
  );
  const expandedSubItemRowIds = useMemo(() => {
    const expandedRowIds = new Set<string>();

    if (!isSubItemsNested) return expandedRowIds;

    for (const row of visibleRows) {
      const isExpanded = openedSubItemRowIds.has(row.id);

      if (isExpanded) expandedRowIds.add(row.id);
    }

    return expandedRowIds;
  }, [openedSubItemRowIds, isSubItemsNested, visibleRows]);
  const subItemCreateRowIdsByAfterRowId = useMemo(
    () =>
      getSubItemCreateRowsAfterRow({
        expandedRowIds: expandedSubItemRowIds,
        parentRowIdsByRowId: subItemParentRowIdsByRowId,
        rows: visibleRows,
      }),
    [expandedSubItemRowIds, subItemParentRowIdsByRowId, visibleRows],
  );
  const visibleRowIndexById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index])),
    [visibleRows],
  );
  const grid = useDatabaseGrid({
    rows: visibleRows,
    allRows: rows,
    columnKeys,
    columnWidths,
    properties: renderedProperties,
    values: propertyValuesByKey,
    people: personOptions,
    editable,
    nameLabel: nameColumnLabel,
    databaseId: loadedDatabaseId,
    hostDatabaseId,
    scope: gridScope,
    savePropertyValue,
  });
  useDatabaseMarquee({
    surfaceRef: tableWrapRef,
    enabled: canSelectRows,
    scope: gridScope,
    rowIds: visibleRows.map((row) => row.id),
    selectedRowIds,
    setSelectedRowIds,
    onStart: () => grid.table.resetCellSelection(true),
  });
  const groupSectionByRowId = useMemo(() => {
    const sectionsByRowId = new Map<string, GroupSection>();

    groupedSections.forEach((section) => {
      section.rows.forEach((row) => sectionsByRowId.set(row.id, section));
    });

    return sectionsByRowId;
  }, [groupedSections]);

  const getSubItemDropParentRowId = (targetIndex: number, preferPreviousRowAsParent = false) =>
    !rowInteractions &&
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
      : undefined;
  const resolveRowDropTarget = (clientY: number, clientX: number) => {
    const layoutElement = getRowLayoutElement();

    if (!layoutElement) {
      return null;
    }

    const relativeY = clientY - layoutElement.getBoundingClientRect().top;
    const target = getDatabaseRowDropTarget(rowLayoutRef.current.dropTops, relativeY);

    if (!target) return null;

    const previousRow = visibleRows[target.index - 1];
    const dragStartClientX = rowDragStartClientXRef.current;
    const preferPreviousRowAsParent = Boolean(
      draggedRowId &&
      previousRow &&
      previousRow.id !== draggedRowId &&
      dragStartClientX !== null &&
      clientX >= dragStartClientX + DATABASE_SUB_ITEM_DRAG_INDENT,
    );
    const subItemParentRowId = draggedRowId
      ? getSubItemDropParentRowId(target.index, preferPreviousRowAsParent)
      : undefined;

    return {
      ...target,
      ...(subItemParentRowId !== undefined ? { subItemParentRowId } : {}),
    };
  };
  const updateRowDropTarget = (nextTarget: TableRowDropTarget | null) => {
    rowDropTargetRef.current = nextTarget;
    setRowDropTarget((currentTarget) => retainTableRowDropTarget(currentTarget, nextTarget));
  };
  const updateGroupRowDropTarget = (nextTarget: GroupRowDropTarget | null) => {
    groupRowDropTargetRef.current = nextTarget;
    setGroupRowDropTarget((currentTarget) => retainGroupRowDropTarget(currentTarget, nextTarget));
  };
  const getGroupRowDropTarget = (clientY: number): GroupRowDropTarget | null => {
    const wrapperElement = tableWrapRef.current;

    if (!wrapperElement) {
      return null;
    }

    const groupElements = Array.from(
      wrapperElement.querySelectorAll<HTMLElement>(".database-table-group[data-database-group-id]"),
    );
    const groupElement =
      groupElements.find((element) => {
        const rect = element.getBoundingClientRect();

        return clientY >= rect.top && clientY <= rect.bottom;
      }) ??
      groupElements.reduce<HTMLElement | null>((closest, element) => {
        if (!closest) return element;

        const rect = element.getBoundingClientRect();
        const closestRect = closest.getBoundingClientRect();
        const distance = Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
        const closestDistance = Math.min(
          Math.abs(clientY - closestRect.top),
          Math.abs(clientY - closestRect.bottom),
        );

        return distance < closestDistance ? element : closest;
      }, null);

    if (!groupElement?.dataset.databaseGroupId) {
      return null;
    }

    const rowElements = Array.from(
      groupElement.querySelectorAll<HTMLTableRowElement>("tbody tr[data-database-row-id]"),
    );
    const localTargetIndex = rowElements.findIndex((rowElement) => {
      const rect = rowElement.getBoundingClientRect();

      return clientY < rect.top + rect.height / 2;
    });
    const resolvedTargetIndex = localTargetIndex === -1 ? rowElements.length : localTargetIndex;
    const targetRow = rowElements[resolvedTargetIndex];
    const previousRow = rowElements[resolvedTargetIndex - 1];
    const groupRect = groupElement.getBoundingClientRect();
    const layoutRect = getRowLayoutElement()?.getBoundingClientRect();

    if (!layoutRect) {
      return null;
    }

    const top =
      (targetRow?.getBoundingClientRect().top ??
        previousRow?.getBoundingClientRect().bottom ??
        groupRect.bottom) - layoutRect.top;

    return {
      localTargetIndex: resolvedTargetIndex,
      sectionId: groupElement.dataset.databaseGroupId,
      top,
    };
  };
  const getGroupSectionForRowId = (rowId: string) => {
    if (!isTableGrouped) {
      return null;
    }

    return groupSectionByRowId.get(rowId) ?? null;
  };
  const getDraggedRowGroupDropTarget = () => {
    const activeGroupDropTarget = groupRowDropTargetRef.current;

    if (!draggedRowId || !activeGroupDropTarget || !isTableGrouped) {
      return null;
    }

    const sourceSection = getGroupSectionForRowId(draggedRowId);

    if (!sourceSection) {
      return null;
    }

    const targetSection = groupedSections.find(
      (section) => section.id === activeGroupDropTarget.sectionId,
    );

    if (!targetSection) {
      return null;
    }

    return {
      isCrossGroup: targetSection.id !== sourceSection.id,
      localTargetIndex: activeGroupDropTarget.localTargetIndex,
      section: targetSection,
      sourceSection,
    };
  };
  const getDraggedRowMove = (): RowMove | null => {
    if (
      !draggedRowId ||
      (isTableGrouped ? groupRowDropTargetRef.current === null : rowDropTargetRef.current === null)
    ) {
      return null;
    }

    if (isTableGrouped) {
      const groupTarget = getDraggedRowGroupDropTarget();

      if (!groupTarget) {
        return null;
      }

      if (!groupProperty) return null;
      return getGroupedRecordMove({
        rows,
        targetRows: groupTarget.section.rows,
        rowId: draggedRowId,
        targetIndex: groupTarget.localTargetIndex,
        property: groupProperty,
        propertyValuesByKey,
        sourceGroupValue: groupTarget.sourceSection.groupValue,
        targetGroupValue: groupTarget.section.groupValue,
      });
    }

    const targetIndex = rowDropTargetRef.current?.index ?? 0;
    const rowIds = getFilteredReorderedRowIds(rows, visibleRows, draggedRowId, targetIndex);
    const subItemParentRowId = rowDropTargetRef.current?.subItemParentRowId;

    return rowIds || subItemParentRowId !== undefined
      ? {
          ...getDatabaseRowMoveAnchors(rowIds ?? rows.map((row) => row.id), draggedRowId),
          pageId: rowsById.get(draggedRowId)!.pageId,
          ...(subItemParentRowId !== undefined ? { subItemParentRowId } : {}),
        }
      : null;
  };
  const applyRowMove = (nextMove: RowMove, clearSortViewId?: string) => {
    if (!databaseId || !hostDatabaseId) return;
    const { parentPropertyId, subItemPropertyId } = subItemsSettings;
    moveRow.mutate(
      {
        databaseId: hostDatabaseId,
        dataSourceId: databaseId,
        rowId: nextMove.rowId,
        ...(clearSortViewId ? { clearSortViewId } : {}),
        placement: { afterRowId: nextMove.afterRowId, beforeRowId: nextMove.beforeRowId },
        ...(nextMove.pageTitle !== undefined ? { title: nextMove.pageTitle } : {}),
        ...(nextMove.group
          ? { valuesByPropertyId: { [nextMove.group.propertyId]: nextMove.group.serializedValue } }
          : {}),
        ...(nextMove.subItemParentRowId !== undefined && parentPropertyId && subItemPropertyId
          ? {
              hierarchy: {
                parentRowId: nextMove.subItemParentRowId,
                parentPropertyId,
                subItemPropertyId,
              },
            }
          : {}),
      },
      { onError: (error) => toast.error(error.message) },
    );
    if (nextMove.subItemParentRowId)
      setOpenedSubItemRowIds((current) => {
        const next = new Set(current);
        next.add(nextMove.subItemParentRowId!);
        return next;
      });
  };
  const clearRowDrag = () => {
    finishDatabaseRowDrag();
    rowDragOverlay.clear();
    setDraggedRowId(null);
    updateRowDropTarget(null);
    updateGroupRowDropTarget(null);
    rowDragStartClientXRef.current = null;
    isExternalRowDragActiveRef.current = false;
    setIsExternalRowDragActive(false);
  };
  finishRowDragRef.current = clearRowDrag;
  const rowDropLineTop = (isTableGrouped ? !groupRowDropTarget : rowDropTarget === null)
    ? null
    : isTableGrouped
      ? (groupRowDropTarget?.top ?? null)
      : (rowDropTarget?.lineTop ?? null);
  const rowDropParentRowId = rowDropTarget?.subItemParentRowId;
  const rowDropLineDepth = rowDropParentRowId
    ? (subItemDepthByRowId[rowDropParentRowId] ?? 0) + 1
    : 0;
  const conditionalColorsByRowId = useMemo(() => {
    const colorsByRowId = new Map<
      string,
      { propertyColors: Record<string, string>; rowColor?: string }
    >();

    if (activeConditionalColors.length === 0) {
      return colorsByRowId;
    }

    for (const row of visibleRows) {
      const propertyColors: Record<string, string> = {};
      let rowColor: string | undefined;

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
          continue;
        }

        if (setting.applyTo === "entire-row") {
          rowColor ??= setting.color;
        } else {
          propertyColors[setting.filter.propertyId] ??= setting.color;
        }
      }

      colorsByRowId.set(row.id, { propertyColors, rowColor });
    }

    return colorsByRowId;
  }, [activeConditionalColors, personOptionsById, properties, propertyValuesByKey, visibleRows]);

  useEffect(() => {
    const clearSelectionInAnotherTable = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const targetTable = event.target.closest(".database-table-wrap");

      if (targetTable && targetTable !== tableWrapRef.current) {
        grid.table.resetCellSelection(true);
      }
    };

    document.addEventListener("pointerdown", clearSelectionInAnotherTable, true);

    return () => document.removeEventListener("pointerdown", clearSelectionInAnotherTable, true);
  }, [grid.table]);

  useEffect(() => {
    if (!draggedRowId && !isExternalRowDragActive) {
      return;
    }

    let dropCleanupTimer: number | null = null;
    const clearDropVisuals = () => {
      releaseDatabaseRowDropOwner(rowDropOwner);
      updateRowDropTarget(null);
      updateGroupRowDropTarget(null);

      if (!draggedRowId) {
        isExternalRowDragActiveRef.current = false;
        setIsExternalRowDragActive(false);
      }
    };
    const clearWhenPointerLeavesTable = (event: DragEvent) => {
      const tableElement = tableWrapRef.current;
      const pointerElement = document.elementFromPoint(event.clientX, event.clientY);

      if (tableElement && pointerElement && tableElement.contains(pointerElement)) {
        return;
      }

      clearDropVisuals();
    };
    const clearAfterDrop = () => {
      if (dropCleanupTimer !== null) {
        window.clearTimeout(dropCleanupTimer);
      }

      dropCleanupTimer = window.setTimeout(clearDropVisuals, 0);
    };

    window.addEventListener("dragover", clearWhenPointerLeavesTable, true);
    window.addEventListener("dragend", clearDropVisuals, true);
    window.addEventListener("drop", clearAfterDrop, true);

    return () => {
      window.removeEventListener("dragover", clearWhenPointerLeavesTable, true);
      window.removeEventListener("dragend", clearDropVisuals, true);
      window.removeEventListener("drop", clearAfterDrop, true);

      if (dropCleanupTimer !== null) {
        window.clearTimeout(dropCleanupTimer);
      }
    };
  }, [draggedRowId, isExternalRowDragActive, rowDropOwner]);

  useEffect(
    () =>
      subscribeDatabaseRowDropOwner((owner) => {
        if (owner === rowDropOwner) {
          return;
        }

        // Exactly one table owns row-drop feedback. When another database
        // claims the drag, synchronously release this table's previous line.
        updateRowDropTarget(null);
        updateGroupRowDropTarget(null);

        if (!draggedRowId) {
          isExternalRowDragActiveRef.current = false;
          setIsExternalRowDragActive(false);
        }
      }),
    [draggedRowId, rowDropOwner],
  );

  useLayoutEffect(() => {
    measureRows();
  }, [
    collapsedGroups,
    measureRows,
    renderedColumnIds,
    isExternalRowDragActive,
    draggedRowId,
    visibleRows,
  ]);

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  const togglePropertyGrouping = (propertyId: string, isGrouped: boolean) => {
    setViewGroupProperty(isGrouped ? null : propertyId);
  };

  const startRowDrag = (row: TableRow, event: ReactDragEvent<HTMLButtonElement>) => {
    if (rowInteractions?.dragRow && !rowInteractions.moveRow) {
      rowInteractions.dragRow(row, event);
      return;
    }
    if (!canReorderRows) {
      return;
    }

    const measuredLayout = measureRows();
    const rowElement = tableWrapRef.current?.querySelector(`tr[data-database-row-id="${row.id}"]`);
    const rowRect = rowElement?.getBoundingClientRect();
    const tableRect = tableWrapRef.current
      ?.querySelector(".database-table")
      ?.getBoundingClientRect();

    if (rowRect && tableRect) {
      const nextOverlay = {
        height: rowRect.height,
        left: rowRect.left,
        offsetX: event.clientX - rowRect.left,
        offsetY: event.clientY - rowRect.top,
        title: getRowTitle(row),
        top: rowRect.top,
        width: tableRect.width,
      };

      rowDragOverlay.start(nextOverlay);
    }

    startDatabaseRowDrag();
    hideNativeDatabaseRowDragPreview(event.dataTransfer);
    rowDragStartClientXRef.current = event.clientX;
    setDraggedRowId(row.id);
    claimDatabaseRowDropOwner(rowDropOwner);
    const sourceRowIndex = visibleRowIndexById.get(row.id) ?? 0;
    updateRowDropTarget({
      index: sourceRowIndex,
      lineTop: measuredLayout.dropTops[sourceRowIndex] ?? 0,
    });
    const sourceSection = groupSectionByRowId.get(row.id);
    const sourceLocalIndex = sourceSection?.rows.findIndex((sourceRow) => sourceRow.id === row.id);

    updateGroupRowDropTarget(
      sourceSection && sourceLocalIndex !== undefined
        ? {
            localTargetIndex: sourceLocalIndex,
            sectionId: sourceSection.id,
            top: measuredLayout.dropTops[sourceRowIndex] ?? 0,
          }
        : null,
    );
    if (rowInteractions?.dragRow) {
      rowInteractions.dragRow(row, event);
      return;
    }
    setDatabasePageDragPayload(event.dataTransfer, {
      databaseId: loadedDatabaseId,
      hostDatabaseId: hostDatabaseId ?? undefined,
      pageId: row.pageId,
      rowId: row.id,
      title: getRowTitle(row),
    });
  };

  const renderInsertPropertyHeader = (insertKey: string, position: number) => (
    <th
      role="columnheader"
      className="database-add-property-cell database-insert-property-cell"
      key={insertKey}
    >
      <AddDatabasePropertyMenu
        disabled={false}
        isPending={false}
        onAdd={(type, label) => addInsertedDatabaseProperty(type, label, position, insertKey)}
        onOpenChange={(open) => {
          if (!open) {
            clearPendingInsertProperty(insertKey);
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
  );

  const renderInsertPropertyCell = useCallback(
    (insertKey: string) => (
      <td
        aria-hidden="true"
        className="database-value-cell database-insert-property-placeholder"
        key={insertKey}
      />
    ),
    [],
  );
  const renderTableHeader = (headerScope = "default") => (
    <thead>
      <Reorder.Group
        as="tr"
        role="row"
        axis="x"
        values={headerColumnIds}
        onReorder={queueColumnHeaderOrder}
      >
        {headerColumnIds.map((columnId) => {
          const leftInsertKey = getInsertPropertyColumnKey(columnId, "left");
          const rightInsertKey = getInsertPropertyColumnKey(columnId, "right");
          const showLeftInsert = pendingInsertPropertyKey === leftInsertKey;
          const showRightInsert = pendingInsertPropertyKey === rightInsertKey;
          const property = propertiesById.get(columnId);
          const dragTitle = canReorderColumns ? "Drag to reorder column" : undefined;
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
                onOpenChange={(open) => handleEditingPropertyOpenChange(headerScope, "name", open)}
                onInsertProperty={(side) => openInsertPropertyMenu("name", 0, side)}
                onToggleGroup={() => togglePropertyGrouping("name", groupProperty?.id === "name")}
                open={editingPropertyKey === getHeaderEditingKey(headerScope, "name")}
                schemaActionsEnabled={canEditStructure}
                sortDirection={
                  activeDatabaseSorts.find((sort) => sort.column === "name")?.direction
                }
                onSort={(direction) =>
                  void saveDatabaseSorts([
                    ...activeDatabaseSorts.filter((sort) => sort.column !== "name"),
                    { column: "name", direction },
                  ])
                }
                onUpdateConfig={(config) => void updateNameColumnConfig?.(config)}
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
            const propertyWrapContent = getPropertyWrapContent(property.property.config);
            const PropertyIcon = getDatabasePropertyType(property.property.type).icon;
            const customPropertyIcon = getDatabasePropertyIcon(property.property.config);
            return canUseHeaderMenus ? (
              <DatabasePropertyMenu
                config={property.property.config}
                databaseConfig={databaseConfig}
                databaseId={loadedDatabaseId}
                databasePropertyId={property.id}
                isGrouped={groupProperty?.property.id === property.property.id}
                name={property.property.name}
                onOpenChange={(open) =>
                  handleEditingPropertyOpenChange(headerScope, property.id, open)
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
                open={editingPropertyKey === getHeaderEditingKey(headerScope, property.id)}
                schemaActionsEnabled={canEditStructure}
                sortDirection={
                  activeDatabaseSorts.find((sort) => sort.column === property.id)?.direction
                }
                sourceDatabaseId={loadedDatabaseId}
                sourceDatabaseName={databaseName}
                sourcePropertyId={property.property.id}
                onSort={(direction) =>
                  void saveDatabaseSorts([
                    ...activeDatabaseSorts.filter((sort) => sort.column !== property.id),
                    { column: property.id, direction },
                  ])
                }
                onUpdateConfig={(config) => void updateDatabasePropertyConfig(property.id, config)}
                triggerDragProps={{
                  onClick: (event) => {
                    if (suppressPropertyHeaderClickRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      suppressPropertyHeaderClickRef.current = false;
                      return;
                    }

                    handleEditingPropertyOpenChange(headerScope, property.id, true);
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
                ? renderInsertPropertyHeader(leftInsertKey, insertPositions.left)
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
                      onPointerDown={(event) => startColumnResize(columnId, event)}
                    />
                  </>
                )}
              </DatabaseHeaderReorderItem>
              {showRightInsert
                ? renderInsertPropertyHeader(rightInsertKey, insertPositions.right)
                : null}
            </Fragment>
          );
        })}
        {canEditStructure ? (
          <th role="columnheader" className="database-add-property-cell">
            <AddDatabasePropertyMenu
              disabled={false}
              isPending={false}
              onAdd={addDatabasePropertyAndMaybeOpenFormula}
            />
            <span
              aria-hidden="true"
              className="database-column-resize-handle"
              onPointerDown={(event) => startColumnResize(ADD_PROPERTY_COLUMN_ID, event)}
            />
          </th>
        ) : null}
      </Reorder.Group>
    </thead>
  );

  const renderTableRow = useCallback(
    (row: TableRow, index: number, measureElement: (node: Element | null) => void) => {
      const conditionalColors = conditionalColorsByRowId.get(row.id) ?? {
        propertyColors: {},
        rowColor: undefined,
      };
      const nameCellKey = `${row.pageId}:name`;

      const childRowIds = subItemChildRowIdsByParentId[row.id] ?? [];
      const hasSubItems = childRowIds.length > 0;
      const subItemDepth = isSubItemsNested ? (subItemDepthByRowId[row.id] ?? 0) : 0;
      const subItemsExpanded = openedSubItemRowIds.has(row.id);
      const showSubItemToggle = isSubItemsNested;
      const toggleSubItems = () => {
        setOpenedSubItemRowIds((current) => {
          const next = new Set(current);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        });
      };

      const tableRow = (
        <DataGridTableBodyRow
          row={grid.table.getRow(row.id)}
          dataIndex={index}
          rowRef={measureElement}
          key={row.id}
          rowProps={{
            className: getConditionalColorClassName(conditionalColors.rowColor),
            "data-database-row-id": row.id,
            "data-row-selected": selectedRowIds.has(row.id) ? "true" : undefined,
            "data-side-pane-open": sidePane?.sidePanePageId === row.pageId ? "true" : undefined,
            onMouseEnter: canSelectRows ? () => setHoveredRowId(row.id) : undefined,
          }}
        >
          {renderedColumnIds.map((columnId) => {
            const leftInsertKey = getInsertPropertyColumnKey(columnId, "left");
            const rightInsertKey = getInsertPropertyColumnKey(columnId, "right");
            const showLeftInsert = pendingInsertPropertyKey === leftInsertKey;
            const showRightInsert = pendingInsertPropertyKey === rightInsertKey;
            const property = propertiesById.get(columnId);

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
                  {showLeftInsert ? renderInsertPropertyCell(leftInsertKey) : null}
                  <DatabaseActiveTableCell
                    cellKey={key}
                    rowId={row.id}
                    columnId={columnId}
                    presenceKey={`${row.id}:${pageProperty.id}`}
                    className={cn(
                      "database-value-cell",
                      getConditionalColorClassName(conditionalColors.propertyColors[property.id]),
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
                            updateDatabasePropertyConfig(databasePropertyId, config)
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
                  {showRightInsert ? renderInsertPropertyCell(rightInsertKey) : null}
                </Fragment>
              );
            }

            if (columnId === DATABASE_NAME_COLUMN_ID) {
              return (
                <Fragment key={columnId}>
                  {showLeftInsert ? renderInsertPropertyCell(leftInsertKey) : null}
                  <DatabaseActiveTableCell
                    cellKey={nameCellKey}
                    rowId={row.id}
                    columnId={columnId}
                    presenceKey={`${row.id}:name`}
                    className={cn(
                      "database-page-cell",
                      getConditionalColorClassName(conditionalColors.propertyColors.name),
                    )}
                    wrapContent={nameColumnWrapContent}
                  >
                    {(setActive) => (
                      <div
                        className={cn(
                          "database-sub-item-name",
                          showSubItemToggle && "database-sub-item-name-has-toggle",
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
                            data-has-sub-items={hasSubItems ? "true" : undefined}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleSubItems();
                            }}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            type="button"
                          >
                            {subItemsExpanded ? (
                              <ChevronDown weight="fill" />
                            ) : (
                              <ChevronRight weight="fill" />
                            )}
                          </button>
                        ) : null}
                        <DatabaseCellContent wrapContent={nameColumnWrapContent}>
                          <DatabasePageLink
                            editable={editable}
                            editRequest={
                              grid.titleEditRequest?.rowId === row.id ? grid.titleEditRequest : null
                            }
                            onEditRequestHandled={grid.onTitleEditRequestHandled}
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
                  {showRightInsert ? renderInsertPropertyCell(rightInsertKey) : null}
                </Fragment>
              );
            }

            return renderPropertyCell();
          })}
          {canEditStructure ? <td /> : null}
        </DataGridTableBodyRow>
      );

      const subItemCreateRowIds = subItemCreateRowIdsByAfterRowId[row.id] ?? [];

      if (subItemCreateRowIds.length === 0) {
        return tableRow;
      }

      return (
        <Fragment key={row.id}>
          {tableRow}
          {subItemCreateRowIds
            .filter((parentRowId) => canCreateRow(parentRowId))
            .map((parentRowId) => (
              <tr className="database-sub-item-create-row" key={`create-sub-item:${parentRowId}`}>
                <td colSpan={columnKeys.length}>
                  <button
                    className="database-sub-item-create"
                    disabled={
                      !canCreateRow(parentRowId) ||
                      (!rowInteractions &&
                        (!databaseId ||
                          !subItemsSettings.parentPropertyId ||
                          !subItemsSettings.subItemPropertyId))
                    }
                    onClick={() => createRow(parentRowId)}
                    title={
                      !rowInteractions &&
                      (!subItemsSettings.parentPropertyId || !subItemsSettings.subItemPropertyId)
                        ? "Setting up sub-items"
                        : undefined
                    }
                    style={
                      {
                        "--database-sub-item-depth": (subItemDepthByRowId[parentRowId] ?? 0) + 1,
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
      );
    },
    [
      addDatabaseRow,
      rowInteractions,
      canSelectRows,
      canEditStructure,
      columnKeys.length,
      grid.table,
      conditionalColorsByRowId,
      databaseId,
      editable,
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
      selectedRowIds,
      sidePane?.sidePanePageId,
      subItemChildRowIdsByParentId,
      subItemCreateRowIdsByAfterRowId,
      subItemDepthByRowId,
      openedSubItemRowIds,
      updateDatabasePropertyConfig,
    ],
  );

  return (
    <DatabaseRowActionsProvider
      disabled={Boolean(rowInteractions)}
      selection={{
        selectedRows,
        selectedRowIds,
        setSelectedRowIds,
        getSelectionValue,
        saveSelectedPropertyValue,
      }}
    >
      <DataGrid
        table={grid.table}
        recordCount={visibleRows.length}
        onCellsChange={grid.onCellsChange}
        onCellEditRequest={grid.onCellEditRequest}
        onCellSelectionChange={grid.onCellSelectionChange}
        tableLayout={{
          dense: true,
          cellSelection: true,
          cellEditMode: "click",
          cellFillHandle: editable,
          cellFillHandleVariant: "dot",
        }}
      >
        <DatabaseGridScrollContext.Provider value={grid.scrollContext}>
          {selectedRows.length > 0 ? (
            rowInteractions ? (
              rowInteractions.renderSelectionToolbar(selectedRows, () =>
                setSelectedRowIds(new Set()),
              )
            ) : (
              <DatabaseSelectionToolbar
                clearSelection={() => setSelectedRowIds(new Set())}
                selectedCount={selectedRows.length}
              />
            )
          ) : null}
          <div
            className="database-table-wrap database-inline-scroll-wrap"
            data-slot="data-grid"
            data-inline-scroll={isInlineTableScrollEnabled ? "true" : undefined}
            data-vertical-lines={layoutSettings.showVerticalLines ? "true" : "false"}
            ref={tableWrapRef}
            style={tableWrapStyle}
            onMouseLeave={() => {
              if (!draggedRowId) {
                setHoveredRowId(null);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
                releaseDatabaseRowDropOwner(rowDropOwner);
                updateRowDropTarget(null);
                updateGroupRowDropTarget(null);
                isExternalRowDragActiveRef.current = false;
                setIsExternalRowDragActive(false);
              }
            }}
            onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
              const hasDragPayload = editable && hasDatabasePageDragPayload(event.dataTransfer);

              if (!draggedRowId && !hasDragPayload) {
                return;
              }

              if (!draggedRowId && hasDragPayload && !isExternalRowDragActiveRef.current) {
                isExternalRowDragActiveRef.current = true;
                setIsExternalRowDragActive(true);
                measureRows();
              }

              event.preventDefault();
              claimDatabaseRowDropOwner(rowDropOwner);
              // Keep propagating so the editor clears its previous block drop line
              // and the source table can release its local drop indicator.
              event.dataTransfer.dropEffect = "move";
              if (isTableGrouped) {
                updateGroupRowDropTarget(getGroupRowDropTarget(event.clientY));
              } else {
                updateRowDropTarget(resolveRowDropTarget(event.clientY, event.clientX));
              }
            }}
            onDrop={(event) => {
              const dragPayload = rowInteractions
                ? null
                : getDatabasePageDragPayload(event.dataTransfer);
              const resolvedRowTarget = isTableGrouped
                ? null
                : resolveRowDropTarget(event.clientY, event.clientX);

              if (isTableGrouped) {
                updateGroupRowDropTarget(getGroupRowDropTarget(event.clientY));
              } else {
                updateRowDropTarget(resolvedRowTarget);
              }

              const hasDropTarget = isTableGrouped
                ? groupRowDropTargetRef.current !== null
                : resolvedRowTarget !== null;

              if ((!draggedRowId && !dragPayload) || !hasDropTarget) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              function moveInternalRow() {
                const nextMove = getDraggedRowMove();

                if (nextMove && rowInteractions?.moveRow) {
                  void Promise.resolve(rowInteractions.moveRow(nextMove)).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Could not move item."),
                  );
                } else if (nextMove)
                  manualPlacement.request((clearSortViewId) =>
                    applyRowMove(nextMove, clearSortViewId),
                  );
              }
              function insertExternalRow(
                dragPayload: NonNullable<ReturnType<typeof getDatabasePageDragPayload>>,
                clearSortViewId?: string,
              ) {
                if (isTableGrouped) {
                  const target = groupRowDropTargetRef.current;
                  const section = groupedSections.find(
                    (candidate) => candidate.id === target?.sectionId,
                  );

                  if (target && section) {
                    addDraggedPageRow(
                      dragPayload,
                      getAnchoredRowInsertPosition(rows, section.rows, target.localTargetIndex),
                      section.groupValue,
                      groupProperty,
                      clearSortViewId,
                    );
                  }
                } else {
                  addDraggedPageRow(
                    dragPayload,
                    getAnchoredRowInsertPosition(rows, visibleRows, resolvedRowTarget?.index ?? 0),
                    undefined,
                    undefined,
                    clearSortViewId,
                  );
                }
              }
              if (draggedRowId) {
                moveInternalRow();
              } else if (dragPayload) {
                manualPlacement.request((clearSortViewId) =>
                  insertExternalRow(dragPayload, clearSortViewId),
                );
              }
              clearRowDrag();
            }}
          >
            {canSelectRows ? (
              <Checkbox
                aria-label="Select all records"
                className="absolute database-row-checkbox database-table-header-checkbox"
                ref={headerCheckboxRef}
                checked={
                  selectedRows.length > 0
                    ? selectedRows.length === rows.length
                      ? true
                      : "indeterminate"
                    : false
                }
                disabled={rows.length === 0}
                onCheckedChange={(checked) =>
                  setSelectedRowIds(
                    checked === true ? new Set(rows.map((row) => row.id)) : new Set(),
                  )
                }
              />
            ) : null}
            {!isInlineTableScrollEnabled ? (
              <DatabaseRowDragControls
                canReorderRows={canDragRows}
                canDragRow={rowInteractions?.canDragRow}
                draggedRowId={draggedRowId}
                editable={canSelectRows}
                hoveredRowId={hoveredRowId}
                onDragEnd={clearRowDrag}
                onDragStart={startRowDrag}
                onHoveredRowChange={setHoveredRowId}
                onSelectedRowChange={toggleSelectedRow}
                rowDragTitle={rowInteractions ? "Drag item" : rowDragTitle}
                rowLayout={rowLayout}
                rowsById={rowsById}
                selectedRowIds={selectedRowIds}
              />
            ) : null}
            {!isInlineTableScrollEnabled ? (
              <DatabaseRowDropLine depth={rowDropLineDepth} top={rowDropLineTop} />
            ) : null}
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
              className="database-table-scroll database-inline-scroll relative"
              ref={tableScrollRef}
              data-slot="data-grid-table-viewport"
              role="grid"
              aria-label={databaseName || "Database table"}
              aria-rowcount={visibleRows.length + 1}
              aria-colcount={columnKeys.length}
              aria-multiselectable="true"
            >
              <div className="database-table-scroll-content database-inline-scroll-content">
                {isInlineTableScrollEnabled ? (
                  <DatabaseRowDragControls
                    canReorderRows={canDragRows}
                    canDragRow={rowInteractions?.canDragRow}
                    draggedRowId={draggedRowId}
                    editable={canSelectRows}
                    hoveredRowId={hoveredRowId}
                    onDragEnd={clearRowDrag}
                    onDragStart={startRowDrag}
                    onHoveredRowChange={setHoveredRowId}
                    onSelectedRowChange={toggleSelectedRow}
                    rowDragTitle={rowInteractions ? "Drag item" : rowDragTitle}
                    rowLayout={rowLayout}
                    rowsById={rowsById}
                    selectedRowIds={selectedRowIds}
                  />
                ) : null}
                {isInlineTableScrollEnabled ? (
                  <DatabaseRowDropLine depth={rowDropLineDepth} top={rowDropLineTop} />
                ) : null}
                {isTableGrouped ? (
                  <div className="database-table-groups gap-0">
                    {groupedSections.map((section) => {
                      const isCollapsed = collapsedGroups[section.id] === true;

                      function renderGroupRows() {
                        return (
                          <DatabaseVirtualizedTable
                            columnKeys={columnKeys}
                            columnWidths={columnWidths}
                            footerRow={
                              editable &&
                              !section.isEmpty &&
                              groupProperty &&
                              canCreateRowInGroup(groupProperty) ? (
                                <CreateDatabaseRowButton
                                  columnCount={columnKeys.length}
                                  disabled={!databaseId}
                                  onClick={() => addDatabaseRow(section.groupValue, groupProperty)}
                                />
                              ) : undefined
                            }
                            measurementKey={tableMeasurementKey}
                            onRowsRendered={scheduleMeasureRows}
                            renderRow={renderTableRow}
                            rows={section.rows}
                            tableMinWidth={tableMinWidth}
                            virtualizationEnabled={!draggedRowId && !isExternalRowDragActive}
                          />
                        );
                      }

                      return (
                        <section
                          className="database-table-group"
                          data-database-group-id={section.id}
                          data-drag-over={
                            groupRowDropTarget?.sectionId === section.id ? "true" : undefined
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
                      canCreateRow() ? (
                        <CreateDatabaseRowButton
                          label={rowInteractions?.newRowLabel}
                          columnCount={columnKeys.length}
                          disabled={!canCreateRow()}
                          onClick={() => createRow()}
                        />
                      ) : undefined
                    }
                    measurementKey={tableMeasurementKey}
                    onRowsRendered={scheduleMeasureRows}
                    renderRow={renderTableRow}
                    rows={visibleRows}
                    tableMinWidth={tableMinWidth}
                    virtualizationEnabled={
                      !draggedRowId && !isExternalRowDragActive && !isSubItemsNested
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
            <DataGridCellSelection
              key={grid.controllerScope}
              viewportRef={tableScrollRef}
              focusTargetRef={tableScrollRef}
              onScrollToCell={grid.onScrollToCell}
            />
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
                    <DefaultPageIcon
                      page={draggedRowId ? rowsById.get(draggedRowId)?.page : null}
                    />
                    <span>{rowDragOverlay.overlay.title}</span>
                  </span>
                </div>,
                document.body,
              )
            : null}
          <DatabaseFormulaDialog
            databasePropertyId={formulaSetupPropertyId}
            onOpenChange={(open) => {
              if (!open) {
                setFormulaSetupPropertyId(null);
              }
            }}
            open={formulaSetupPropertyId !== null}
          />
        </DatabaseGridScrollContext.Provider>
      </DataGrid>
    </DatabaseRowActionsProvider>
  );
}
