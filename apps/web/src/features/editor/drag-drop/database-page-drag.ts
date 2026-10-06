import type { EditorWorkspace } from "../runtime/editor-workspace";
import { removeBlocks } from "../operations/block-operations";
import type { EditorView } from "@tiptap/pm/view";
import {
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
  onEmbedPage?: import("../core/types").EditorResourceLink,
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

const getDraggedPageBlockPayload = (
  event: DragEvent,
  workspace?: EditorWorkspace,
): DatabasePageDropPayload | null => {
  const blockPayload =
    workspace?.drag.read(event.dataTransfer) ?? getDraggedEditorBlockPayload(event.dataTransfer);
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

export const isDraggingPageToEditor = (event: DragEvent, workspace?: EditorWorkspace) =>
  hasDatabasePageDragPayload(event.dataTransfer) ||
  getDraggedPageBlockPayload(event, workspace) !== null;

export const shouldSkipEditorDropLine = (event: DragEvent) =>
  event.target instanceof HTMLElement && Boolean(event.target.closest(".database-table-wrap"));

export const dropPageOnDatabase = (
  event: DragEvent,
  options: {
    workspace: EditorWorkspace;
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
  if (dropPayload.blockPayload && !options.workspace.drag.source(dropPayload.blockPayload)) {
    options.workspace.drag.reset();
    return true;
  }
  options.workspace.drag.transition("awaiting-resource");

  options.addDatabaseRow.mutate(
    {
      databaseId,
      pageId: dropPayload.pageId,
      position: getDatabasePageDropPosition(databaseElement, event.clientY),
      title: dropPayload.title,
    },
    {
      onError: (error) => {
        options.workspace.drag.reset();
        options.onError(error instanceof Error ? error.message : "Could not move page.");
      },
      onSuccess: () => {
        if (dropPayload.blockPayload) {
          const source = options.workspace.drag.source(
            dropPayload.blockPayload as BlockDragPayload,
          );
          if (source) removeBlocks(source.editor, source.from, source.to);
          options.workspace.drag.reset();
        }
      },
    },
  );

  return true;
};
