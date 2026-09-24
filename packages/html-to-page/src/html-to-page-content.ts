import { generateJSON, type JSONContent } from "@tiptap/core";

import { clipperExtensions } from "./clipper-extensions";
import { sanitizeHtml } from "./sanitize-html";
import { sanitizePageContent } from "./sanitize-page-content";
import type { PageDocument, PageDocumentNode } from "./types";

export function htmlToPageContent(html: string): PageDocument {
  const sanitized = sanitizeHtml(html);
  const source = sanitized || "<p></p>";

  try {
    const parsed = generateJSON(source, clipperExtensions) as PageDocument;
    const compacted = removeEmptyTopLevelParagraphs(parsed);
    if (!isEmptyDocument(compacted) && preservesExpectedMedia(source, compacted)) {
      return sanitizePageContent(compacted);
    }
  } catch {
    // Fall back to the walker below.
  }

  return sanitizePageContent(removeEmptyTopLevelParagraphs(fallbackHtmlToContent(source)));
}

function preservesExpectedMedia(source: string, content: PageDocument) {
  const types = new Set(content.content.map((node) => node.type));
  if (/<img\b/i.test(source) && !types.has("imageBlock")) return false;
  if (/<iframe\b/i.test(source) && !types.has("embedBlock")) return false;
  if (/<video\b/i.test(source) && !types.has("videoBlock")) return false;
  return true;
}

function isEmptyDocument(content: PageDocument) {
  return (
    content.type === "doc" &&
    content.content.length === 1 &&
    content.content[0]?.type === "paragraph" &&
    !content.content[0].content
  );
}

function removeEmptyTopLevelParagraphs(content: JSONContent): PageDocument {
  if (content.type !== "doc") {
    return emptyDocument();
  }

  const blocks =
    content.content?.filter((block) => !isEmptyParagraph(block as PageDocumentNode)) ?? [];

  return {
    type: "doc",
    content: (blocks.length > 0 ? blocks : [{ type: "paragraph" }]) as PageDocumentNode[],
  };
}

function isEmptyParagraph(content: PageDocumentNode) {
  return content.type === "paragraph" && !content.content;
}

function fallbackHtmlToContent(html: string): PageDocument {
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  const root = document.querySelector("main") ?? document.body;
  const content = Array.from(root.childNodes).flatMap((node) => blockNodeToJson(node));

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function blockNodeToJson(node: Node): PageDocumentNode[] {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent?.trim();
    return text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [];
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  return simpleBlockElementToJson(element, tagName) ?? nestedBlockElementToJson(element, tagName);
}

function simpleBlockElementToJson(element: Element, tagName: string): PageDocumentNode[] | null {
  if (/^h[1-6]$/.test(tagName)) {
    return [
      {
        type: "heading",
        attrs: { level: Number(tagName.slice(1)) },
        ...withInlineContent(element),
      },
    ];
  }

  if (tagName === "p") {
    return [{ type: "paragraph", ...withInlineContent(element) }];
  }

  if (tagName === "blockquote") {
    return [
      {
        type: "blockquote",
        content: childBlocks(element, [{ type: "paragraph", ...withInlineContent(element) }]),
      },
    ];
  }

  if (tagName === "pre") {
    return [
      {
        type: "codeBlock",
        attrs: { language: null },
        content: [{ type: "text", text: element.textContent ?? "" }],
      },
    ];
  }

  if (tagName === "hr") {
    return [{ type: "horizontalRule" }];
  }

  return null;
}

function mediaBlockElementToJson(element: Element, tagName: string): PageDocumentNode[] | null {
  if (tagName === "img") {
    const src = element.getAttribute("src");
    return src
      ? [
          {
            type: "imageBlock",
            attrs: {
              src,
              alt: element.getAttribute("alt"),
              title: element.getAttribute("title"),
            },
          },
        ]
      : [];
  }

  if (tagName === "iframe") {
    const src = element.getAttribute("src");
    return src
      ? [
          {
            type: "embedBlock",
            attrs: {
              src,
              title: element.getAttribute("title"),
              provider: src.includes("youtube") ? "youtube" : null,
            },
          },
        ]
      : [];
  }

  return null;
}

function nestedBlockElementToJson(element: Element, tagName: string): PageDocumentNode[] {
  const media = mediaBlockElementToJson(element, tagName);
  if (media) return media;
  if (tagName === "ul" || tagName === "ol") {
    return [
      {
        type: tagName === "ol" ? "orderedList" : "bulletList",
        content: Array.from(element.children).map((item) => ({
          type: "listItem",
          content: childBlocks(item, [{ type: "paragraph", ...withInlineContent(item) }]),
        })),
      },
    ];
  }

  if (tagName === "table") {
    return [
      {
        type: "table",
        content: Array.from(element.querySelectorAll("tr")).map((row) => ({
          type: "tableRow",
          content: Array.from(row.children).map((cell) => ({
            type: cell.tagName.toLowerCase() === "th" ? "tableHeader" : "tableCell",
            content: [{ type: "paragraph", ...withInlineContent(cell) }],
          })),
        })),
      },
    ];
  }

  return childBlocks(element);
}

function childBlocks(element: Element, fallback: PageDocumentNode[] = []) {
  const blocks = Array.from(element.childNodes).flatMap((child) => blockNodeToJson(child));
  return blocks.length > 0 ? blocks : fallback;
}

function withInlineContent(element: Element): Pick<PageDocumentNode, "content"> {
  const content = Array.from(element.childNodes).flatMap((child) => inlineNodeToJson(child));
  return content.length > 0 ? { content } : {};
}

function appendInlineMarks(
  element: Element,
  tagName: string,
  nextMarks: NonNullable<PageDocumentNode["marks"]>,
) {
  if (tagName === "strong" || tagName === "b") {
    nextMarks.push({ type: "bold" });
  } else if (tagName === "em" || tagName === "i") {
    nextMarks.push({ type: "italic" });
  } else if (tagName === "code") {
    nextMarks.push({ type: "code" });
  } else if (tagName === "a") {
    nextMarks.push({
      type: "link",
      attrs: { href: element.getAttribute("href") },
    });
  }
}

function inlineNodeToJson(node: Node, marks: PageDocumentNode["marks"] = []): PageDocumentNode[] {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  const nextMarks = [...marks];

  appendInlineMarks(element, tagName, nextMarks);
  if (tagName === "br") return [{ type: "hardBreak" }];

  return Array.from(element.childNodes).flatMap((child) => inlineNodeToJson(child, nextMarks));
}

function emptyDocument(): PageDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
