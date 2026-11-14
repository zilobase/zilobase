import {
  markdownToPageDocument,
  type MarkdownResolvers,
} from "../markdown/markdown-to-page-document";
import { blockId } from "./block-ids";
import type { PageDocumentNode } from "./page-document";

/*
 * Edits to an existing page, addressed by the text of its top-level blocks.
 * Planning is pure: it turns edits into ordered splices of the top-level
 * block list, which runtimes apply inside one live-document transaction so
 * untouched blocks, comments and concurrent edits elsewhere are preserved.
 */

/** A block ID from read_page, or text identifying a top-level block (a heading or a paragraph's start). */
export type PageEditAnchor = string;

export type PageEdit =
  | { type: "append"; markdown: string }
  | { type: "prepend"; markdown: string }
  | { type: "insert_after"; anchor: PageEditAnchor; markdown: string }
  | { type: "insert_before"; anchor: PageEditAnchor; markdown: string }
  | { type: "replace_block"; anchor: PageEditAnchor; markdown: string }
  /** Replaces everything under a heading up to the next heading of the same or higher level. */
  | { type: "replace_section"; heading: PageEditAnchor; markdown: string }
  /** Replaces text inside blocks, keeping their formatting; `all` replaces every occurrence. */
  | { type: "replace_text"; find: string; replace: string; all?: boolean }
  /** Internal (undo): removes blocks by ID. */
  | { type: "remove_blocks"; blockIds: string[] }
  /** Internal (undo): reinserts saved blocks after an anchor, or at the start when `after` is null. */
  | { type: "insert_nodes"; after: PageEditAnchor | null; nodes: PageDocumentNode[] };

export type PageSplice = { index: number; deleteCount: number; nodes: PageDocumentNode[] };
export type PageEditPlan =
  | { splices: PageSplice[]; blocks: PageDocumentNode[] }
  | { error: string };

const normalize = (value: string) =>
  value
    .replace(/[#*_`~>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

export function blockText(node: PageDocumentNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(blockText).join(node.type === "paragraph" ? "" : " ");
}

/**
 * Inserts may use read_page's block numbers: a moved position only misplaces
 * new content. Replacements need the block's text, so a page that changed
 * since it was read can never cause the wrong block to be replaced.
 */
function findBlock(blocks: PageDocumentNode[], anchor: string, numbered: boolean): number | string {
  // Block IDs from read_page identify a block exactly, even after it moved or changed.
  const byId = blocks.findIndex((block) => blockId(block) === anchor.trim());
  if (byId >= 0) return byId;
  const target = normalize(anchor);
  if (!target) return "The anchor is empty.";
  const number = target.match(/^(?:block\s*:?\s*)?(\d+)$/)?.[1];
  if (number && !blocks.some((block) => normalize(blockText(block)) === target)) {
    const index = Number(number);
    if (numbered && index < blocks.length) return index;
    return `"${anchor}" looks like a block number; anchor edits with the block's text, such as a heading.`;
  }
  const texts = blocks.map((block) => normalize(blockText(block)));
  for (const matches of [
    (text: string) => text === target,
    (text: string) => text.startsWith(target),
    (text: string) => text.includes(target),
  ]) {
    const found = texts.flatMap((text, index) => (matches(text) ? [index] : []));
    if (found.length === 1) return found[0]!;
    if (found.length > 1)
      return `"${anchor}" matches ${found.length} blocks; quote more of the block's text.`;
  }
  return `No block matches "${anchor}". Read the page and quote a heading or the start of a paragraph.`;
}

function sectionEnd(blocks: PageDocumentNode[], heading: number) {
  const level = Number(blocks[heading]!.attrs?.level ?? 1);
  for (let index = heading + 1; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.type === "heading" && Number(block.attrs?.level ?? 1) <= level) return index;
  }
  return blocks.length;
}

function replaceText(node: PageDocumentNode, find: string, replace: string, all: boolean) {
  let replaced = 0;
  const visit = (current: PageDocumentNode): PageDocumentNode => {
    if (
      current.type === "text" &&
      current.text &&
      (all || !replaced) &&
      current.text.includes(find)
    ) {
      const text = all
        ? current.text.split(find).join(replace)
        : current.text.replace(find, () => replace);
      replaced += all ? current.text.split(find).length - 1 : 1;
      return { ...current, text };
    }
    return current.content ? { ...current, content: current.content.map(visit) } : current;
  };
  return { node: visit(node), replaced };
}

export function planPageEdits(
  document: PageDocumentNode,
  edits: readonly PageEdit[],
  resolvers?: MarkdownResolvers,
): PageEditPlan {
  let blocks = [...(document.content ?? [])];
  const splices: PageSplice[] = [];
  const nodes = (markdown: string) =>
    markdown.trim() ? (markdownToPageDocument(markdown, resolvers).content ?? []) : [];
  const splice = (index: number, deleteCount: number, inserted: PageDocumentNode[]) => {
    splices.push({ index, deleteCount, nodes: inserted });
    blocks = [...blocks.slice(0, index), ...inserted, ...blocks.slice(index + deleteCount)];
  };
  const isEmpty = blocks.length === 1 && blocks[0]!.type === "paragraph" && !blockText(blocks[0]!);

  for (const edit of edits) {
    if (edit.type === "append" || edit.type === "prepend") {
      // A new page's single empty paragraph is replaced instead of kept around the content.
      if (isEmpty && splices.length === 0) splice(0, 1, nodes(edit.markdown));
      else splice(edit.type === "append" ? blocks.length : 0, 0, nodes(edit.markdown));
      continue;
    }
    if (edit.type === "remove_blocks") {
      for (const id of edit.blockIds) {
        const index = blocks.findIndex((block) => blockId(block) === id);
        if (index >= 0) splice(index, 1, []);
      }
      continue;
    }
    if (edit.type === "insert_nodes") {
      const index = edit.after === null ? -1 : findBlock(blocks, edit.after, true);
      if (typeof index === "string") return { error: index };
      splice(index + 1, 0, edit.nodes);
      continue;
    }
    if (edit.type === "replace_text") {
      if (!edit.find) return { error: "replace_text needs text to find." };
      let total = 0;
      for (let index = 0; index < blocks.length && (edit.all || !total); index += 1) {
        const { node, replaced } = replaceText(blocks[index]!, edit.find, edit.replace, !!edit.all);
        if (replaced) {
          splice(index, 1, [node]);
          total += replaced;
        }
      }
      if (!total)
        return { error: `"${edit.find}" was not found in a single text run of the page.` };
      continue;
    }
    const anchor = edit.type === "replace_section" ? edit.heading : edit.anchor;
    const index = findBlock(
      blocks,
      anchor,
      edit.type === "insert_after" || edit.type === "insert_before",
    );
    if (typeof index === "string") return { error: index };
    if (edit.type === "insert_after") splice(index + 1, 0, nodes(edit.markdown));
    else if (edit.type === "insert_before") splice(index, 0, nodes(edit.markdown));
    else if (edit.type === "replace_block") splice(index, 1, nodes(edit.markdown));
    else {
      if (blocks[index]!.type !== "heading") return { error: `"${anchor}" is not a heading.` };
      splice(index + 1, sectionEnd(blocks, index) - index - 1, nodes(edit.markdown));
    }
  }
  return { splices, blocks };
}

/**
 * Edits that undo applied splices: remove the inserted blocks (by ID) and put
 * the removed ones back after their former neighbour, latest splice first.
 */
export function invertPageSplices(
  before: PageDocumentNode[],
  splices: readonly PageSplice[],
): PageEdit[] {
  let blocks = [...before];
  const inverse: PageEdit[][] = [];
  for (const splice of splices) {
    const removed = blocks.slice(splice.index, splice.index + splice.deleteCount);
    const previous = blocks[splice.index - 1];
    const after =
      splice.index === 0 ? null : previous ? (blockId(previous) ?? String(splice.index - 1)) : null;
    const inserted = splice.nodes.flatMap((node) => {
      const id = blockId(node);
      return id ? [id] : [];
    });
    inverse.push([
      ...(inserted.length ? [{ type: "remove_blocks" as const, blockIds: inserted }] : []),
      ...(removed.length ? [{ type: "insert_nodes" as const, after, nodes: removed }] : []),
    ]);
    blocks = [
      ...blocks.slice(0, splice.index),
      ...splice.nodes,
      ...blocks.slice(splice.index + splice.deleteCount),
    ];
  }
  return inverse.reverse().flat();
}
