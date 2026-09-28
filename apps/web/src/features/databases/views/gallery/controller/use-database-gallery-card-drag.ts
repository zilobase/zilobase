import { useManualRecordPlacement } from "../../state/manual-record-placement";
import { getGroupedRecordMove } from "../../model/database-record-drop";
import { useCallback, useRef, useState, type DragEvent, type PointerEvent } from "react";
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
import { isInteractiveDatabaseCardTarget } from "../../../interactions/database-card-drag-target";
import type { DatabaseTableGroupSection } from "../../../interactions/database-table-group-sections";
import type { DatabasePropertyListItem } from "../../model/database-group-config";

type GallerySection = DatabaseTableGroupSection<SortableDatabaseItem>;

type GalleryDropTarget = {
  sectionId: string | null;
  targetIndex: number;
};

type DatabaseGalleryCardDragInput = {
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void | Promise<void>;
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
  editable: boolean;
  groupProperty: DatabasePropertyListItem | null;
  groupedSections: GallerySection[];
  items: SortableDatabaseItem[];
  visibleRows: SortableDatabaseItem[];
  propertyValuesByKey: Record<string, string | string[]>;
};

export function useDatabaseGalleryCardDrag(input: DatabaseGalleryCardDragInput) {
  const manualPlacement = useManualRecordPlacement();
  const sourceSectionRef = useRef<string | null>(null);
  const dragOriginRef = useRef<EventTarget | null>(null);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [isExternalDragActive, setIsExternalDragActive] = useState(false);
  const [dropTarget, setDropTarget] = useState<GalleryDropTarget | null>(null);
  const reorderRows = useChangeDatabaseRow();

  const clearDrag = useCallback(() => {
    dragOriginRef.current = null;
    finishDatabaseRowDrag();
    setDraggedRowId(null);
    setIsExternalDragActive(false);
    setDropTarget(null);
  }, []);

  const captureDragOrigin = useCallback((event: PointerEvent<HTMLElement>) => {
    dragOriginRef.current = event.target;
  }, []);

  const startDrag = useCallback(
    (row: SortableDatabaseItem, event: DragEvent<HTMLElement>, sectionId: string | null) => {
      sourceSectionRef.current = sectionId;
      if (!input.editable || !input.databaseId) {
        event.preventDefault();
        return;
      }

      const dragOrigin = dragOriginRef.current ?? event.target;
      dragOriginRef.current = null;
      if (isInteractiveDatabaseCardTarget(dragOrigin)) {
        event.preventDefault();
        return;
      }

      const cardRect = event.currentTarget.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        event.currentTarget,
        event.clientX - cardRect.left,
        event.clientY - cardRect.top,
      );
      event.stopPropagation();
      startDatabaseRowDrag();
      setDatabasePageDragPayload(event.dataTransfer, {
        databaseId: input.databaseId,
        hostDatabaseId: input.hostDatabaseId ?? undefined,
        pageId: row.pageId,
        rowId: row.id,
        title: row.page.name?.trim() || "Untitled",
      });
      setDraggedRowId(row.id);
    },
    [input.databaseId, input.editable],
  );

  const dragOver = useCallback(
    (event: DragEvent<HTMLElement>, sectionId: string | null, targetIndex: number) => {
      const hasExternalPayload = !draggedRowId && hasDatabasePageDragPayload(event.dataTransfer);

      if (!input.editable || (!draggedRowId && !hasExternalPayload)) return;

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setIsExternalDragActive(hasExternalPayload);
      setDropTarget({ sectionId, targetIndex });
    },
    [draggedRowId, input.editable],
  );

  const leave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
      setIsExternalDragActive(false);
      setDropTarget(null);
    }
  }, []);

  const drop = useCallback(
    (event: DragEvent<HTMLElement>, sectionId: string | null, fallbackTargetIndex: number) => {
      const target =
        dropTarget?.sectionId === sectionId
          ? dropTarget
          : { sectionId, targetIndex: fallbackTargetIndex };
      const section = sectionId
        ? input.groupedSections.find((candidate) => candidate.id === sectionId)
        : null;
      const anchorRows = section?.rows ?? input.visibleRows;
      const externalPayload = !draggedRowId ? getDatabasePageDragPayload(event.dataTransfer) : null;

      if (input.databaseId && externalPayload) {
        event.preventDefault();
        event.stopPropagation();
        manualPlacement.request(() =>
          input.addDraggedPageRow(
            externalPayload,
            getAnchoredRowInsertPosition(input.items, anchorRows, target.targetIndex),
            section?.groupValue,
            section ? input.groupProperty : undefined,
          ),
        );
        clearDrag();
        return;
      }

      if (!input.databaseId || !draggedRowId) {
        clearDrag();
        return;
      }

      const sourceSection = input.groupedSections.find(
        (candidate) => candidate.id === sourceSectionRef.current,
      );
      event.preventDefault();
      event.stopPropagation();
      const groupedMove =
        section && input.groupProperty
          ? getGroupedRecordMove({
              rows: input.items,
              targetRows: anchorRows,
              rowId: draggedRowId,
              targetIndex: target.targetIndex,
              sourceGroupValue: sourceSection?.groupValue ?? "",
              targetGroupValue: section.groupValue,
              property: input.groupProperty,
              propertyValuesByKey: input.propertyValuesByKey,
            })
          : null;
      const rowIds = !section
        ? getFilteredReorderedRowIds(input.items, anchorRows, draggedRowId, target.targetIndex)
        : null;
      const anchors =
        groupedMove ?? (rowIds ? getDatabaseRowMoveAnchors(rowIds, draggedRowId) : null);
      if (anchors)
        manualPlacement.request(() =>
          reorderRows.mutate(
            {
              databaseId: input.hostDatabaseId!,
              dataSourceId: input.databaseId!,
              rowId: draggedRowId,
              placement: { afterRowId: anchors.afterRowId, beforeRowId: anchors.beforeRowId },
              ...(groupedMove?.group
                ? {
                    valuesByPropertyId: {
                      [groupedMove.group.propertyId]: groupedMove.group.serializedValue,
                    },
                  }
                : {}),
              ...(groupedMove?.pageTitle !== undefined ? { title: groupedMove.pageTitle } : {}),
            },
            { onError: (error) => toast.error(error.message) },
          ),
        );
      clearDrag();
    },
    [clearDrag, draggedRowId, dropTarget, input, reorderRows, manualPlacement],
  );

  return {
    captureDragOrigin,
    clearDrag,
    dragOver,
    draggedRowId,
    drop,
    dropTarget,
    isExternalDragActive,
    leave,
    startDrag,
  };
}
