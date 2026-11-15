import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import type { BlockDragPayload } from "./block-drag-session";
import { workspaceForView } from "../../extensions/lib/editor-integration";
import { transferBlocks, type OperationResult } from "../../operations/lib/block-operations";
import { isCopyDrag } from "../../runtime/lib/editor-workspace";
import type { Editor } from "@tiptap/core";
import type { EditorWorkspace } from "../../runtime/lib/editor-workspace";
import type { EditorResourceActions, EditorResourceReceipt } from "../../lib/editor-types";
import type { PendingDatabaseBlockDrop } from "../components/database-block-drop-dialog";

export async function commitDatabaseBlockDrop({
  editor,
  workspace,
  pendingDrop,
  mode,
  actions,
  onComplete,
  onError,
  onSettled,
}: {
  editor: Editor;
  workspace: EditorWorkspace;
  pendingDrop: PendingDatabaseBlockDrop;
  mode: "copy" | "move";
  actions: Pick<EditorResourceActions, "onEmbedDatabase" | "onMoveDatabase">;
  onComplete: () => void;
  onError: (message: string) => void;
  onSettled: () => void;
}) {
  try {
    if (
      editor.isDestroyed ||
      !editor.isEditable ||
      pendingDrop.anchor.resolve() === null ||
      !workspace.drag.source(pendingDrop.payload)
    )
      return;
    let resource: EditorResourceReceipt | void;
    if (mode === "copy") {
      const embed = actions.onEmbedDatabase;
      if (!embed) throw new Error("Database linking is unavailable.");
      resource = await embed(pendingDrop.databaseId);
    } else {
      const sourcePageId = workspace.runtimes
        .get(workspace.drag.active!.editor)
        ?.getSession().pageId;
      const move = actions.onMoveDatabase;
      if (!sourcePageId || !move) throw new Error("Database movement is unavailable.");
      resource = await move(pendingDrop.databaseId, sourcePageId);
    }
    const pos = pendingDrop.anchor.resolve();
    const completed =
      !editor.isDestroyed &&
      pos !== null &&
      dropCrossEditorBlock(editor.view, pendingDrop.payload, pos, mode);
    if (!completed) {
      await resource?.undo();
      onError(
        mode === "move"
          ? "Could not move the database."
          : "Could not create the linked database view.",
      );
      return;
    }
    if (resource)
      workspace.history.attachResource(pendingDrop.payload.operationId, resource, (error) =>
        onError(error instanceof Error ? error.message : "Could not update database link."),
      );
    onComplete();
  } catch (error) {
    onError(error instanceof Error ? error.message : "Could not update the database.");
  } finally {
    onSettled();
  }
}

function reportFailure(result: OperationResult) {
  if (result.ok) return;
  toast.error(
    result.reason === "incomplete-move"
      ? "The source could not be removed. A copy remains in the destination."
      : result.reason === "changed-source"
        ? "The source changed during the drag. Please try again."
        : "Blocks could not be dropped here.",
  );
}
export function dropEditorBlock(view: EditorView, event: DragEvent, pos: number) {
  const workspace = workspaceForView(view);
  const payload = workspace?.drag.read(event.dataTransfer);
  const editor = workspace?.getEditor(view);
  if (!workspace || !payload || !editor) return false;
  event.preventDefault();
  event.stopPropagation();
  workspace.drag.transition("committing");
  const result = transferBlocks(
    workspace,
    payload,
    editor,
    pos,
    isCopyDrag(event) ? "copy" : "move",
  );
  workspace.drag.transition(result.ok ? "completed" : "failed");
  workspace.drag.reset();
  reportFailure(result);
  if (result.ok) editor.commands.focus(undefined, { scrollIntoView: false });
  return true;
}
export function dropCrossEditorBlock(
  view: EditorView,
  payload: BlockDragPayload,
  pos: number,
  mode: "copy" | "move",
) {
  const workspace = workspaceForView(view),
    editor = workspace?.getEditor(view);
  if (!workspace || !editor) return false;
  workspace.drag.transition("committing");
  const result = transferBlocks(workspace, payload, editor, pos, mode);
  workspace.drag.transition(result.ok ? "completed" : "failed");
  workspace.drag.reset();
  reportFailure(result);
  return result.ok;
}
