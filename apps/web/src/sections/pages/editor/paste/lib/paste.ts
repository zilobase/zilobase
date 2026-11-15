import type { Editor } from "@tiptap/core";
import { createPositionAnchor } from "../../operations/lib/position-anchor";
import { workspaceForView } from "../../extensions/lib/editor-integration";
import { canEditEditorStructure } from "../../commands/lib/block-insert";
import {
  fetchBookmarkMetadata,
  getFallbackBookmarkMetadata,
} from "../../extensions/components/bookmark-block";
import type { EditorView } from "@tiptap/pm/view";
import { normalizeEmbedUrl, type EmbedProvider } from "../../extensions/components/embed-block";
const pastedBlockElementSelector = [
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
].join(",");

import type { EditorTableType, PasteChoiceState } from "../../lib/editor-types";

const getEmbedProvider = (embedAttrs: Record<string, unknown> | undefined): EmbedProvider | null =>
  embedAttrs && "provider" in embedAttrs ? (embedAttrs.provider as EmbedProvider) : null;

const looksLikeUrl = (value: string) =>
  /^(https?:\/\/|www\.|[^\s]+\.[^\s]{2,})/i.test(value.trim());

export const normalizePastedUrl = (value: string) => {
  const trimmed = value.trim();
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
};

const getEmojiFromImageSource = (image: HTMLImageElement | null) => {
  const source = image?.getAttribute("src");
  if (!source) return null;

  const match = source.match(/\/([0-9a-f-]+)\.(?:png|svg|webp)(?:[?#].*)?$/i);
  if (!match) return null;

  try {
    return String.fromCodePoint(
      ...match[1].split("-").map((codepoint) => Number.parseInt(codepoint, 16)),
    );
  } catch {
    return null;
  }
};

const restoreEmojiTextFromPastedDocument = (document: Document) => {
  let replaced = false;
  for (const emojiElement of Array.from(document.querySelectorAll('[data-type="emoji"]'))) {
    const emoji = getEmojiFromImageSource(emojiElement.querySelector("img") as HTMLImageElement);
    if (!emoji) continue;
    emojiElement.replaceWith(document.createTextNode(emoji));
    replaced = true;
  }
  return replaced;
};

const detectEditorTableType = (table: HTMLTableElement): EditorTableType => {
  if (
    table.getAttribute("data-type") !== "columnBlock" &&
    table.getAttribute("data-layout") !== "columns"
  )
    return "table";
  const rows = table.querySelectorAll("tbody > tr");
  const firstRowCells = table.querySelectorAll("tbody > tr:first-child > td");
  const isDataTable =
    table.querySelectorAll("th").length > 0 ||
    rows.length > 1 ||
    table.querySelectorAll("[colwidth]").length > 0;

  if (isDataTable) return "table";
  if (rows.length === 1 && firstRowCells.length > 1) return "columns";
  return "unknown";
};

const appendTableCellContentToColumn = (
  document: Document,
  cell: HTMLTableCellElement,
  column: HTMLDivElement,
) => {
  if (!cell.textContent?.trim() && cell.children.length === 0) {
    column.appendChild(document.createElement("p"));
    return;
  }
  const target = cell.querySelector(pastedBlockElementSelector)
    ? column
    : document.createElement("p");
  while (cell.firstChild) target.appendChild(cell.firstChild);
  if (target !== column) column.appendChild(target);
};

const createColumnBlockFromTable = (document: Document, table: HTMLTableElement) => {
  const cells = Array.from(
    table.querySelectorAll<HTMLTableCellElement>("tbody > tr:first-child > td"),
  );
  const columnBlock = document.createElement("div");
  columnBlock.setAttribute("data-type", "columnBlock");
  columnBlock.setAttribute("data-column-count", String(cells.length));
  columnBlock.setAttribute(
    "data-widths",
    JSON.stringify(Array.from({ length: cells.length }, () => 100 / cells.length)),
  );
  for (const cell of cells) {
    const column = document.createElement("div");
    column.setAttribute("data-type", "column");
    appendTableCellContentToColumn(document, cell, column);
    columnBlock.appendChild(column);
  }
  return columnBlock;
};

const transformPastedEditorTables = (document: Document) => {
  let transformed = false;
  for (const table of Array.from(document.querySelectorAll("table"))) {
    if (!table.isConnected || table.parentElement?.closest("table")) continue;
    if (detectEditorTableType(table) !== "columns") continue;
    table.replaceWith(createColumnBlockFromTable(document, table));
    transformed = true;
  }
  return transformed;
};

export const normalizePastedEditorHTML = (html: string) => {
  const document = new DOMParser().parseFromString(html, "text/html");
  const emojiChanged = restoreEmojiTextFromPastedDocument(document);
  const tablesChanged = transformPastedEditorTables(document);
  const changed = emojiChanged || tablesChanged;
  return changed ? document.body.innerHTML : html;
};

const createLinkChoice = (
  view: EditorView,
  text: string,
  from: number,
  to: number,
): PasteChoiceState | null => {
  const url = normalizePastedUrl(text) ?? text;
  const embedAttrs = normalizeEmbedUrl(url) ?? undefined;
  const coords = view.coordsAtPos(to);
  const editor = workspaceForView(view)?.getEditor(view);
  if (!editor) return null;
  const start = createPositionAnchor(editor, from);
  const end = createPositionAnchor(editor, to, "left");
  let disposed = false;
  let references = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    start.dispose();
    end.dispose();
    editor.off("destroy", dispose);
  };
  editor.on("destroy", dispose);
  return {
    dispose,
    retain: () => {
      references++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        references--;
        // StrictMode reattaches the same choice before this microtask. Actual
        // dismissal and document replacement still release both anchors.
        queueMicrotask(() => {
          if (!references) dispose();
        });
      };
    },
    resolve: () => {
      const from = start.resolve(),
        to = end.resolve();
      if (disposed || !canEditEditorStructure(editor) || from === null || to === null || to < from)
        return null;
      return editor.state.doc.textBetween(from, to) === text ? { from, to } : null;
    },
    anchor: {
      getBoundingClientRect: () => new DOMRect(coords.left, coords.bottom, 0, 0),
    },
    embedAttrs,
    provider: getEmbedProvider(embedAttrs),
    url,
  };
};

const getTypedUrlRangeBeforeCursor = (view: EditorView) => {
  const { selection } = view.state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;
  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const trimmedEnd = textBeforeCursor.replace(/\s+$/, "");
  const tokenMatch = trimmedEnd.match(/(?:^|\s)(\S+)$/);
  const token = tokenMatch?.[1];

  if (!token || !looksLikeUrl(token)) {
    return null;
  }

  const normalized = normalizePastedUrl(token);

  if (!normalized) {
    return null;
  }

  const tokenEndOffset = trimmedEnd.length;
  const tokenStartOffset = tokenEndOffset - token.length;
  const from = $from.start() + tokenStartOffset;
  const to = $from.start() + tokenEndOffset;

  return { from, text: token, to };
};

export const handleProviderLinkPaste = (
  view: EditorView,
  event: ClipboardEvent,
  editable: boolean,
  onPasteChoice: (choice: PasteChoiceState) => void,
) => {
  if (!editable || view.state.selection.$from.parent.type.spec.code) return false;

  const pastedText = event.clipboardData?.getData("text/plain").trim();
  if (!pastedText || /\s/.test(pastedText) || !looksLikeUrl(pastedText)) {
    return false;
  }

  const normalizedUrl = normalizePastedUrl(pastedText);
  if (!normalizedUrl) return false;

  event.preventDefault();
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.insertText(pastedText, from, to));
  const choice = createLinkChoice(view, pastedText, from, from + pastedText.length);
  if (choice) onPasteChoice(choice);
  return true;
};

export const handleTypedLinkChoice = (
  view: EditorView,
  event: KeyboardEvent,
  editable: boolean,
  onPasteChoice: (choice: PasteChoiceState) => void,
) => {
  if (
    !editable ||
    view.state.selection.$from.parent.type.spec.code ||
    (event.key !== " " && event.key !== "Enter")
  ) {
    return false;
  }

  const typedUrl = getTypedUrlRangeBeforeCursor(view);

  if (!typedUrl) {
    return false;
  }

  const choice = createLinkChoice(view, typedUrl.text, typedUrl.from, typedUrl.to);
  if (choice) onPasteChoice(choice);
  return false;
};

export function clipboardLanguage(data: Pick<DataTransfer, "getData">) {
  try {
    const metadata: unknown = JSON.parse(data.getData("vscode-editor-data") || "null");
    if (
      metadata &&
      typeof metadata === "object" &&
      "mode" in metadata &&
      typeof metadata.mode === "string"
    )
      return metadata.mode.toLowerCase();
  } catch {
    /* Malformed optional source metadata must never block a paste. */
  }
  return null;
}

export function looksLikeMarkdown(text: string) {
  return /(?:^|\n) {0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|`{3,}|~{3,}|(?:-{3,}|\*{3,})\s*$)|\*\*[^*]+\*\*|!?\[[^\]]*\]\([^\n)]+\)|(?:^|\n)\s*\|?\s*:?-{3,}:?\s*\|/m.test(
    text,
  );
}

/** Returns false only when native ProseMirror paste should handle the clipboard. */
export function handleEditorPaste(
  editor: Editor,
  event: ClipboardEvent,
  plain: boolean,
  onPasteChoice: (choice: PasteChoiceState) => void,
) {
  if (!editor.isEditable || editor.isDestroyed) return false;
  const data = event.clipboardData;
  if (!data || plain || editor.state.selection.$from.parent.type.spec.code) return false;
  const text = data.getData("text/plain");
  const html = data.getData("text/html");
  if (/data-pm-slice=/.test(html)) return false;
  const language = clipboardLanguage(data);
  const markdown = data.getData("text/markdown") || data.getData("text/x-markdown");
  const markdownMode = ["markdown", "md", "mdx"].includes(language ?? "");
  const sourceCode = language && !markdownMode && !["plaintext", "text"].includes(language);
  const source = markdown || text;
  if (!canEditEditorStructure(editor)) return false;
  if (markdown || markdownMode || sourceCode || (!html && looksLikeMarkdown(text))) {
    try {
      const content = sourceCode
        ? {
            type: "doc",
            content: [
              {
                type: "codeBlock",
                attrs: { language },
                content: text ? [{ type: "text", text: text.replace(/\r\n?/g, "\n") }] : [],
              },
            ],
          }
        : editor.markdown?.parse(source);
      if (!content) return false;
      editor.schema.nodeFromJSON(content).check();
      const applied = editor
        .chain()
        .insertContent(content)
        .setMeta("paste", true)
        .setMeta("uiEvent", "paste")
        .run();
      if (applied) event.preventDefault();
      return applied;
    } catch {
      return false;
    }
  }
  if (html) return false;
  return handleProviderLinkPaste(editor.view, event, true, onPasteChoice);
}

export async function pasteBookmark(
  choice: PasteChoiceState,
  replace: (content: import("@tiptap/core").Content) => void,
  type: "bookmarkBlock" | "linkMention",
) {
  const fallback = getFallbackBookmarkMetadata(choice.url);
  let metadata = {};
  try {
    metadata = await fetchBookmarkMetadata(choice.url);
  } catch {}
  if (!choice.resolve()) return;
  const block = { type, attrs: { ...fallback, ...metadata, href: choice.url } };
  replace(type === "linkMention" ? [block, { type: "text", text: " " }] : block);
}
