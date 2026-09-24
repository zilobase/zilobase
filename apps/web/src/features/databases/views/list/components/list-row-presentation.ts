type RowDrag = {
  draggedRowId: string | null;
  isExternalDragActive: boolean;
  dropTargetIndex: number | null;
};

export function listRowDragAttributes(
  rowId: string,
  rowIndex: number,
  rowCount: number,
  drag: RowDrag,
) {
  const active = Boolean(drag.draggedRowId || drag.isExternalDragActive);
  return {
    "data-dragging": drag.draggedRowId === rowId ? "true" : undefined,
    "data-drop-after":
      active && drag.dropTargetIndex === rowIndex + 1 && rowIndex === rowCount - 1
        ? "true"
        : undefined,
    "data-drop-before": active && drag.dropTargetIndex === rowIndex ? "true" : undefined,
  } as const;
}

export function listRowCompletionLabel(name: string, complete: boolean) {
  const label = name || "task";
  return complete ? `Mark ${label} as not done` : `Mark ${label} as done`;
}
