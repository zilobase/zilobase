import { isAllowedEmbedSrc, isAllowedHttpUrl, isAllowedImageUrl } from "./safe-url";
import type { PageDocument, PageDocumentNode } from "./types";

const allowedNodeTypes = new Set([
  "doc",
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "imageBlock",
  "videoBlock",
  "embedBlock",
  "bookmarkBlock",
  "text",
]);

export function sanitizePageContent(document: PageDocument): PageDocument {
  const content = document.content.flatMap((node) => sanitizeNode(node));
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function sanitizeNode(node: PageDocumentNode): PageDocumentNode[] {
  if (node.type === "text") {
    return node.text ? [{ ...node, marks: sanitizeMarks(node.marks) }] : [];
  }

  if (!node.type || !allowedNodeTypes.has(node.type)) {
    return node.content?.flatMap((child) => sanitizeNode(child)) ?? [];
  }

  const media = sanitizeMediaNode(node);
  if (media) return media;

  return [
    {
      ...node,
      marks: sanitizeMarks(node.marks),
      content: node.content?.flatMap((child) => sanitizeNode(child)),
    },
  ];
}

function sanitizeMediaNode(node: PageDocumentNode): PageDocumentNode[] | null {
  if (node.type === "imageBlock") {
    const src = stringAttr(node.attrs, "src");
    if (!isAllowedImageUrl(src)) return [];
    return [node];
  }

  if (node.type === "videoBlock") {
    const src = stringAttr(node.attrs, "src");
    if (!isAllowedHttpUrl(src)) return [];
    return [node];
  }

  if (node.type === "embedBlock") {
    const src = stringAttr(node.attrs, "src");
    if (!isAllowedEmbedSrc(src)) return [];
    return [node];
  }

  if (node.type === "bookmarkBlock") {
    return sanitizeBookmarkNode(node);
  }

  return null;
}

function sanitizeBookmarkNode(node: PageDocumentNode): PageDocumentNode[] {
  const href = stringAttr(node.attrs, "href");
  if (!isAllowedHttpUrl(href)) return [];
  return [
    {
      ...node,
      attrs: {
        ...node.attrs,
        href,
        favicon: optionalAllowedUrl(node.attrs?.favicon, isAllowedHttpUrl),
        image: optionalAllowedUrl(node.attrs?.image, isAllowedImageUrl),
      },
    },
  ];
}

function sanitizeMarks(marks: PageDocumentNode["marks"]) {
  if (!marks?.length) return marks;
  return marks.flatMap((mark) => {
    if (mark.type !== "link") return [mark];
    const href = stringAttr(mark.attrs, "href");
    if (!isAllowedHttpUrl(href)) return [];
    return [{ ...mark, attrs: { ...mark.attrs, href } }];
  });
}

function stringAttr(attrs: Record<string, unknown> | undefined, key: string) {
  const value = attrs?.[key];
  return typeof value === "string" ? value : null;
}

function optionalAllowedUrl(value: unknown, allow: (value: string | null | undefined) => boolean) {
  return typeof value === "string" && allow(value) ? value : null;
}
