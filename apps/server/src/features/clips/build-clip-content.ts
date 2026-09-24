import {
  assembleClipDocument,
  ensureDomParser,
  htmlToPageContent,
  sanitizePageContent,
  type PageDocument,
} from "@zilobase/html-to-page";
import type { CreateClipRequest } from "@zilobase/features/clips";

export function buildClipContent(input: CreateClipRequest): PageDocument {
  ensureDomParser();

  const converted = input.html
    ? htmlToPageContent(input.html)
    : isPageDocument(input.content)
      ? sanitizePageContent(input.content)
      : { type: "doc" as const, content: [{ type: "paragraph" }] };

  return assembleClipDocument({
    sourceUrl: input.sourceUrl,
    title: input.title,
    description: input.metadata?.description ?? null,
    favicon: input.metadata?.favicon ?? null,
    image: input.metadata?.image ?? null,
    note: input.note ?? null,
    content: converted,
  });
}

function isPageDocument(value: unknown): value is PageDocument {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as PageDocument).type === "doc" &&
    Array.isArray((value as PageDocument).content),
  );
}
