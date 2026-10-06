import { dispatchVerified } from "./dispatch-verified";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import type { EditorWorkspace } from "../runtime/editor-workspace";
import type { BlockDragPayload } from "../drag-drop/block-drag-session";
export type OperationResult =
  | { ok: true; operationId: string }
  | { ok: false; reason: "unavailable" | "changed-source" | "invalid-target" | "incomplete-move" };
export function stripCommentMarks(node: ProseMirrorNode): ProseMirrorNode {
  const content: ProseMirrorNode[] = [];
  node.content.forEach((child) => content.push(stripCommentMarks(child)));
  return node
    .copy(Fragment.fromArray(content))
    .mark(node.marks.filter((mark) => mark.type.name !== "comment"));
}
function destinationSlice(
  editor: Editor,
  slice: Slice,
  parentType: string,
  crossDocument: boolean,
  pos: number,
) {
  let next = Slice.fromJSON(editor.schema, slice.toJSON());
  if (crossDocument) {
    const nodes: ProseMirrorNode[] = [];
    next.content.forEach((node) => nodes.push(stripCommentMarks(node)));
    next = new Slice(Fragment.fromArray(nodes), next.openStart, next.openEnd);
  }
  const $pos = editor.state.doc.resolve(pos);
  if (
    next.content.firstChild &&
    ["listItem", "taskItem"].includes(next.content.firstChild.type.name) &&
    !$pos.parent.canReplace($pos.index(), $pos.index(), next.content)
  ) {
    const list = editor.schema.nodes[parentType];
    if (!list) return null;
    next = new Slice(Fragment.from(list.create(null, next.content)), 0, 0);
  }
  return next;
}
export function transferBlocks(
  workspace: EditorWorkspace,
  payload: BlockDragPayload,
  target: Editor,
  pos: number,
  mode: "copy" | "move",
): OperationResult {
  const source = workspace.drag.source(payload);
  if (!source) return { ok: false, reason: "changed-source" };
  if (
    workspace.runtimes.get(source.editor)?.getCapabilities().structural === false ||
    workspace.runtimes.get(target)?.getCapabilities().structural === false
  )
    return { ok: false, reason: "unavailable" };
  if (target.isDestroyed || !target.isEditable || workspace.history.pending)
    return { ok: false, reason: "unavailable" };
  const same = source.editor === target;
  if (same && mode === "move" && pos >= source.from && pos <= source.to)
    return { ok: true, operationId: payload.operationId };
  try {
    if (pos < 0 || pos > target.state.doc.content.size)
      return { ok: false, reason: "invalid-target" };
    const slice = destinationSlice(target, source.slice, payload.parentTypeName, !same, pos);
    if (!slice) return { ok: false, reason: "invalid-target" };
    const fittedPos = dropPoint(target.state.doc, pos, slice);
    if (fittedPos === null) return { ok: false, reason: "invalid-target" };
    const participants = same || mode === "copy" ? [target] : [target, source.editor];
    return workspace.history.group(
      participants,
      mode === "move" ? "Move blocks" : "Copy blocks",
      () => {
        if (same) {
          const tr = target.state.tr;
          if (mode === "move") tr.delete(source.from, source.to);
          const insertPos = tr.mapping.map(fittedPos);
          tr.replaceRange(insertPos, insertPos, slice);
          const outcome = dispatchVerified(target, tr);
          return outcome.applied
            ? { ok: true, operationId: payload.operationId }
            : { ok: false, reason: "unavailable" };
        }
        const insert = target.state.tr.replaceRange(fittedPos, fittedPos, slice);
        const remove = source.editor.state.tr.delete(source.from, source.to);
        const previous = target.state.doc;
        const inserted = dispatchVerified(target, insert);
        if (!inserted.applied) return { ok: false, reason: "invalid-target" };
        if (mode === "copy") return { ok: true, operationId: payload.operationId };
        try {
          // A synchronous destination observer can still change the source. Revalidate it.
          const current = workspace.drag.source(payload);
          if (
            !current ||
            current.from !== source.from ||
            current.to !== source.to ||
            !source.editor.state.doc.eq(remove.before)
          )
            throw new Error("Source changed");
          const removed = dispatchVerified(source.editor, remove);
          if (!removed.applied) throw new Error("Source deletion rejected");
          return { ok: true, operationId: payload.operationId };
        } catch {
          // Invert only this insertion, and only while its applied document still matches.
          if (inserted.expected && target.state.doc.eq(inserted.expected)) {
            target.commands.undo();
            if (target.state.doc.eq(previous)) return { ok: false, reason: "changed-source" };
          }
          return { ok: false, reason: "incomplete-move" };
        }
      },
      payload.operationId,
    );
  } catch {
    return { ok: false, reason: "invalid-target" };
  }
}
export function moveBlocks(
  workspace: EditorWorkspace,
  payload: BlockDragPayload,
  target: Editor,
  pos: number,
) {
  return transferBlocks(workspace, payload, target, pos, "move");
}
export function copyBlocks(
  workspace: EditorWorkspace,
  payload: BlockDragPayload,
  target: Editor,
  pos: number,
) {
  return transferBlocks(workspace, payload, target, pos, "copy");
}
export function removeBlocks(editor: Editor, from: number, to: number) {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const tr = editor.state.tr.delete(from, to);
  return dispatchVerified(editor, tr).applied;
}
