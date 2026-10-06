import { setDatabasePageDragPayload } from "@/features/databases/interactions/database-page-drop";
import type { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { getSelectedBlockRangesForTarget } from "../extensions/block-selection";
import { createPositionAnchor, captureSourceIdentity } from "../operations/position-anchor";
import { createEditorHistoryCoordinator } from "./editor-history-coordinator";
import {
  EDITOR_BLOCK_DRAG_MIME,
  getDraggedEditorBlockPayload,
  type BlockDragPayload,
} from "../drag-drop/block-drag-session";
import { setMultiBlockDragImage, setDatabaseBlockDragImage } from "../drag-drop/block-drag-preview";
import type { DragHandleTarget } from "../toolbar/toolbar-contracts";
import { writeDragPayload } from "@/shared/lib/drag-drop";

export type DragPhase =
  | "idle"
  | "dragging"
  | "awaiting-choice"
  | "awaiting-resource"
  | "committing"
  | "completed"
  | "failed";
export function createEditorWorkspace() {
  const views = new Map<string, Editor>();
  const fields = new Map<string, string>();
  const runtimes = new Map<Editor, import("../core/types").EditorRuntimeHandle>();
  const registrations = new Map<string, symbol>();
  const history = createEditorHistoryCoordinator();
  let active: {
    payload: BlockDragPayload;
    editor: Editor;
    slice: Slice;
    from: ReturnType<typeof createPositionAnchor>;
    to: ReturnType<typeof createPositionAnchor>;
    ranges: Array<{ from: number; to: number }>;
    validIdentity: () => boolean;
  } | null = null;
  let phase: DragPhase = "idle";
  let clearIndicator: (() => void) | null = null;
  const reset = () => {
    if (active && !active.editor.isDestroyed) active.editor.view.dom.classList.remove("dragging");
    active?.from.dispose();
    active?.to.dispose();
    active = null;
    clearIndicator?.();
    clearIndicator = null;
    phase = "idle";
  };
  const drag = {
    get phase() {
      return phase;
    },
    get active() {
      return active;
    },
    transition(next: DragPhase) {
      phase = next;
    },
    reset,
    showIndicator(clear: () => void) {
      if (clearIndicator !== clear) clearIndicator?.();
      clearIndicator = clear;
    },
    arm(viewId: string, target: DragHandleTarget) {
      reset();
      const editor = views.get(viewId);
      if (
        !editor ||
        editor.isDestroyed ||
        !editor.isEditable ||
        runtimes.get(editor)?.getCapabilities().structural === false
      )
        return false;
      const { doc, selection } = editor.state;
      const selected = getSelectedBlockRangesForTarget(
        doc,
        selection.from,
        selection.to,
        target.pos,
      );
      const ranges =
        selected.length > 1
          ? selected
          : [{ from: target.pos, to: target.pos + target.node.nodeSize }];
      const from = ranges[0].from,
        to = ranges[ranges.length - 1].to;
      const slice = doc.slice(from, to);
      const payload: BlockDragPayload = {
        operationId: crypto.randomUUID(),
        editorId: viewId,
        pos: from,
        from,
        to,
        blockCount: ranges.length,
        node: target.node.toJSON(),
        slice: slice.toJSON(),
        parentTypeName: doc.resolve(from).parent.type.name,
        textContent: target.node.textContent,
        typeName: target.node.type.name,
      };
      active = {
        payload,
        editor,
        slice,
        from: createPositionAnchor(editor, from),
        to: createPositionAnchor(editor, to, "left"),
        validIdentity: captureSourceIdentity(editor, ranges),
        ranges,
      };
      phase = "dragging";
      return true;
    },
    read(dataTransfer: DataTransfer | null) {
      return active?.payload ?? getDraggedEditorBlockPayload(dataTransfer);
    },
    finalize(event: DragEvent, viewId: string) {
      if (!active || active.payload.editorId !== viewId || !event.dataTransfer) return;
      const { editor, slice, payload, ranges } = active;
      const { dom, text } = editor.view.serializeForClipboard(slice);
      event.dataTransfer.effectAllowed = "copyMove";
      writeDragPayload(event.dataTransfer, EDITOR_BLOCK_DRAG_MIME, payload);
      event.dataTransfer.setData("text/html", dom.innerHTML);
      event.dataTransfer.setData("text/plain", text);
      const pageId = (payload.node as { attrs?: { pageId?: unknown } }).attrs?.pageId;
      if (
        payload.blockCount === 1 &&
        payload.typeName === "pageBlock" &&
        typeof pageId === "string"
      )
        setDatabasePageDragPayload(event.dataTransfer, { pageId, title: payload.textContent });
      editor.view.dragging = { slice, move: !isCopyDrag(event) };
      editor.view.dom.classList.add("dragging");
      if (ranges.length === 1 && payload.typeName === "databaseBlock") {
        const element = editor.view.nodeDOM(ranges[0].from);
        if (element instanceof HTMLElement) setDatabaseBlockDragImage(event, element);
      }
      if (ranges.length > 1)
        setMultiBlockDragImage(
          event,
          ranges.flatMap((range) => {
            const element = editor.view.nodeDOM(range.from);
            return element instanceof HTMLElement ? [element] : [];
          }),
        );
    },
    source(payload: BlockDragPayload) {
      if (
        !active ||
        active.payload.operationId !== payload.operationId ||
        active.editor.isDestroyed ||
        !active.validIdentity() ||
        !active.editor.isEditable
      )
        return null;
      const from = active.from.resolve(),
        to = active.to.resolve();
      if (
        from === null ||
        to === null ||
        from < 0 ||
        to <= from ||
        to > active.editor.state.doc.content.size
      )
        return null;
      try {
        const slice = active.editor.state.doc.slice(from, to);
        return slice.eq(active.slice) ? { editor: active.editor, from, to, slice } : null;
      } catch {
        return null;
      }
    },
    endNative() {
      if (phase !== "awaiting-choice" && phase !== "awaiting-resource" && phase !== "committing")
        reset();
    },
  };
  return {
    views,
    history,
    drag,
    runtimes,
    registerView(
      viewId: string,
      editor: Editor,
      fieldKey: string,
      runtime?: import("../core/types").EditorRuntimeHandle,
    ) {
      const currentId = fields.get(fieldKey);
      if (currentId && currentId !== viewId) {
        views.get(currentId)?.commands.focus();
        editor.setEditable(false, false);
        return () => {};
      }
      if (runtime) runtimes.set(editor, runtime);
      const token = Symbol(viewId);
      registrations.set(viewId, token);
      views.set(viewId, editor);
      fields.set(fieldKey, viewId);
      const stopHistory = history.register(editor);
      return () => {
        stopHistory();
        if (registrations.get(viewId) !== token) return;
        registrations.delete(viewId);
        runtimes.delete(editor);
        if (active?.editor === editor) reset();
        views.delete(viewId);
        if (fields.get(fieldKey) === viewId) fields.delete(fieldKey);
      };
    },
    beginOperation(participants: Editor[]) {
      const callbacks = new Set(
        participants
          .map((editor) => runtimes.get(editor)?.getActions().onStructuralInsertionPendingChange)
          .filter((callback) => callback !== undefined),
      );
      for (const callback of callbacks) callback(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        for (const callback of callbacks) callback(false);
      };
    },
    ownsField(viewId: string, fieldKey: string) {
      return fields.get(fieldKey) === viewId;
    },
    getEditor(view: import("@tiptap/pm/view").EditorView) {
      return [...views.values()].find((editor) => !editor.isDestroyed && editor.view === view);
    },
  };
}
export type EditorWorkspace = ReturnType<typeof createEditorWorkspace>;
export function isCopyDrag(event: Pick<DragEvent, "altKey" | "ctrlKey">) {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
    ? event.altKey
    : event.ctrlKey;
}
