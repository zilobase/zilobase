import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import type { BlockDragPayload } from "./block-drag-session";
import { workspaceForView } from "../runtime/editor-integration";
import { transferBlocks, type OperationResult } from "../operations/block-operations";
import { isCopyDrag } from "../runtime/editor-workspace";
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
