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

const MAX_PAGE_MARKDOWN_CHARS = 64_000;

type WorkspaceActionToolContext = {
  env: RuntimeEnv;
  threadId: string;
  userId: string;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
  workspaceId: string;
};

const workspacePageUpdateSchema = z.object({
  afterMarkdown: z.string().trim().max(MAX_PAGE_MARKDOWN_CHARS).optional(),
  editMode: z.enum(["patch", "full"]),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  pageId: z.string().trim().min(1),
  replaceText: z.string().max(24_000).optional(),
  searchText: z.string().trim().max(24_000).optional(),
  summary: z.string().trim().min(1).max(240),
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
        "Durably update an accessible Zilobase page that is not open for editor review. Always call readWorkspacePage first and copy its updatedAt into expectedUpdatedAt. Prefer patch mode with exact searchText for a section; use full only for an explicit whole-page rewrite. This tool rejects stale pages and returns an action receipt.",
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

        if (record.updatedAt.toISOString() !== input.expectedUpdatedAt) {
          throw new Error(
            "The page changed after it was read. Read it again before editing.",
          );
        }

        const beforeMarkdown = prosemirrorToMarkdown(record.content);
        const resolved = resolvePageEditMarkdown({
          afterMarkdown: input.afterMarkdown,
          beforeMarkdown,
          editMode: input.editMode,
          replaceText: input.replaceText,
          searchText: input.searchText,
        });

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
