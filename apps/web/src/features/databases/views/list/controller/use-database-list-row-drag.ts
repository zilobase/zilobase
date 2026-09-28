import { useManualRecordPlacement } from "../../state/manual-record-placement";
import { useCallback, useState, type DragEvent } from "react";
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
  getFilteredReorderedRowIds,
  startDatabaseRowDrag,
} from "../../../interactions/database-row-drag";

type DatabaseListRowDragInput = {
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
  ) => void | Promise<void>;
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
  editable: boolean;
  items: SortableDatabaseItem[];
  visibleRows: SortableDatabaseItem[];
};

export function useDatabaseListRowDrag(input: DatabaseListRowDragInput) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [isExternalDragActive, setIsExternalDragActive] = useState(false);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const reorderRows = useChangeDatabaseRow();
  const manualPlacement = useManualRecordPlacement();

  const clearDrag = useCallback(() => {
    finishDatabaseRowDrag();
    setDraggedRowId(null);
    setIsExternalDragActive(false);
    setDropTargetIndex(null);
  }, []);

  const startDrag = useCallback(
    (event: DragEvent<HTMLButtonElement>, rowId: string) => {
      const row = input.items.find((item) => item.id === rowId);

      if (!input.editable || !input.databaseId || !row) {
        event.preventDefault();
        return;
      }

      startDatabaseRowDrag();
      setDatabasePageDragPayload(event.dataTransfer, {
        databaseId: input.databaseId,
        hostDatabaseId: input.hostDatabaseId ?? undefined,
        pageId: row.pageId,
        rowId: row.id,
        title: row.page.name?.trim() || "Untitled",
      });
      setDraggedRowId(rowId);
    },
    [input.databaseId, input.editable, input.items],
  );

  const updateDropTarget = useCallback(
    (event: DragEvent<HTMLDivElement>, rowIndex: number) => {
      const hasExternalPayload = !draggedRowId && hasDatabasePageDragPayload(event.dataTransfer);

      if (!input.editable || (!draggedRowId && !hasExternalPayload)) return;

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setIsExternalDragActive(hasExternalPayload);
      const rowRect = event.currentTarget.getBoundingClientRect();
      const nextIndex = event.clientY < rowRect.top + rowRect.height / 2 ? rowIndex : rowIndex + 1;

      setDropTargetIndex(nextIndex);
    },
    [draggedRowId, input.editable],
  );

  const leave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
      setIsExternalDragActive(false);
      setDropTargetIndex(null);
    }
  }, []);

  const drop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const externalPayload = !draggedRowId ? getDatabasePageDragPayload(event.dataTransfer) : null;

      if (input.databaseId && externalPayload && dropTargetIndex !== null) {
        event.preventDefault();
        event.stopPropagation();
        manualPlacement.request(() =>
          input.addDraggedPageRow(
            externalPayload,
            getAnchoredRowInsertPosition(input.items, input.visibleRows, dropTargetIndex),
          ),
        );
        clearDrag();
        return;
      }

      if (!input.databaseId || !draggedRowId || dropTargetIndex === null) {
        clearDrag();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const rowIds = getFilteredReorderedRowIds(
        input.items,
        input.visibleRows,
        draggedRowId,
        dropTargetIndex,
      );

      if (rowIds) {
        manualPlacement.request(() =>
          reorderRows.mutate(
            {
              databaseId: input.hostDatabaseId!,
              dataSourceId: input.databaseId!,
              rowId: draggedRowId,
              placement: getDatabaseRowMoveAnchors(rowIds, draggedRowId),
            },
            {
              onError: (error) => {
                toast.error(
                  error instanceof Error && error.message ? error.message : "Couldn't move row",
                );
              },
            },
          ),
        );
      }

      clearDrag();
    },
    [clearDrag, draggedRowId, dropTargetIndex, input, reorderRows, manualPlacement],
  );

  return {
    clearDrag,
    draggedRowId,
    drop,
    dropTargetIndex,
    isExternalDragActive,
    leave,
    startDrag,
    updateDropTarget,
  };
}
