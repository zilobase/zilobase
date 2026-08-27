import type {
  AgentCitation,
  AgentToolResult,
} from "@zilobase/features/ai-chat/agent-contract";
import { resolvePageEditMarkdown } from "@zilobase/features/ai-chat/apply-page-content-patch";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { and, eq, isNull } from "drizzle-orm";
import { tool, type ToolCallOptions, type ToolSet } from "ai";
import * as z from "zod";

import { canAccessPageInWorkspace } from "../access";
import { replacePageContent } from "../collaboration/service";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import { page } from "../db/schema";
import { runIdempotentAgentAction } from "./agent-action-receipts";
import { markdownToPageContent } from "./markdown-to-page-content";
import { isPageContentVersionCurrent } from "./page-content-version";

const MAX_PAGE_MARKDOWN_CHARS = 64_000;

type WorkspaceActionToolContext = {
  env: RuntimeEnv;
  threadId: string;
  userId: string;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
  workspaceId: string;
};

export const workspacePageUpdateSchema = z.object({
  afterMarkdown: z.string().trim().max(MAX_PAGE_MARKDOWN_CHARS).optional(),
  editMode: z.enum(["patch", "full"]),
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  pageId: z.string().trim().min(1),
  replaceText: z.string().max(24_000).optional(),
  searchText: z.string().trim().max(24_000).optional(),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .default("Updated page content."),
});

type WorkspacePageUpdateInput = z.infer<typeof workspacePageUpdateSchema>;

type WorkspacePageUpdateResult = AgentToolResult<{
  pageId: string;
  previousUpdatedAt: string;
}>;

export function buildWorkspaceActionTools(
  context: WorkspaceActionToolContext,
): ToolSet {
  return {
    updateWorkspacePage: tool({
      description:
        "Durably update an accessible Zilobase page that is not open for editor review. Always call readWorkspacePage first and copy its contentHash and updatedAt into expectedContentHash and expectedUpdatedAt. Call this tool at most once per page in a turn: combine every requested change to that page into one update. For patch mode, put the exact complete existing section in searchText and its complete replacement in replaceText. Use afterMarkdown only with full mode when the user explicitly requests a whole-page rewrite. This tool rejects real content conflicts while tolerating timestamp-only background saves and returns an action receipt.",
      inputSchema: workspacePageUpdateSchema,
      execute: (input, options) =>
        executeWorkspacePageUpdate(context, input, options),
    }),
  };
}

async function executeWorkspacePageUpdate(
  context: WorkspaceActionToolContext,
  input: WorkspacePageUpdateInput,
  options: ToolCallOptions,
) {
  return context.withDb(() =>
    runIdempotentAgentAction<WorkspacePageUpdateResult>({
      context: {
        threadId: context.threadId,
        userId: context.userId,
        workspaceId: context.workspaceId,
      },
      execute: async () => {
        if (
          !(await canAccessPageInWorkspace(
            input.pageId,
            context.workspaceId,
            context.userId,
            "edit",
          ))
        ) {
          throw new Error("Page not found or not editable.");
        }

        const [record] = await db
          .select({
            content: page.content,
            id: page.id,
            name: page.name,
            updatedAt: page.updatedAt,
          })
          .from(page)
          .where(
            and(
              eq(page.id, input.pageId),
              eq(page.workspaceId, context.workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1);

        if (!record) {
          throw new Error("Page not found or not editable.");
        }

        const beforeMarkdown = prosemirrorToMarkdown(record.content);
        if (!(await isPageContentVersionCurrent({
          currentMarkdown: beforeMarkdown,
          currentUpdatedAt: record.updatedAt.toISOString(),
          expectedContentHash: input.expectedContentHash,
          expectedUpdatedAt: input.expectedUpdatedAt,
        }))) {
          throw new Error(
            "The page changed after it was read. Read it again before editing.",
          );
        }

        const resolved = resolveWorkspacePageUpdateMarkdown(
          beforeMarkdown,
          input,
        );

        if (!resolved.success) {
          throw new Error(resolved.errorMessage);
        }

        await replacePageContent({
          content: markdownToPageContent(resolved.afterMarkdown),
          env: context.env,
          pageId: record.id,
          userId: context.userId,
        });

        const title = record.name.trim() || "Untitled";
        const citation: AgentCitation = {
          id: record.id,
          source: "page",
          title,
          url: `/p/${encodeURIComponent(record.id)}`,
        };

        return {
          citations: [citation],
          data: {
            pageId: record.id,
            previousUpdatedAt: record.updatedAt.toISOString(),
          },
          ok: true,
          status: "succeeded",
          summary: input.summary,
        };
      },
      toolCallId: options.toolCallId,
      toolInput: input,
      toolName: "updateWorkspacePage",
    }),
  );
}

export function resolveWorkspacePageUpdateMarkdown(
  beforeMarkdown: string,
  input: Pick<
    WorkspacePageUpdateInput,
    "afterMarkdown" | "editMode" | "replaceText" | "searchText"
  >,
) {
  const patchReplacement =
    input.replaceText ??
    (input.editMode === "patch" ? input.afterMarkdown : undefined);
  return resolvePageEditMarkdown({
    afterMarkdown: input.afterMarkdown,
    beforeMarkdown,
    editMode: input.editMode,
    // Earlier agent prompts used afterMarkdown as the patch replacement.
    // Continue to execute those reviewed inputs without silently deleting text.
    replaceText: patchReplacement,
    searchText:
      input.editMode === "patch"
        ? expandTaskSectionSearch(beforeMarkdown, input.searchText)
        : input.searchText,
  });
}

function expandTaskSectionSearch(
  beforeMarkdown: string,
  searchText: string | undefined,
) {
  const anchor = searchText?.trim();
  if (!anchor || anchor.includes("\n") || !/^[-*+]\s+/.test(anchor)) {
    return searchText;
  }

  const lines = beforeMarkdown.split("\n");
  const anchorIndex = lines.findIndex((line) => line.trim() === anchor);
  if (anchorIndex < 0) return searchText;

  let headingIndex = anchorIndex - 1;
  while (headingIndex >= 0 && !/^#{1,6}\s+/.test(lines[headingIndex]!.trim())) {
    headingIndex -= 1;
  }
  const heading = headingIndex >= 0
    ? lines[headingIndex]!.trim().replace(/^#{1,6}\s+/, "")
    : "";
  if (!/\b(?:checklist|tasks?|to[- ]?do)\b/i.test(heading)) {
    return searchText;
  }

  let sectionEnd = anchorIndex + 1;
  while (
    sectionEnd < lines.length &&
    !/^#{1,6}\s+/.test(lines[sectionEnd]!.trim())
  ) {
    sectionEnd += 1;
  }

  return lines.slice(headingIndex + 1, sectionEnd).join("\n").trim();
}
