import type { Page, PageMetadata } from "@zilobase/features/pages";
export function getDuplicatePageName(name: string) {
  const trimmedName = name.trim() || "Untitled";

  return `${trimmedName} copy`;
}

export function clonePageContent(content: unknown) {
  const cloned =
    typeof structuredClone === "function"
      ? structuredClone(content)
      : (JSON.parse(JSON.stringify(content)) as unknown);

  return stripCommentMarks(cloned);
}

function stripCommentMarks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCommentMarks);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      key === "marks" && Array.isArray(child)
        ? child
            .filter(
              (mark) =>
                !mark ||
                typeof mark !== "object" ||
                (mark as { type?: unknown }).type !== "comment",
            )
            .map(stripCommentMarks)
        : stripCommentMarks(child),
    ]),
  );
}

export function buildPageDuplicateInput(page: Page, parentItemId: string | undefined) {
  const metadata = (page.metadata ?? {}) as PageMetadata;
  return {
    content: clonePageContent(page.content ?? null),
    emoji: metadata.emoji ?? undefined,
    metadata,
    name: getDuplicatePageName(page.name),
    workspaceId: page.workspaceId,
    parentItemId,
  };
}
