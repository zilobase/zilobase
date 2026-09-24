import type { EditorView } from "@tiptap/pm/view";
import {
  deleteDraggedEditorBlockSource,
  getDraggedEditorBlockPayload,
  getEditorInsertDropTarget,
  isMultiBlockDragPayload,
  type BlockDragPayload,
} from "./block-drag";
import {
  getDatabasePageDragPayload as getNativeDatabasePageDragPayload,
  hasDatabasePageDragPayload,
} from "@/features/databases";
import { getDatabasePageDropPosition, getDropDatabaseElement } from "./database-page-drop-target";
import type { DatabasePageDropPayload } from "../core/types";

import { insertPendingPageEmbed } from "./pending-page-embed";

export { getDropDatabaseElement } from "./database-page-drop-target";

export const insertDraggedDatabasePage = (
  view: EditorView,
  event: DragEvent,
  onEmbedPage?: (pageId: string) => void | Promise<void>,
  currentPageId?: string | null,
  onSelfDrop?: () => void,
  onError: (error: unknown) => void = () => {},
) => {
  const payload = getNativeDatabasePageDragPayload(event.dataTransfer);
  const pageId = payload?.pageId;
  if (!pageId) return false;

  if (pageId === currentPageId) {
    // Consume the drop so ProseMirror/the browser cannot fall back to inserting
    // the dragged row's plain-text representation.
    event.preventDefault();
    event.stopPropagation();
    onSelfDrop?.();
    return true;
  }

  const target = getEditorInsertDropTarget(view, event);
  if (!target) return false;

  if (!view.state.schema.nodes.pageBlock || !view.editable) return false;
  event.preventDefault();
  insertPendingPageEmbed(
    view,
    target.pos,
    pageId,
    payload.title ?? "Untitled",
    () => onEmbedPage?.(pageId),
    onError,
  );
  return true;
};

const getDraggedPageBlockPayload = (event: DragEvent): DatabasePageDropPayload | null => {
  const blockPayload = getDraggedEditorBlockPayload(event.dataTransfer);
  if (
    !blockPayload ||
    isMultiBlockDragPayload(blockPayload) ||
    blockPayload.typeName !== "pageBlock"
  ) {
    return null;
  }

  const pageId = (blockPayload.node as { attrs?: { pageId?: unknown } }).attrs?.pageId;
  if (typeof pageId !== "string" || !pageId) return null;

  return {
    blockPayload,
    pageId,
    title: blockPayload.textContent || undefined,
  };
};

const getDatabasePageDropPayload = (event: DragEvent): DatabasePageDropPayload | null =>
  getDraggedPageBlockPayload(event) ?? getNativeDatabasePageDragPayload(event.dataTransfer);

export const isDraggingPageToEditor = (event: DragEvent) =>
  hasDatabasePageDragPayload(event.dataTransfer) || getDraggedPageBlockPayload(event) !== null;

export const shouldSkipEditorDropLine = (event: DragEvent) =>
  event.target instanceof HTMLElement && Boolean(event.target.closest(".database-table-wrap"));

export const dropPageOnDatabase = (
  event: DragEvent,
  options: {
    addDatabaseRow: {
      isPending: boolean;
      mutate: (
        vars: {
          databaseId: string;
          pageId: string;
          position: number;
          title?: string;
        },
        opts: {
          onError: (error: unknown) => void;
          onSuccess: () => void;
        },
      ) => void;
    };
    onError: (message: string) => void;
  },
) => {
  const databaseElement = getDropDatabaseElement(event);
  const databaseId = databaseElement?.dataset.databaseId;
  if (!databaseElement || !databaseId) return false;

  const dropPayload = getDatabasePageDropPayload(event);
  if (!dropPayload) return false;

  event.preventDefault();
  event.stopPropagation();
  if (options.addDatabaseRow.isPending) return true;

  options.addDatabaseRow.mutate(
    {
      databaseId,
      pageId: dropPayload.pageId,
      position: getDatabasePageDropPosition(databaseElement, event.clientY),
      title: dropPayload.title,
    },
    {
      onError: (error) =>
        options.onError(error instanceof Error ? error.message : "Could not move page."),
      onSuccess: () => {
        if (dropPayload.blockPayload) {
          deleteDraggedEditorBlockSource(dropPayload.blockPayload as BlockDragPayload);
        }
      },
    },
  );

  return true;
};
