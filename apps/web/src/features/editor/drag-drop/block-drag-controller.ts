import { isCopyDrag } from "../runtime/editor-workspace";
import type { DragEvent as ReactDragEvent } from "react";
import type { EditorView } from "@tiptap/pm/view";

import type { BlockDropLine } from "../core/types";
import { dropEditorBlock } from "./block-drop";
import { getEditorInsertDropTarget } from "./block-drag-geometry";
import { getDraggedEditorBlockPayload, hasEditorBlockDragData } from "./block-drag-session";

export type DragDropBridge = {
  workspace: import("../runtime/editor-workspace").EditorWorkspace;
  viewId: string;
  deferCrossEditorDatabaseDrop: (
    view: EditorView,
    payload: NonNullable<ReturnType<typeof getDraggedEditorBlockPayload>>,
    pos: number,
  ) => boolean;
  dropPageOnDatabase: (event: DragEvent) => boolean;
  getView: () => EditorView | null;
  insertDraggedPage: (view: EditorView, event: DragEvent) => boolean;
  isDraggingPage: (event: DragEvent) => boolean;
  isOverDatabaseDrop: (event: DragEvent) => boolean;
  shouldSkipDropLine: (event: DragEvent) => boolean;
  surfaceRef?: { current: HTMLElement | null };
};

type PendingDropLine = {
  clientX: number;
  clientY: number;
  view: EditorView;
};

function sameDropLine(left: BlockDropLine | null, right: BlockDropLine | null) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.left === right.left &&
      left.right === right.right &&
      left.top === right.top)
  );
}

export function createEditorDragDrop(
  renderDropLine: (line: BlockDropLine | null) => void,
  bridge: DragDropBridge,
) {
  let currentDropLine: BlockDropLine | null = null;
  let pendingDropLine: PendingDropLine | null = null;
  let dropLineFrame: number | null = null;
  let unbind: (() => void) | undefined;

  const setDropLine = (line: BlockDropLine | null) => {
    if (sameDropLine(currentDropLine, line)) return;
    currentDropLine = line;
    if (line) bridge.workspace.drag.showIndicator(clearDropLine);
    renderDropLine(line);
  };

  const cancelDropLineFrame = () => {
    if (dropLineFrame !== null) window.cancelAnimationFrame(dropLineFrame);
    dropLineFrame = null;
    pendingDropLine = null;
  };

  const clearDropLine = () => {
    cancelDropLineFrame();
    setDropLine(null);
  };

  const scheduleDropLine = (view: EditorView, event: DragEvent) => {
    pendingDropLine = {
      clientX: event.clientX,
      clientY: event.clientY,
      view,
    };
    if (dropLineFrame !== null) return;

    dropLineFrame = window.requestAnimationFrame(updateDropLine);
  };

  const updateDropLine = () => {
    dropLineFrame = null;
    const pending = pendingDropLine;
    if (!pending || !pending.view.dom.isConnected) {
      pendingDropLine = null;
      return;
    }
    // The pane owns scrolling; nested editor surfaces must not scroll the outer page.
    let container: HTMLElement | null = pending.view.dom.parentElement;
    while (container && container !== document.body) {
      if (
        /(auto|scroll)/.test(getComputedStyle(container).overflowY) &&
        container.scrollHeight > container.clientHeight
      )
        break;
      container = container.parentElement;
    }
    let scrolled = false;
    if (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      const edge = 48;
      const speed =
        pending.clientY < rect.top + edge
          ? -Math.min(18, (rect.top + edge - pending.clientY) / 3)
          : pending.clientY > rect.bottom - edge
            ? Math.min(18, (pending.clientY - rect.bottom + edge) / 3)
            : 0;
      const before = container.scrollTop;
      if (speed) container.scrollTop += speed;
      scrolled = before !== container.scrollTop;
    }
    const target = getEditorInsertDropTarget(pending.view, pending);
    setDropLine(target?.line ?? null);
    if (scrolled) dropLineFrame = window.requestAnimationFrame(updateDropLine);
    else pendingDropLine = null;
  };

  const onDragOver = (view: EditorView, event: DragEvent) => {
    const isBlockDrag =
      hasEditorBlockDragData(event.dataTransfer) || bridge.workspace.drag.active !== null;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-editor-view-id]")?.getAttribute("data-editor-view-id") !==
        bridge.viewId
    )
      return false;
    const isPageDrag = bridge.isDraggingPage(event);
    if (!isBlockDrag && !isPageDrag) {
      clearDropLine();
      return false;
    }

    const skipDropLine = bridge.shouldSkipDropLine(event);
    const overDatabaseDrop = bridge.isOverDatabaseDrop(event);
    if (skipDropLine || overDatabaseDrop) clearDropLine();
    else scheduleDropLine(view, event);

    if (overDatabaseDrop && isPageDrag) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      return false;
    }

    if (skipDropLine) return false;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = isBlockDrag && !isCopyDrag(event) ? "move" : "copy";
    }
    return false;
  };

  const onDrop = (view: EditorView, event: DragEvent) => {
    if (event.defaultPrevented) return true;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-editor-view-id]")?.getAttribute("data-editor-view-id") !==
        bridge.viewId
    )
      return false;
    clearDropLine();
    if (bridge.dropPageOnDatabase(event)) return true;

    const payload = bridge.workspace.drag.read(event.dataTransfer);
    if (payload) {
      const target = getEditorInsertDropTarget(view, event);
      if (
        target &&
        payload.typeName === "databaseBlock" &&
        bridge.deferCrossEditorDatabaseDrop(view, payload, target.pos)
      ) {
        event.preventDefault();
        return true;
      }
      if (target && view.editable && dropEditorBlock(view, event, target.pos)) return true;
      event.preventDefault();
      event.stopPropagation();
      bridge.workspace.drag.reset();
      return true;
    }

    if (hasEditorBlockDragData(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      bridge.workspace.drag.reset();
      return true;
    }
    if (bridge.insertDraggedPage(view, event)) return true;
    if (bridge.isDraggingPage(event)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return false;
  };

  const onLeave = (container: Node | null, event: DragEvent) => {
    if (
      container &&
      event.relatedTarget instanceof Node &&
      container.contains(event.relatedTarget)
    ) {
      return;
    }
    clearDropLine();
  };

  const endDrag = (view?: EditorView | null) => {
    clearDropLine();
    view?.dom.classList.remove("dragging");
    bridge.workspace.drag.endNative();
  };

  const isInsideEditor = (view: EditorView, target: EventTarget | null) =>
    target instanceof Node && view.dom.contains(target);

  return {
    bind: () => {
      unbind?.();
      const surface = bridge.surfaceRef?.current;
      const finalize = (event: DragEvent) => {
        const source =
          event.target instanceof Element ? event.target.closest("[data-editor-view-id]") : null;
        if (source?.getAttribute("data-editor-view-id") === bridge.viewId)
          bridge.workspace.drag.finalize(event, bridge.viewId);
      };
      // React portal bubbling can run at the handle itself before the official handler clears DataTransfer.
      // A native listener on its actual ancestor always runs after that handler.
      surface?.addEventListener("dragstart", finalize);
      unbind = () => surface?.removeEventListener("dragstart", finalize);
    },
    destroy: () => {
      unbind?.();
      unbind = undefined;
      clearDropLine();
    },
    handleDrop: onDrop,
    domEvents: {
      // Consume internal drops before Tiptap paste rules schedule cross-editor source deletion.
      drop: onDrop,
      dragover: onDragOver,
      dragend: (view: EditorView) => {
        endDrag(view);
        return false;
      },
      dragleave: (view: EditorView, event: DragEvent) => {
        onLeave(view.dom, event);
        return false;
      },
    },
    surfaceProps: {
      onDragEnd: () => endDrag(bridge.getView()),
      onDragLeave: (event: ReactDragEvent<HTMLElement>) =>
        onLeave(bridge.surfaceRef?.current ?? null, event.nativeEvent),
      onDragOverCapture: (event: ReactDragEvent<HTMLElement>) => {
        const nativeEvent = event.nativeEvent;

        // Database node views own their internal drag events, so ProseMirror's
        // dragover handler may not see this transition. Clear the page-level
        // insertion line before the database renders its row drop line.
        if (bridge.isDraggingPage(nativeEvent) && bridge.isOverDatabaseDrop(nativeEvent)) {
          clearDropLine();
        }
      },
      onDragOver: (event: ReactDragEvent<HTMLElement>) => {
        const view = bridge.getView();
        if (view && !isInsideEditor(view, event.target)) {
          onDragOver(view, event.nativeEvent);
        }
      },
      onDrop: (event: ReactDragEvent<HTMLElement>) => {
        const view = bridge.getView();
        if (view && (!isInsideEditor(view, event.target) || !view.editable)) {
          onDrop(view, event.nativeEvent);
        }
      },
    },
  };
}
