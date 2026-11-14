import type { PageDocumentNode } from "./page-document";

/*
 * Stable block IDs. The editor's unique-ID extension and server-side writers
 * use the same attribute and node types, so AI reads, edit anchors and
 * citations can address a block that keeps its ID as the page changes.
 */
export const BLOCK_ID_ATTRIBUTE = "blockId";
export const BLOCK_ID_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "callout",
  "codeBlock",
  "bulletList",
  "orderedList",
  "taskList",
  "table",
  "details",
  "tabsBlock",
  "columnBlock",
  "blockMath",
  "horizontalRule",
  "tableOfContentsBlock",
  "imageBlock",
  "videoBlock",
  "fileBlock",
  "embedBlock",
  "bookmarkBlock",
  "pageBlock",
  "databaseBlock",
  "meetingBlock",
] as const;
const identified = new Set<string>(BLOCK_ID_TYPES);

export function blockId(node: PageDocumentNode): string | null {
  const value = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  return typeof value === "string" && value ? value : null;
}

/** A copy of the nodes with an ID on every identified block that lacks one. */
export function assignBlockIds<T extends PageDocumentNode>(
  nodes: T[],
  generate: () => string,
): T[] {
  const visit = (node: PageDocumentNode): PageDocumentNode => {
    const needsId = !!node.type && identified.has(node.type) && !blockId(node);
    const id = needsId ? generate() : null;
    const content = node.content?.map(visit);
    if (!id && content?.every((child, index) => child === node.content![index])) return node;
    if (!id && !content) return node;
    return {
      ...node,
      ...(id ? { attrs: { ...node.attrs, [BLOCK_ID_ATTRIBUTE]: id } } : {}),
      ...(content ? { content } : {}),
    };
  };
  return nodes.map(visit) as T[];
}
