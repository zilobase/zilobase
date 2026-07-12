import type { EditorView } from "@tiptap/pm/view";
import {
  deleteDraggedEditorBlockSource,
  getDraggedEditorBlockPayload,
  getEditorInsertDropTarget,
  type BlockDragPayload,
} from "@/packages/editor/components/editor/block-drag";
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database";
import type { DatabasePageDropPayload } from "./types";

const parsePageId = (payload: string) => {
  try {
    const pageId = (JSON.parse(payload) as { pageId?: unknown }).pageId;
    return typeof pageId === "string" && pageId ? pageId : null;
  } catch {
    return null;
  }
};

const insertPageBlockAt = (
  view: EditorView,
  event: DragEvent,
  pageId: string,
  pos: number,
  onEmbedPage?: (pageId: string) => void | Promise<void>,
) => {
  const pageBlockType = view.state.schema.nodes.pageBlock;

  if (!pageBlockType) {
    return false;
  }

  const insertPageBlock = () => {
    if (view.isDestroyed) {
      return;
    }

    const pageBlock = pageBlockType.create({ pageId });
    const insertPos = Math.min(pos, view.state.doc.content.size);

    view.dispatch(view.state.tr.insert(insertPos, pageBlock).scrollIntoView());
    view.focus();
  };

  event.preventDefault();

  if (onEmbedPage) {
    void Promise.resolve(onEmbedPage(pageId)).then(
      () => {
        try {
          insertPageBlock();
        } catch {
          // The editor changed before the async embed completed.
        }
      },
      () => {},
    );
  } else {
    try {
      insertPageBlock();
    } catch {
      return false;
    }
  }

  return true;
};

export const insertDraggedDatabasePage = (
  view: EditorView,
  event: DragEvent,
  onEmbedPage?: (pageId: string) => void | Promise<void>,
  currentPageId?: string | null,
  onSelfDrop?: () => void,
) => {
  const payload = event.dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME);
  if (!payload) return false;

  const pageId = parsePageId(payload);
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

  return insertPageBlockAt(view, event, pageId, target.pos, onEmbedPage);
};

export const getDraggedDatabasePagePayload = (
  event: DragEvent,
): DatabasePageDropPayload | null => {
  const payload = event.dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as { pageId?: unknown; title?: unknown };
    if (typeof parsed.pageId !== "string" || !parsed.pageId) return null;
    return {
      pageId: parsed.pageId,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    };
  } catch {
    return null;
  }
};

export const getDraggedPageBlockPayload = (
  event: DragEvent,
): DatabasePageDropPayload | null => {
  const blockPayload = getDraggedEditorBlockPayload(event.dataTransfer);
  if (blockPayload?.typeName !== "pageBlock") return null;

  const pageId = (blockPayload.node as { attrs?: { pageId?: unknown } }).attrs
    ?.pageId;
  if (typeof pageId !== "string" || !pageId) return null;

  return {
    blockPayload,
    pageId,
    title: blockPayload.textContent || undefined,
  };
};

export const getDatabasePageDropPayload = (
  event: DragEvent,
): DatabasePageDropPayload | null =>
  getDraggedPageBlockPayload(event) ?? getDraggedDatabasePagePayload(event);

export const getDropDatabaseElement = (event: DragEvent) =>
  event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>(".database-block[data-database-id]")
    : null;

export const getDatabaseDropPosition = (
  databaseElement: HTMLElement,
  event: DragEvent,
) => {
  const rows = Array.from(
    databaseElement.querySelectorAll<HTMLTableRowElement>(
      ".database-table tbody tr[data-database-row-id]",
    ),
  );
  if (rows.length === 0) return 0;

  const targetIndex = rows.findIndex(
    (row) =>
      event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2,
  );
  return targetIndex === -1 ? rows.length : targetIndex;
};

export const hasDraggedDatabasePage = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes(DATABASE_PAGE_DRAG_MIME);

export const hasDraggedPageBlock = (event: DragEvent) =>
  getDraggedPageBlockPayload(event) !== null;

export const isDraggingPageToEditor = (event: DragEvent) =>
  hasDraggedDatabasePage(event) || hasDraggedPageBlock(event);

export const shouldSkipEditorDropLine = (event: DragEvent) =>
  event.target instanceof HTMLElement &&
  Boolean(event.target.closest(".database-table-wrap"));

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
      position: getDatabaseDropPosition(databaseElement, event),
      title: dropPayload.title,
    },
    {
      onError: (error) =>
        options.onError(
          error instanceof Error ? error.message : "Could not move page.",
        ),
      onSuccess: () => {
        if (dropPayload.blockPayload) {
          deleteDraggedEditorBlockSource(
            dropPayload.blockPayload as BlockDragPayload,
          );
        }
      },
    },
  );

  return true;
};
