import { tool, type ToolSet } from "ai";
import * as z from "zod";

const MAX_PAGE_MARKDOWN_CHARS = 64_000;
const MAX_PATCH_TEXT_CHARS = 24_000;

const pageEditInputSchema = z.object({
  editMode: z.enum(["patch", "full"]),
  pageId: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(240),
  searchText: z.string().trim().max(MAX_PATCH_TEXT_CHARS).optional(),
  replaceText: z.string().max(MAX_PATCH_TEXT_CHARS).optional(),
  afterMarkdown: z.string().trim().max(MAX_PAGE_MARKDOWN_CHARS).optional(),
});

type PageEditInput = z.infer<typeof pageEditInputSchema>;

export function buildPageEditTools(allowedPageIds: string[]): ToolSet {
  const allowedIds = new Set(allowedPageIds);

  return {
    proposePageContentUpdate: tool({
      description:
        "Update a Zilobase page in page context. Prefer editMode patch when the user asks to change, shorten, rewrite, or fix a specific section: copy the exact existing section into searchText and provide only that section's replacement in replaceText. Use editMode full only when the user explicitly wants the entire page rewritten. Never use full mode to change just the intro or a single paragraph.",
      inputSchema: pageEditInputSchema,
      execute: async (input) => {
        const parsed = validatePageEditInput(input);

        console.warn(
          `proposePageContentUpdate: mode=${parsed.editMode} pageId=${parsed.pageId} allowed=${[...allowedIds].join(",") || "(none)"} summary=${parsed.summary}`,
        );

        if (!allowedIds.has(parsed.pageId)) {
          console.warn(
            `proposePageContentUpdate rejected: pageId ${parsed.pageId} not in allowed set`,
          );
          throw new Error(
            "That page is not in the current page context for this chat.",
          );
        }

        const result =
          parsed.editMode === "patch"
            ? {
                editId: crypto.randomUUID(),
                pageId: parsed.pageId,
                summary: parsed.summary,
                editMode: parsed.editMode,
                searchText: parsed.searchText,
                replaceText: parsed.replaceText ?? "",
              }
            : {
                editId: crypto.randomUUID(),
                pageId: parsed.pageId,
                summary: parsed.summary,
                editMode: parsed.editMode,
                afterMarkdown: parsed.afterMarkdown,
              };

        console.warn(
          `proposePageContentUpdate accepted: editId=${result.editId} mode=${parsed.editMode} pageId=${parsed.pageId}`,
        );

        return result;
      },
    }),
  };
}

function validatePageEditInput(input: PageEditInput) {
  if (input.editMode === "patch") {
    const searchText = input.searchText?.trim();

    if (!searchText) {
      throw new Error(
        "Patch edits require searchText copied from the current page content.",
      );
    }

    return {
      editMode: input.editMode,
      pageId: input.pageId,
      summary: input.summary,
      searchText,
      replaceText: input.replaceText ?? "",
    };
  }

  const afterMarkdown = input.afterMarkdown?.trim();

  if (!afterMarkdown) {
    throw new Error("Full-page edits require afterMarkdown.");
  }

  return {
    editMode: input.editMode,
    pageId: input.pageId,
    summary: input.summary,
    afterMarkdown,
  };
}