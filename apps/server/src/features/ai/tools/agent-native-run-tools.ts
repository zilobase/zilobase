import type {
  AgentCitation,
  AgentToolResult,
} from "@zilobase/features/ai-chat/agent-contract";
import { resolvePageEditMarkdown } from "@zilobase/features/ai-chat/apply-page-content-patch";
import { hasPageBodyContent } from "@zilobase/features/pages/content-state";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { tool, type ToolCallOptions, type ToolSet } from "ai";
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import * as z from "zod";

import { db } from "../../../infrastructure/database";
import {
  aiAgentToolExecution,
  databaseProperty,
  databaseRow,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
  searchDocument,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  canAgentAccessDatabase,
  canAgentAccessPage,
  canAgentSnapshotAccessDatabase,
  canAgentSnapshotAccessPage,
  type AgentPermissionSnapshotGrant,
} from "../../access";
import {
  encodePageContentAsYjs,
  replacePageContent,
} from "../../collaboration/service";
import { getDatabaseRecord } from "../../databases/access";
import { lockDatabaseAutomationFactRows } from "../../databases/automations/triggers/event-capture";
import { getDatabaseExportPayload } from "../../databases/core";
import { commitDataSourceMutation } from "../../databases/core/commit";
import { validateCellValue } from "../../databases/properties/config";
import { getDatabaseRecordEntity } from "../../databases/commands/record-entity";
import { upsertPageItemPlacement } from "../../pages/placements";
import {
  enqueueNavigationInvalidation,
  publishCommittedNavigationInvalidation,
} from "../../workspaces/navigation-realtime/outbox";
import { markdownToPageContent } from "../conversion/markdown-to-page-content";
import {
  hashPageContentMarkdown,
  isPageContentVersionCurrent,
} from "../conversion/page-content-version";
import { buildDatabaseTable } from "./ask-ai-workspace-tools";
import { appendRunEvent } from "../execution/agent-run-records";

const MAX_PAGE_MARKDOWN_CHARS = 48_000;
const MAX_PAGE_WRITE_MARKDOWN_CHARS = 64_000;

type AgentNativeToolContext = {
  agentName: string;
  env: RuntimeEnv;
  profileId: string;
  permissionSnapshot: AgentPermissionSnapshotGrant[];
  runId: string;
  workspaceId: string;
};

export function buildAgentNativeRunTools(
  context: AgentNativeToolContext,
): ToolSet {
  return {
    searchGrantedResources: auditedReadTool(
      context,
      "searchGrantedResources",
      "Search only pages and databases explicitly granted to this Custom Agent, including child pages that inherit a granted page's access.",
      z.object({
        limit: z.number().int().min(1).max(20).default(10),
        query: z.string().trim().max(500).default(""),
        types: z
          .array(z.enum(["page", "database"]))
          .max(2)
          .optional(),
      }),
      async (input) => {
        const requestedTypes = input.types ?? ["page", "database"];
        const pattern = `%${escapeLike(input.query.trim())}%`;
        const candidates = await db
          .select({
            excerpt: searchDocument.contentText,
            id: searchDocument.sourceId,
            path: searchDocument.path,
            title: searchDocument.title,
            type: searchDocument.sourceType,
            updatedAt: searchDocument.sourceUpdatedAt,
          })
          .from(searchDocument)
          .where(
            and(
              eq(searchDocument.workspaceId, context.workspaceId),
              or(
                ...requestedTypes.map((type) =>
                  eq(searchDocument.sourceType, type),
                ),
              ),
              input.query.trim()
                ? or(
                    ilike(searchDocument.title, pattern),
                    ilike(searchDocument.contentText, pattern),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(searchDocument.title))
          .limit(100);

        const permitted = (
          await Promise.all(
            candidates.map(async (candidate) => {
              const allowed =
                candidate.type === "database"
                  ? await canUseDatabase(context, candidate.id, "view")
                  : candidate.type === "page"
                    ? await canUsePage(context, candidate.id, "view")
                    : false;
              return allowed ? candidate : null;
            }),
          )
        )
          .filter(
            (candidate): candidate is NonNullable<typeof candidate> =>
              candidate !== null,
          )
          .slice(0, input.limit);

        const results = permitted.map((candidate) => ({
          excerpt:
            candidate.type === "page" ? candidate.excerpt.slice(0, 280) : null,
          id: candidate.id,
          path: candidate.path,
          title: candidate.title,
          type: candidate.type,
          updatedAt: candidate.updatedAt.toISOString(),
        }));
        return succeeded(
          `Found ${results.length} resource${results.length === 1 ? "" : "s"} granted to this agent.`,
          { results },
          results.map((result) =>
            citation(
              result.type as "page" | "database",
              result.id,
              result.title,
              result.excerpt,
            ),
          ),
        );
      },
    ),
    readGrantedPage: auditedReadTool(
      context,
      "readGrantedPage",
      "Read a Zilobase page only when the Custom Agent principal has explicit or inherited view access.",
      z.object({ pageId: z.string().trim().min(1) }),
      async ({ pageId }) => {
        if (!(await canUsePage(context, pageId, "view"))) {
          throw new Error("Page not found or not granted to this agent.");
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
              eq(page.id, pageId),
              eq(page.workspaceId, context.workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1);
        if (!record)
          throw new Error("Page not found or not granted to this agent.");
        const fullMarkdown = prosemirrorToMarkdown(record.content);
        const markdown =
          fullMarkdown.length > MAX_PAGE_MARKDOWN_CHARS
            ? `${fullMarkdown.slice(0, MAX_PAGE_MARKDOWN_CHARS)}\n\n[Content truncated]`
            : fullMarkdown;
        const title = record.name.trim() || "Untitled";
        return succeeded(
          `Read page \"${title}\".`,
          {
            contentHash: await hashPageContentMarkdown(fullMarkdown),
            id: record.id,
            markdown,
            title,
            truncated: markdown !== fullMarkdown,
            updatedAt: record.updatedAt.toISOString(),
          },
          [citation("page", record.id, title, markdown.slice(0, 280))],
        );
      },
    ),
    queryGrantedDatabase: auditedReadTool(
      context,
      "queryGrantedDatabase",
      "Query rows from a Zilobase database only when the Custom Agent principal has view access. Use an exact database and data source ID returned by search.",
      z.object({
        databaseId: z.string().trim().min(1),
        dataSourceId: z.string().trim().min(1),
        limit: z.number().int().min(1).max(50).default(25),
        query: z.string().trim().max(500).optional(),
      }),
      async (input) => {
        if (!(await canUseDatabase(context, input.databaseId, "view"))) {
          throw new Error("Database not found or not granted to this agent.");
        }
        const record = await getDatabaseRecord(input.databaseId);
        if (!record || record.workspaceId !== context.workspaceId)
          throw new Error("Database not found or not granted to this agent.");
        const payload = await getDatabaseExportPayload(record.id, undefined, record, {
          dataSourceId: input.dataSourceId,
        });
        if (
          !payload?.activeDataSource ||
          payload.activeDataSource.id !== input.dataSourceId
        ) {
          throw new Error(
            "The data source is not linked to the granted database.",
          );
        }
        const table = buildDatabaseTable(payload, {
          limit: input.limit,
          query: input.query,
        });
        const title = record.name.trim() || "Database";
        return succeeded(
          `Queried ${table.rows.length} row${table.rows.length === 1 ? "" : "s"} in \"${title}\".`,
          {
            dataSourceId: input.dataSourceId,
            databaseId: record.id,
            table,
            totalRows: payload.rows.length,
          },
          [
            citation("database", record.id, title, null),
            ...table.rows.map((row) =>
              citation(
                "page",
                row.pageId,
                row.cells.name || "Untitled row",
                null,
              ),
            ),
          ],
        );
      },
    ),
    updateGrantedPage: auditedWriteTool(
      context,
      "updateGrantedPage",
      "Update a Zilobase page only when this Custom Agent has edit access. Always call readGrantedPage first and copy its contentHash and updatedAt. Prefer patch mode with exact searchText and replaceText. A conflict fails safely instead of overwriting newer content.",
      z.object({
        afterMarkdown: z.string().max(MAX_PAGE_WRITE_MARKDOWN_CHARS).optional(),
        editMode: z.enum(["patch", "full"]),
        expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
        expectedUpdatedAt: z.string().datetime({ offset: true }),
        pageId: z.string().trim().min(1),
        replaceText: z.string().max(24_000).optional(),
        searchText: z.string().max(24_000).optional(),
        summary: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .default("Updated page content."),
      }),
      async (input) => {
        if (!(await canUsePage(context, input.pageId, "edit"))) {
          throw new Error("Page not found or not editable by this agent.");
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
        if (!record)
          throw new Error("Page not found or not editable by this agent.");
        const beforeMarkdown = prosemirrorToMarkdown(record.content);
        if (
          !(await isPageContentVersionCurrent({
            currentMarkdown: beforeMarkdown,
            currentUpdatedAt: record.updatedAt.toISOString(),
            expectedContentHash: input.expectedContentHash,
            expectedUpdatedAt: input.expectedUpdatedAt,
          }))
        ) {
          throw new Error(
            "The page changed after it was read. Read it again before editing.",
          );
        }
        const resolved = resolvePageEditMarkdown({
          afterMarkdown: input.afterMarkdown,
          beforeMarkdown,
          editMode: input.editMode,
          replaceText: input.replaceText,
          searchText: input.searchText,
        });
        if (!resolved.success) throw new Error(resolved.errorMessage);
        try {
          await replacePageContent({
            content: markdownToPageContent(resolved.afterMarkdown),
            env: context.env,
            pageId: record.id,
            userId: context.profileId,
          });
        } catch (error) {
          throw new AgentNativeWriteOutcomeUnknownError(
            error instanceof Error
              ? error.message
              : "The page update did not return a receipt.",
          );
        }
        const title = record.name.trim() || "Untitled";
        return succeeded(
          input.summary,
          {
            pageId: record.id,
            previousUpdatedAt: record.updatedAt.toISOString(),
          },
          [citation("page", record.id, title, null)],
        );
      },
    ),
    updateGrantedDatabaseCell: auditedWriteTool(
      context,
      "updateGrantedDatabaseCell",
      "Update one property value in a database row only when this Custom Agent has edit access to the database. Use exact database, data source, row, and property IDs returned by queryGrantedDatabase. Title properties are not supported by this tool.",
      z.object({
        databaseId: z.string().trim().min(1),
        dataSourceId: z.string().trim().min(1),
        pagePropertyId: z.string().trim().min(1),
        rowId: z.string().trim().min(1),
        value: z.unknown(),
      }),
      async (input) => {
        if (!(await canUseDatabase(context, input.databaseId, "edit"))) {
          throw new Error("Database not found or not editable by this agent.");
        }
        const record = await getDatabaseRecord(input.databaseId);
        if (!record || record.workspaceId !== context.workspaceId) {
          throw new Error("Database not found or not editable by this agent.");
        }
        const [row] = await db
          .select({ id: databaseRow.id, pageId: databaseRow.pageId })
          .from(databaseRow)
          .where(
            and(
              eq(databaseRow.id, input.rowId),
              eq(databaseRow.dataSourceId, input.dataSourceId),
              isNull(databaseRow.deletedAt),
            ),
          )
          .limit(1);
        const [property] = await db
          .select({ config: pageProperty.config, type: pageProperty.type })
          .from(databaseProperty)
          .innerJoin(
            pageProperty,
            eq(pageProperty.id, databaseProperty.propertyId),
          )
          .where(
            and(
              eq(databaseProperty.dataSourceId, input.dataSourceId),
              eq(databaseProperty.propertyId, input.pagePropertyId),
              eq(pageProperty.workspaceId, context.workspaceId),
              isNull(pageProperty.deletedAt),
            ),
          )
          .limit(1);
        if (!row || !property)
          throw new Error("Row or property not found in the granted database.");
        if (["title", "name"].includes(property.type)) {
          throw new Error(
            "Use page editing to change a row title; title properties are not supported here.",
          );
        }
        validateCellValue(property.type, property.config, input.value);
        const now = new Date();
        try {
          await commitDataSourceMutation(
            {
              actorId: `agent:${context.profileId}`,
              areas: ["records"],
              dataSourceId: input.dataSourceId,
              env: context.env,
            },
            async (tx) => {
              await lockDatabaseAutomationFactRows(tx, [
                { dataSourceId: input.dataSourceId, rowId: row.id },
              ]);
              const [previous] = await tx
                .select({ value: pagePropertyValue.value })
                .from(pagePropertyValue)
                .where(
                  and(
                    eq(pagePropertyValue.pageId, row.pageId),
                    eq(pagePropertyValue.propertyId, input.pagePropertyId),
                  ),
                )
                .limit(1);
              await tx
                .insert(pagePropertyValue)
                .values({
                  id: crypto.randomUUID(),
                  pageId: row.pageId,
                  propertyId: input.pagePropertyId,
                  value: input.value,
                })
                .onConflictDoUpdate({
                  target: [
                    pagePropertyValue.pageId,
                    pagePropertyValue.propertyId,
                  ],
                  set: { updatedAt: now, value: input.value },
                });
              await tx
                .update(databaseRow)
                .set({ updatedAt: now })
                .where(eq(databaseRow.id, row.id));
              await tx
                .update(page)
                .set({ updatedAt: now })
                .where(eq(page.id, row.pageId));
              return {
                automationFacts: [
                  {
                    actorId: `agent:${context.profileId}:run:${context.runId}`,
                    changedValues: [
                      {
                        after: input.value,
                        before: previous?.value ?? null,
                        propertyId: input.pagePropertyId,
                      },
                    ],
                    dataSourceId: input.dataSourceId,
                    origin: "ai" as const,
                    pageId: row.pageId,
                    rowAdded: false,
                    rowId: row.id,
                  },
                ],
                changes: {
                  records: [await getDatabaseRecordEntity(tx, input.dataSourceId, row.id)],
                },
              };
            },
          );
        } catch (error) {
          throw new AgentNativeWriteOutcomeUnknownError(
            error instanceof Error
              ? error.message
              : "The database update did not return a receipt.",
          );
        }
        return succeeded(
          "Updated the granted database row.",
          {
            databaseId: record.id,
            pageId: row.pageId,
            rowId: row.id,
          },
          [citation("database", record.id, record.name, null)],
        );
      },
    ),
    commentOnGrantedPage: auditedWriteTool(
      context,
      "commentOnGrantedPage",
      "Add a page-level comment only when this Custom Agent has comment access to the page. This creates a visible comment authored by the agent principal.",
      z.object({
        body: z.string().trim().min(1).max(10_000),
        pageId: z.string().trim().min(1),
      }),
      async (input) => {
        if (!(await canUsePage(context, input.pageId, "comment"))) {
          throw new Error("Page not found or not commentable by this agent.");
        }
        const [record] = await db
          .select({ id: page.id, name: page.name })
          .from(page)
          .where(
            and(
              eq(page.id, input.pageId),
              eq(page.workspaceId, context.workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1);
        if (!record)
          throw new Error("Page not found or not commentable by this agent.");
        let receipt: { messageId: string; threadId: string };
        try {
          const { appendPageComment } = await import(
            "../../collaboration/service"
          );
          receipt = await appendPageComment({
            author: {
              email: null,
              id: context.profileId,
              image: null,
              name: context.agentName,
            },
            body: input.body,
            env: context.env,
            pageId: record.id,
          });
        } catch (error) {
          throw new AgentNativeWriteOutcomeUnknownError(
            error instanceof Error
              ? error.message
              : "The comment did not return a receipt.",
          );
        }
        return succeeded(
          "Added a comment to the granted page.",
          {
            messageId: receipt.messageId,
            pageId: record.id,
            threadId: receipt.threadId,
          },
          [citation("page", record.id, record.name, input.body.slice(0, 280))],
        );
      },
    ),
    createChildPageInGrantedPage: auditedWriteTool(
      context,
      "createChildPageInGrantedPage",
      "Create a child page only beneath a page this Custom Agent can edit. This does not grant standalone workspace creation and the new child inherits the parent page's agent access.",
      z.object({
        markdown: z.string().max(MAX_PAGE_WRITE_MARKDOWN_CHARS).default(""),
        name: z.string().trim().min(1).max(240),
        parentPageId: z.string().trim().min(1),
      }),
      async (input) => {
        if (!(await canUsePage(context, input.parentPageId, "edit"))) {
          throw new Error(
            "Parent page not found or not editable by this agent.",
          );
        }
        const [parent] = await db
          .select({ id: page.id })
          .from(page)
          .where(
            and(
              eq(page.id, input.parentPageId),
              eq(page.workspaceId, context.workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1);
        if (!parent)
          throw new Error(
            "Parent page not found or not editable by this agent.",
          );
        const pageId = crypto.randomUUID();
        const content = markdownToPageContent(input.markdown);
        try {
          const navigationEvent = await db.transaction(async (tx) => {
            await tx.insert(page).values({
              content,
              createdById: null,
              hasContent: hasPageBodyContent(content),
              id: pageId,
              name: input.name,
              type: "pageblock",
              url: "#",
              workspaceId: context.workspaceId,
            });
            await tx.insert(pageCollaborationDocument).values({
              pageId,
              state: Buffer.from(encodePageContentAsYjs(content)),
              updatedAt: new Date(),
            });
            await upsertPageItemPlacement(tx, {
              id: crypto.randomUUID(),
              itemId: pageId,
              itemKind: "page",
              parentId: parent.id,
              parentKind: "page",
              placementKind: "primary",
              workspaceId: context.workspaceId,
            });
            return enqueueNavigationInvalidation(tx, context.workspaceId);
          });
          await publishCommittedNavigationInvalidation(
            navigationEvent,
            context.env,
          );
        } catch (error) {
          throw new AgentNativeWriteOutcomeUnknownError(
            error instanceof Error
              ? error.message
              : "The child page creation did not return a receipt.",
          );
        }
        return succeeded(
          `Created child page "${input.name}".`,
          {
            pageId,
            parentPageId: parent.id,
          },
          [citation("page", pageId, input.name, input.markdown.slice(0, 280))],
        );
      },
    ),
  };
}

async function canUsePage(
  context: AgentNativeToolContext,
  pageId: string,
  required: "view" | "comment" | "edit" | "full",
) {
  return (
    (await canAgentSnapshotAccessPage(
      pageId,
      context.workspaceId,
      context.permissionSnapshot,
      required,
    )) &&
    (await canAgentAccessPage(
      pageId,
      context.workspaceId,
      context.profileId,
      required,
    ))
  );
}

async function canUseDatabase(
  context: AgentNativeToolContext,
  databaseId: string,
  required: "view" | "comment" | "edit" | "full",
) {
  return (
    (await canAgentSnapshotAccessDatabase(
      databaseId,
      context.workspaceId,
      context.permissionSnapshot,
      required,
    )) &&
    (await canAgentAccessDatabase(
      databaseId,
      context.workspaceId,
      context.profileId,
      required,
    ))
  );
}

function auditedReadTool<TInput extends z.ZodTypeAny>(
  context: AgentNativeToolContext,
  name: string,
  description: string,
  inputSchema: TInput,
  execute: (input: z.infer<TInput>) => Promise<AgentToolResult<unknown>>,
) {
  return auditedTool(context, name, description, inputSchema, "read", execute);
}

function auditedWriteTool<TInput extends z.ZodTypeAny>(
  context: AgentNativeToolContext,
  name: string,
  description: string,
  inputSchema: TInput,
  execute: (input: z.infer<TInput>) => Promise<AgentToolResult<unknown>>,
) {
  return auditedTool(context, name, description, inputSchema, "write", execute);
}

function auditedTool<TInput extends z.ZodTypeAny>(
  context: AgentNativeToolContext,
  name: string,
  description: string,
  inputSchema: TInput,
  effect: "read" | "write",
  execute: (input: z.infer<TInput>) => Promise<AgentToolResult<unknown>>,
) {
  return tool({
    description,
    inputSchema,
    execute: async (input, options: ToolCallOptions) => {
      const id = crypto.randomUUID();
      const startedAt = new Date();
      const [reserved] = await db
        .insert(aiAgentToolExecution)
        .values({
          actualEffect: effect,
          agentRunId: context.runId,
          createdAt: startedAt,
          effect,
          id,
          status: "running",
          toolCallId: options.toolCallId,
          toolName: name,
          updatedAt: startedAt,
        })
        .onConflictDoNothing()
        .returning({ id: aiAgentToolExecution.id });
      if (!reserved)
        throw new Error(
          "Agent tool call already has a durable execution receipt.",
        );
      await appendRunEvent(context.runId, "tool_started", "shared", {
        tool: name,
      });
      try {
        const result = await execute(input as z.infer<TInput>);
        const completedAt = new Date();
        await db
          .update(aiAgentToolExecution)
          .set({
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            status: "succeeded",
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(aiAgentToolExecution.agentRunId, context.runId),
              eq(aiAgentToolExecution.toolCallId, options.toolCallId),
            ),
          );
        await appendRunEvent(context.runId, "tool_completed", "shared", {
          outcome: "succeeded",
          tool: name,
        });
        return result;
      } catch (error) {
        const completedAt = new Date();
        await db
          .update(aiAgentToolExecution)
          .set({
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            errorCode:
              effect === "write"
                ? "AGENT_NATIVE_WRITE_FAILED"
                : "AGENT_RESOURCE_ACCESS_FAILED",
            outcomeUnknown:
              error instanceof AgentNativeWriteOutcomeUnknownError,
            status: "failed",
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(aiAgentToolExecution.agentRunId, context.runId),
              eq(aiAgentToolExecution.toolCallId, options.toolCallId),
            ),
          );
        await appendRunEvent(context.runId, "tool_completed", "shared", {
          outcome: "failed",
          tool: name,
        });
        throw error;
      }
    },
  });
}

class AgentNativeWriteOutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentNativeWriteOutcomeUnknownError";
  }
}

function succeeded<T>(
  summary: string,
  data: T,
  citations: AgentCitation[],
): AgentToolResult<T> {
  return { citations, data, ok: true, status: "succeeded", summary };
}

function citation(
  type: "page" | "database",
  id: string,
  title: string,
  excerpt: string | null,
): AgentCitation {
  return {
    ...(excerpt ? { excerpt } : {}),
    id,
    source: type,
    title: title.trim() || (type === "page" ? "Untitled" : "Database"),
    url:
      type === "page"
        ? `/p/${encodeURIComponent(id)}`
        : `/d/${encodeURIComponent(id)}`,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
