import type { Editor, JSONContent } from "@tiptap/core";
import { markdownToPageDocument, prosemirrorToMarkdown } from "@zilobase/page-context";

const CONTEXT_CHARACTERS = 6_000;

/** The workspace the editor's Ask AI block was configured for. */
export function editorAiWorkspaceId(editor: Editor): string | null {
  const block = editor.extensionManager.extensions.find(({ name }) => name === "askAiBlock");
  return (block?.options as { workspaceId?: string | null } | undefined)?.workspaceId ?? null;
}

export function rangeMarkdown(editor: Editor, from: number, to: number) {
  return prosemirrorToMarkdown({
    type: "doc",
    content: editor.state.doc.slice(from, to).content.toJSON() as JSONContent[],
  });
}

/** Markdown just before a position, for tone and continuity. */
export function contextMarkdown(editor: Editor, position: number) {
  return rangeMarkdown(editor, 0, position).slice(-CONTEXT_CHARACTERS);
}

/** Whether a range sits inside one text block, so a rewrite stays inline. */
export function isInlineRange(editor: Editor, from: number, to: number) {
  const start = editor.state.doc.resolve(from);
  return start.parent.isTextblock && start.sameParent(editor.state.doc.resolve(to));
}

/** Editor content for generated Markdown; a one-paragraph answer becomes inline text when asked. */
export function markdownContent(markdown: string, inline: boolean): JSONContent[] {
  const blocks = (markdownToPageDocument(markdown).content ?? []) as JSONContent[];
  const [first] = blocks;
  return inline && blocks.length === 1 && first?.type === "paragraph"
    ? (first.content ?? [])
    : blocks;
}
