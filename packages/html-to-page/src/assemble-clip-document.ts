import { isAllowedHttpUrl, isAllowedImageUrl } from "./safe-url";
import type { AssembleClipDocumentInput, PageDocument, PageDocumentNode } from "./types";

export function assembleClipDocument(input: AssembleClipDocumentInput): PageDocument {
  const content: PageDocumentNode[] = [];
  const bookmark = bookmarkBlock(input);
  if (bookmark) content.push(bookmark);

  const note = input.note?.trim();
  if (note) {
    content.push({
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: note }],
        },
      ],
    });
  }

  const body = input.content?.content?.filter((node) => node.type !== "bookmarkBlock") ?? [];
  content.push(...body);

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function bookmarkBlock(input: AssembleClipDocumentInput): PageDocumentNode | null {
  if (!isAllowedHttpUrl(input.sourceUrl)) return null;
  return {
    type: "bookmarkBlock",
    attrs: {
      href: input.sourceUrl,
      title: input.title,
      description: input.description ?? null,
      favicon: optionalHttp(input.favicon),
      image: optionalImage(input.image),
    },
  };
}

function optionalHttp(value: string | null | undefined) {
  return value && isAllowedHttpUrl(value) ? value : null;
}

function optionalImage(value: string | null | undefined) {
  return value && isAllowedImageUrl(value) ? value : null;
}
