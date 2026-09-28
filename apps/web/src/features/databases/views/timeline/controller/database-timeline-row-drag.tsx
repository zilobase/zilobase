import { useManualRecordPlacement } from "../../state/manual-record-placement";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";
import {
  getDatabaseRowMoveAnchors,
  useChangeDatabaseRow,
} from "@zilobase/features/databases/react";

import type { SortableDatabaseItem } from "../../../interactions/database-item-utils";
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  setDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../../interactions/database-page-drop";
import {
  finishDatabaseRowDrag,
  getAnchoredRowInsertPosition,
  hideNativeDatabaseRowDragPreview,
  startDatabaseRowDrag,
  type DatabaseRowDragOverlay,
} from "../../../interactions/database-row-drag";
import type { DatabasePropertyListItem } from "../../kanban/model/database-kanban-config";
import type { TimelineGroupSection } from "../model/database-timeline-rows";
import type { TimelineRowLayout } from "../layout/database-timeline-layout";
import {
  getTimelineRowMove,
  indexTimelineGroupSections,
  type TimelineRowMove,
} from "../model/database-timeline-row-move";

type TimelineRowDragInput = {
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void | Promise<void>;
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
  editable: boolean;
  getDropTargetIndex: (clientY: number) => number;
  groupProperty: DatabasePropertyListItem | null;
  groupedSections: TimelineGroupSection[];
  isFiltered: boolean;
  isGrouped: boolean;
  isSorted: boolean;
  items: SortableDatabaseItem[];
  layout: TimelineRowLayout;
  measureRows: () => TimelineRowLayout;
  propertyValuesByKey: Record<string, string | string[]>;
  rowsById: Map<string, SortableDatabaseItem>;
  sortedItems: SortableDatabaseItem[];
  timelineRef: RefObject<HTMLDivElement | null>;
  visibleRows: SortableDatabaseItem[];
  visibleRowIndexById: Map<string, number>;
};

export function useTimelineRowDrag(input: TimelineRowDragInput) {
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [isExternalDragActive, setIsExternalDragActive] = useState(false);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<DatabaseRowDragOverlay | null>(null);
  const manualPlacement = useManualRecordPlacement();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const { mutate: moveDatabaseRow } = useChangeDatabaseRow();
  const { mutate: reorderDatabaseRows } = useChangeDatabaseRow();

  const groupSectionByRowId = useMemo(
    () => indexTimelineGroupSections(input.groupedSections),
    [input.groupedSections],
  );
  const rowMove = useMemo(
    () =>
      getTimelineRowMove({
        ...input,
        draggedRowId,
        dropTargetIndex,
        groupSectionByRowId,
      }),
    [draggedRowId, dropTargetIndex, groupSectionByRowId, input],
  );

  const applyMove = useCallback(
    (move: TimelineRowMove) => {
      if (!input.databaseId) return;
      const notifyMoveError = (error: unknown) => {
        toast.error(error instanceof Error && error.message ? error.message : "Couldn't move row");
      };

      if (move.groupPropertyId) {
        moveDatabaseRow(
          {
            databaseId: input.hostDatabaseId!,
            dataSourceId: input.databaseId,
            valuesByPropertyId: { [move.groupPropertyId]: move.groupValue },
            rowId: move.rowId,
            placement: getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
          },
          { onError: notifyMoveError },
        );
        return;
      }

      reorderDatabaseRows(
        {
          databaseId: input.hostDatabaseId!,
          dataSourceId: input.databaseId,
          rowId: move.rowId,
          placement: getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
        },
        { onError: notifyMoveError },
      );
    },
    [input.databaseId, input.hostDatabaseId, moveDatabaseRow, reorderDatabaseRows],
  );

  const clearDrag = useCallback(() => {
    finishDatabaseRowDrag();
    setDraggedRowId(null);
    setIsExternalDragActive(false);
    setHoveredRowId(null);
    setDropTargetIndex(null);
    setOverlay(null);
  }, []);

  const startDrag = useCallback(
    (row: SortableDatabaseItem, event: ReactDragEvent<HTMLButtonElement>) => {
      if (!input.editable || !input.databaseId) return;

      input.measureRows();
      const rowElement = input.timelineRef.current?.querySelector<HTMLElement>(
        `.database-timeline-sidebar-row[data-timeline-row-id="${row.id}"]`,
      );
      const rowRect = rowElement?.getBoundingClientRect();

      if (rowRect) {
        setOverlay({
          height: rowRect.height,
          left: rowRect.left,
          offsetX: event.clientX - rowRect.left,
          offsetY: event.clientY - rowRect.top,
          title: getTimelineRowTitle(row),
          top: rowRect.top,
          width: rowRect.width,
        });
      }

      startDatabaseRowDrag();
      hideNativeDatabaseRowDragPreview(event.dataTransfer);
      setDraggedRowId(row.id);
      setDropTargetIndex(input.visibleRowIndexById.get(row.id) ?? 0);
      setDatabasePageDragPayload(event.dataTransfer, {
        databaseId: input.databaseId,
        pageId: row.pageId,
        rowId: row.id,
        title: getTimelineRowTitle(row),
      });
    },
    [input],
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
      setDropTargetIndex(null);
      setIsExternalDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const hasExternalPayload = !draggedRowId && hasDatabasePageDragPayload(event.dataTransfer);

      if (!input.editable || (!draggedRowId && !hasExternalPayload)) return;

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setIsExternalDragActive(hasExternalPayload);
      const nextTargetIndex = input.getDropTargetIndex(event.clientY);
      setDropTargetIndex((current) => (current === nextTargetIndex ? current : nextTargetIndex));

      if (overlay && overlayRef.current) {
        overlayRef.current.style.left = `${event.clientX - overlay.offsetX}px`;
        overlayRef.current.style.top = `${event.clientY - overlay.offsetY}px`;
      }
    },
    [draggedRowId, input.editable, input.getDropTargetIndex, overlay],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const externalPayload = !draggedRowId ? getDatabasePageDragPayload(event.dataTransfer) : null;

      if (
        input.databaseId &&
        externalPayload &&
        externalPayload.databaseId !== input.databaseId &&
        dropTargetIndex !== null
      ) {
        event.preventDefault();
        event.stopPropagation();
        const targetRow =
          input.visibleRows[Math.min(dropTargetIndex, input.visibleRows.length - 1)];
        const targetSection = targetRow
          ? groupSectionByRowId.get(targetRow.id)
          : input.groupedSections.at(-1);
        const anchorRows = targetSection?.rows ?? input.visibleRows;
        const localTargetIndex = targetSection
          ? input.visibleRows
              .slice(0, dropTargetIndex)
              .filter((row) => groupSectionByRowId.get(row.id)?.id === targetSection.id).length
          : dropTargetIndex;

        manualPlacement.request(() =>
          input.addDraggedPageRow(
            externalPayload,
            getAnchoredRowInsertPosition(input.items, anchorRows, localTargetIndex),
            targetSection?.groupValue,
            targetSection ? input.groupProperty : undefined,
          ),
        );
        clearDrag();
        return;
      }

      if (!draggedRowId || dropTargetIndex === null) return;

      event.preventDefault();
      event.stopPropagation();
      if (rowMove) {
        manualPlacement.request(() => applyMove(rowMove));
      }
      clearDrag();
    },
    [
      applyMove,
      clearDrag,
      draggedRowId,
      dropTargetIndex,
      groupSectionByRowId,
      input,
      rowMove,
      manualPlacement,
    ],
  );

  const controlRows = useMemo(() => {
    const rowIds = new Set([hoveredRowId, draggedRowId]);
    const rows: SortableDatabaseItem[] = [];

    for (const rowId of rowIds) {
      if (!rowId || !input.visibleRowIndexById.has(rowId)) continue;
      const row = input.rowsById.get(rowId);
      if (row) rows.push(row);
    }

    return rows;
  }, [draggedRowId, hoveredRowId, input.rowsById, input.visibleRowIndexById]);

  const dropLineTop =
    dropTargetIndex === null || (!rowMove && !isExternalDragActive)
      ? null
      : (input.layout.dropTops[dropTargetIndex] ?? null);

  return {
    clearDrag,
    controlRows,
    draggedRowId,
    dropLineTop,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    hoveredRowId,
    isExternalDragActive,
    overlay,
    overlayRef,
    setHoveredRowId,
    startDrag,
  };
}

export type TimelineRowDragController = ReturnType<typeof useTimelineRowDrag>;

function getTimelineRowTitle(row: SortableDatabaseItem) {
  return row.page.name.trim() || "Untitled";
}
