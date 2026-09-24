import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";

function readThreadId(mark: Mark, commentMark: Mark["type"]) {
  if (mark.type !== commentMark) return null;
  const value = mark.attrs.commentId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getCommentIdsAtSelection(editor: Editor): string[] {
  const { selection } = editor.state;

  if (selection.empty) {
    const commentMark = editor.schema.marks.comment;
    if (!commentMark) return [];

    const threadIds = new Set<string>();
    for (const mark of selection.$from.marks()) {
      const threadId = readThreadId(mark, commentMark);
      if (threadId) threadIds.add(threadId);
    }
    return [...threadIds];
  }

  return getCommentIdsInRange(editor, selection.from, selection.to);
}

export function getCommentIdsInRange(editor: Editor, from: number, to: number): string[] {
  const commentMark = editor.schema.marks.comment;
  if (!commentMark) return [];

  const { doc } = editor.state;
  const threadIds = new Set<string>();
  const collect = (marks: readonly Mark[]) => {
    for (const mark of marks) {
      const threadId = readThreadId(mark, commentMark);
      if (threadId) threadIds.add(threadId);
    }
  };

  const rangeFrom = Math.max(0, Math.min(from, doc.content.size));
  const rangeTo = Math.max(rangeFrom, Math.min(to, doc.content.size));
  doc.nodesBetween(rangeFrom, rangeTo, (node) => collect(node.marks));

  return [...threadIds];
}
