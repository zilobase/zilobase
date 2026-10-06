import { hasDragType, readDragPayload } from "@/shared/lib/drag-drop";
export const EDITOR_BLOCK_DRAG_MIME = "application/x-zilobase-editor-block-drag";
export type BlockDragPayload = {
  operationId: string;
  blockCount: number;
  editorId: string;
  from: number;
  node: unknown;
  parentTypeName: string;
  pos: number;
  slice: unknown;
  textContent: string;
  to: number;
  typeName: string;
};
export const isListItemType = (typeName?: string) =>
  typeName === "listItem" || typeName === "taskItem";
function isBlockDragPayload(value: unknown): value is BlockDragPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<BlockDragPayload>;
  return (
    typeof p.operationId === "string" &&
    typeof p.editorId === "string" &&
    Number.isInteger(p.pos) &&
    typeof p.from === "number" &&
    typeof p.to === "number" &&
    p.to > p.from &&
    Number.isInteger(p.blockCount) &&
    p.blockCount! > 0 &&
    typeof p.parentTypeName === "string" &&
    typeof p.textContent === "string" &&
    typeof p.typeName === "string" &&
    p.node != null &&
    p.slice != null
  );
}
export const isMultiBlockDragPayload = (payload: BlockDragPayload) => payload.blockCount > 1;
export function getDraggedEditorBlockPayload(dataTransfer: DataTransfer | null) {
  return readDragPayload(dataTransfer, EDITOR_BLOCK_DRAG_MIME, isBlockDragPayload);
}
/** MIME detection also serves desktop tab handling, without a global payload fallback. */
export const hasEditorBlockDragData = (dataTransfer: DataTransfer | null) =>
  hasDragType(dataTransfer, EDITOR_BLOCK_DRAG_MIME);
export function getBlockDragDatabaseId(payload: BlockDragPayload) {
  if (
    isMultiBlockDragPayload(payload) ||
    payload.typeName !== "databaseBlock" ||
    !payload.node ||
    typeof payload.node !== "object"
  )
    return null;
  const id = (payload.node as { attrs?: { databaseId?: unknown } }).attrs?.databaseId;
  return typeof id === "string" && id ? id : null;
}
export function canMoveDatabaseBlockToPage(
  sourceDatabaseId: string,
  currentDatabaseId: string | null | undefined,
  containingDatabaseIds: readonly string[],
) {
  return (
    sourceDatabaseId !== currentDatabaseId && !containingDatabaseIds.includes(sourceDatabaseId)
  );
}
