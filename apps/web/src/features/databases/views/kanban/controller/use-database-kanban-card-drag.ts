import { useManualRecordPlacement } from "../../state/manual-record-placement";
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { toast } from "sonner";
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  setDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../../interactions/database-page-drop";
import {
  finishDatabaseRowDrag,
  startDatabaseRowDrag,
} from "../../../interactions/database-row-drag";
import { isInteractiveDatabaseCardTarget } from "../../../interactions/database-card-drag-target";
import {
  canMoveRowsAcrossKanbanGroups,
  type DatabasePropertyListItem,
} from "../model/database-kanban-config";
import {
  getKanbanCardPreview,
  getKanbanExternalDropPosition,
} from "../model/database-kanban-card-drag";
import { getKanbanMove, type KanbanMove, type KanbanMoveRow } from "../model/database-kanban-moves";
import { useKanbanGeometry } from "./use-kanban-geometry";

type DragOption = { id: string; groupValue: string };
type DraggedCard = {
  rowId: string;
  sourceOptionId: string;
  sourceGroupValue: string;
  height: number;
};
type DropTarget = { optionId: string; targetIndex: number };

/** Native drag lifecycle and previews only; persistence belongs to useKanbanMoves. */
export function useDatabaseKanbanCardDrag<
  Row extends KanbanMoveRow,
  Option extends DragOption,
>(input: {
  addDraggedPageRow: (
    payload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    property?: DatabasePropertyListItem | null,
  ) => void | Promise<void>;
  allRows: Row[];
  databaseId: string | null | undefined;
  editable: boolean;
  getOptionItems: (option: Option) => Row[];
  groupProperty: DatabasePropertyListItem | null;
  options: Option[];
  propertyValuesByKey: Record<string, string | string[]>;
  submitMove: (move: KanbanMove) => void;
}) {
  const geometry = useKanbanGeometry(input);
  const dragFrame = useRef<number | null>(null);
  const hitTestFrame = useRef<number | null>(null);
  const pendingHitTest = useRef<{ clientY: number; optionId: string } | null>(null);
  const dragOrigin = useRef<EventTarget | null>(null);
  const draggedCardRef = useRef<DraggedCard | null>(null);
  const newGroupDrop = useRef<{
    card: DraggedCard | null;
    payload: DatabasePageDragPayload | null;
  } | null>(null);
  const [draggedCard, setDraggedCard] = useState<DraggedCard | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isExternalDragActive, setIsExternalDragActive] = useState(false);
  const manualPlacement = useManualRecordPlacement();

  const clearDrag = useCallback(() => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    if (hitTestFrame.current !== null) cancelAnimationFrame(hitTestFrame.current);
    dragFrame.current = null;
    hitTestFrame.current = null;
    pendingHitTest.current = null;
    dragOrigin.current = null;
    draggedCardRef.current = null;
    finishDatabaseRowDrag();
    setDraggedCard(null);
    setDropTarget(null);
    setIsExternalDragActive(false);
  }, []);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearDrag();
    };
    document.addEventListener("keydown", cancel);
    return () => {
      document.removeEventListener("keydown", cancel);
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      if (hitTestFrame.current !== null) cancelAnimationFrame(hitTestFrame.current);
      finishDatabaseRowDrag();
    };
  }, [clearDrag]);

  const getMove = (target: DropTarget, card: DraggedCard | null, override?: Option) => {
    const option = override ?? input.options.find(({ id }) => id === target.optionId);
    if (!card || !option || !input.groupProperty) return null;
    return getKanbanMove({
      rows: input.allRows,
      targetRows: input.getOptionItems(option),
      rowId: card.rowId,
      targetIndex: target.targetIndex,
      sourceGroupValue: card.sourceGroupValue,
      targetGroupValue: option.groupValue,
      property: input.groupProperty,
      propertyValuesByKey: input.propertyValuesByKey,
    });
  };
  const acceptMove = (move: KanbanMove | null) => {
    if (!move) return;
    manualPlacement.request(() => input.submitMove(move));
  };
  const addExternal = async (
    payload: DatabasePageDragPayload,
    position: number,
    option: Option,
  ) => {
    try {
      manualPlacement.request(() =>
        input.addDraggedPageRow(payload, position, option.groupValue, input.groupProperty),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add card");
    }
  };

  const startDrag = (row: Row, option: Option, event: DragEvent<HTMLElement>) => {
    const origin = dragOrigin.current ?? event.target;
    dragOrigin.current = null;
    if (
      !input.editable ||
      !input.databaseId ||
      !input.groupProperty ||
      manualPlacement.clearing ||
      manualPlacement.pending ||
      isInteractiveDatabaseCardTarget(origin)
    ) {
      event.preventDefault();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      event.currentTarget,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    event.stopPropagation();
    startDatabaseRowDrag();
    setDatabasePageDragPayload(event.dataTransfer, {
      databaseId: input.databaseId,
      pageId: row.pageId,
      rowId: row.id,
      title: row.page.name?.trim() || "Untitled",
    });
    // Drop can arrive before the first animation frame.
    draggedCardRef.current = {
      rowId: row.id,
      sourceOptionId: option.id,
      sourceGroupValue: option.groupValue,
      height: rect.height,
    };
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      setDraggedCard(draggedCardRef.current);
      setDropTarget({
        optionId: option.id,
        targetIndex: Math.max(
          0,
          input.getOptionItems(option).findIndex(({ id }) => id === row.id),
        ),
      });
    });
  };
  const canDrop = (option: Option, event: DragEvent<HTMLElement>) => {
    if (
      !input.editable ||
      !input.databaseId ||
      !input.groupProperty ||
      manualPlacement.clearing ||
      manualPlacement.pending
    )
      return false;
    const card = draggedCardRef.current;
    if (!card) return hasDatabasePageDragPayload(event.dataTransfer);
    return (
      card.sourceGroupValue === option.groupValue ||
      canMoveRowsAcrossKanbanGroups(input.groupProperty)
    );
  };
  const dragOver = (option: Option, event: DragEvent<HTMLElement>) => {
    if (!canDrop(option, event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setIsExternalDragActive(!draggedCardRef.current);
    pendingHitTest.current = { clientY: event.clientY, optionId: option.id };
    if (hitTestFrame.current !== null) return;
    hitTestFrame.current = requestAnimationFrame(() => {
      hitTestFrame.current = null;
      const pending = pendingHitTest.current;
      pendingHitTest.current = null;
      if (!pending) return;
      const targetIndex = geometry.getTargetIndex(pending.optionId, pending.clientY);
      setDropTarget((current) =>
        current?.optionId === pending.optionId && current.targetIndex === targetIndex
          ? current
          : { optionId: pending.optionId, targetIndex },
      );
    });
  };
  const drop = (option: Option, event: DragEvent<HTMLElement>) => {
    if (!canDrop(option, event)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = {
      optionId: option.id,
      targetIndex: geometry.getTargetIndex(option.id, event.clientY),
    };
    const card = draggedCardRef.current;
    if (card) acceptMove(getMove(target, card));
    else {
      const payload = getDatabasePageDragPayload(event.dataTransfer);
      if (payload)
        void addExternal(
          payload,
          getKanbanExternalDropPosition(
            input.allRows,
            input.getOptionItems(option),
            target.targetIndex,
          ),
          option,
        );
    }
    clearDrag();
  };
  const getPreview = (option: Option) => {
    if (!draggedCard || !dropTarget) return null;
    const isTarget = dropTarget.optionId === option.id;
    const isSource = draggedCard.sourceOptionId === option.id;
    if (!isTarget && !isSource) return null;
    const measurement = geometry.getMeasurement(option.id);
    if (!measurement) return null;
    const sourceIndex = input
      .getOptionItems(option)
      .findIndex(({ id }) => id === draggedCard.rowId);
    return {
      ...getKanbanCardPreview({
        ...measurement,
        draggedHeight: draggedCard.height,
        sourceIndex,
        targetIndex: isTarget ? dropTarget.targetIndex : null,
      }),
      paddingTop: measurement.paddingTop,
      hiddenIndex: sourceIndex,
      height: draggedCard.height,
    };
  };
  const canDropOnNewGroup = (event: DragEvent<HTMLElement>) =>
    Boolean(
      input.editable &&
      input.databaseId &&
      input.groupProperty &&
      !manualPlacement.clearing &&
      !manualPlacement.pending &&
      (draggedCardRef.current || hasDatabasePageDragPayload(event.dataTransfer)),
    );
  const dropOnNewGroup = (event: DragEvent<HTMLElement>) => {
    if (!canDropOnNewGroup(event)) return false;
    const card = draggedCardRef.current;
    const payload = card ? null : getDatabasePageDragPayload(event.dataTransfer);
    if (!card && !payload) return false;
    event.preventDefault();
    event.stopPropagation();
    newGroupDrop.current = { card, payload };
    clearDrag();
    return true;
  };
  const completeNewGroupDrop = async (option: Option) => {
    const pending = newGroupDrop.current;
    newGroupDrop.current = null;
    if (!pending || !input.editable || !input.groupProperty) return;
    if (pending.payload) await addExternal(pending.payload, input.allRows.length, option);
    else acceptMove(getMove({ optionId: option.id, targetIndex: 0 }, pending.card, option));
  };

  return {
    canDropOnNewGroup,
    dropOnNewGroup,
    completeNewGroupDrop,
    cancelNewGroupDrop: () => {
      newGroupDrop.current = null;
    },
    getPreview,
    isDragging: draggedCard !== null,
    getCardRef: geometry.getCardRef,
    getColumnRef: geometry.getColumnRef,
    captureDragOrigin: (event: PointerEvent<HTMLElement>) => {
      dragOrigin.current = event.target;
    },
    clearDrag,
    dragOver,
    drop,
    dropTarget,
    isExternalDragActive,
    leave: (option: Option, event: DragEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      // Do not let a scheduled hit test resurrect a target after leaving it.
      if (pendingHitTest.current?.optionId === option.id) pendingHitTest.current = null;
      setIsExternalDragActive(false);
      setDropTarget((current) => (current?.optionId === option.id ? null : current));
    },
    startDrag,
  };
}
