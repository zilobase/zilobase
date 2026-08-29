import type {
  AgentActionReceipt,
  AgentCitation,
} from "@zilobase/features/ai-chat/agent-contract";
import { tool, type ToolCallOptions, type ToolSet } from "ai";
import * as z from "zod";

import type { RuntimeEnv } from "../shared/config/config";
import {
  createDatabasePropertyService,
  createDatabaseRowService,
  createDatabaseService,
  createDatabaseViewService,
  setDatabaseCellValueService,
  updateDatabasePropertyService,
  updateDatabaseViewService,
} from "../features/databases/core";
import { updateDataSourceService } from "../features/databases/data-sources";
import {
  defaultStatusOptions,
  selectOptionColors,
} from "../features/databases/properties";
import { ServiceMutationError } from "../shared/errors/service-mutation-error";
import { runIdempotentAgentAction } from "./agent-action-receipts";
import { markdownToPageContent } from "./markdown-to-page-content";
import {
  createPageService,
  embedDatabaseInPageService,
  linkDatabaseInPageService,
} from "../features/pages/mutations";

export const AGENT_CREATABLE_DATABASE_PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "files",
  "checkbox",
  "url",
  "phone",
  "email",
  "relation",
  "id",
  "place",
  "verification",
  "created_time",
  "edited_time",
] as const;

export const AGENT_DATABASE_VIEW_TYPES = [
  "table",
  "kanban",
  "timeline",
  "chart",
  "gallery",
  "list",
  "form",
] as const;

const agentCreatableDatabasePropertyTypeSchema = z.enum(
  AGENT_CREATABLE_DATABASE_PROPERTY_TYPES,
);
const agentDatabaseViewTypeSchema = z.enum(AGENT_DATABASE_VIEW_TYPES);

const selectOptionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  color: z.string().trim().optional(),
  group: z.string().trim().optional(),
});

const propertyConfigSchema = z
  .object({
    defaultOptionId: z.string().trim().optional(),
    options: z.array(selectOptionSchema).optional(),
    groupPropertyId: z.string().trim().optional(),
    hiddenPropertyIds: z.array(z.string()).optional(),
    filters: z.array(z.record(z.string(), z.unknown())).optional(),
    sorts: z.array(z.record(z.string(), z.unknown())).optional(),
    conditionalColors: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough()
  .optional();

type ToolContext = {
  allowedPageIds: Set<string>;
  env: RuntimeEnv;
  threadId: string;
  workspaceId: string;
  primaryPageId: string | null;
  userId: string;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
};

type ToolResult = {
  citations?: AgentCitation[];
  hints?: string[];
  ids: Record<string, string>;
  ok: true;
  receipt?: AgentActionReceipt;
  status: "succeeded";
  summary: string;
};

function resolvePageId(
  context: ToolContext,
  inputPageId: string | undefined,
  fieldName: string,
) {
  const pageId = inputPageId?.trim() || context.primaryPageId;

  if (!pageId) {
    throw new Error(`${fieldName} is required when no primary page is in context.`);
  }

  return pageId;
}

function toToolResult(
  summary: string,
  ids: Record<string, string | undefined>,
  hints: string[] = [],
  citations: AgentCitation[] = [],
): ToolResult {
  const filteredIds = Object.fromEntries(
    Object.entries(ids).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );

  return {
    ok: true,
    status: "succeeded",
    summary,
    ids: filteredIds,
    hints,
    ...(citations.length > 0 ? { citations } : {}),
  };
}

function mapServiceError(error: unknown): never {
  if (error instanceof ServiceMutationError) {
    throw new Error(error.message);
  }

  throw error;
}

function withDbExecute<TInput, TOutput extends ToolResult>(
  context: ToolContext,
  toolName: string,
  handler: (input: TInput) => Promise<TOutput>,
) {
  return async (input: TInput, options: ToolCallOptions) => {
    try {
      return await context.withDb(() =>
        runIdempotentAgentAction({
          context: {
            threadId: context.threadId,
            userId: context.userId,
            workspaceId: context.workspaceId,
          },
          execute: () => handler(input),
          toolCallId: options.toolCallId,
          toolInput: input,
          toolName,
        }),
      );
    } catch (error) {
      return mapServiceError(error);
    }
  };
}

export function buildDatabaseConfigTools(context: ToolContext): ToolSet {
  return {
    createPage: tool({
      description:
        "Create a new Zilobase page, optionally with an emoji and populated Markdown body. Use before createDatabase when the user wants a fresh host page. The returned pageId is authorized for later tools in this turn.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(240),
        parentPageId: z.string().trim().optional(),
        markdown: z.string().trim().max(64_000).optional(),
        emoji: z.string().trim().max(32).optional(),
      }),
      execute: withDbExecute(context, "createPage", async (input) => {
        const result = await createPageService({
          content: input.markdown
            ? markdownToPageContent(input.markdown)
            : undefined,
          metadata: input.emoji ? { emoji: input.emoji } : undefined,
          name: input.name,
          parentPageId: input.parentPageId,
          workspaceId: context.workspaceId,
          userId: context.userId,
        });
        context.allowedPageIds.add(result.pageId);

        return toToolResult(`Created page "${input.name}".`, {
          pageId: result.pageId,
        }, [], [{
          id: result.pageId,
          source: "page",
          title: input.name,
          url: `/p/${encodeURIComponent(result.pageId)}`,
        }]);
      }),
    }),

    createDatabase: tool({
      description:
        "Create a database on a host page and immediately embed its live database block inline in that page. A page-owned database is never created as navigation-only state.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(240).optional(),
        pageId: z.string().trim().optional(),
      }),
      execute: withDbExecute(context, "createDatabase", async (input) => {
        const pageId = resolvePageId(context, input.pageId, "pageId");

        const result = await createDatabaseService({
          name: input.name,
          workspaceId: context.workspaceId,
          pageId,
          userId: context.userId,
        });
        const embed = await embedDatabaseInPageService({
          databaseId: result.databaseId,
          env: context.env,
          userId: context.userId,
          pageId,
        });

        return toToolResult(`Created and embedded database "${result.name}".`, {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          defaultViewId: result.defaultViewId,
          pageId,
        }, [
          "Default Table view already exists as defaultViewId.",
          embed.alreadyEmbedded
            ? "The live database block was already present in the host page."
            : "The live database block is inline in the host page.",
        ], [{
          id: result.databaseId,
          source: "database",
          title: result.name,
          url: `/d/${encodeURIComponent(result.databaseId)}`,
        }]);
      }),
    }),

    embedDatabaseInPage: tool({
      description:
        "Embed an existing database inline in page content using [Database (<uuid>)]. createDatabase already embeds new page-owned databases, so use this only to repair or place an existing database.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        pageId: z.string().trim().optional(),
        afterHeading: z
          .string()
          .trim()
          .optional()
          .describe("Section heading text to insert the database block after."),
      }),
      execute: withDbExecute(context, "embedDatabaseInPage", async (input) => {
        const pageId = resolvePageId(
          context,
          input.pageId,
          "pageId",
        );

        const result = await embedDatabaseInPageService({
          afterHeading: input.afterHeading,
          databaseId: input.databaseId,
          env: context.env,
          userId: context.userId,
          pageId,
        });

        return toToolResult(
          result.alreadyEmbedded
            ? "Database block was already embedded in this page."
            : `Embedded database in page content as ${result.embedMarkdown}.`,
          {
            databaseId: result.databaseId,
            pageId: result.pageId,
          },
        );
      }),
    }),

    linkDatabaseInPage: tool({
      description:
        "Add a database as a linked item in page navigation/sidebar metadata. Only call when the user explicitly asks for a sidebar link or linked item, not for inline page embeds.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        hostPageId: z.string().trim().optional(),
      }),
      execute: withDbExecute(context, "linkDatabaseInPage", async (input) => {
        const hostPageId = resolvePageId(
          context,
          input.hostPageId,
          "hostPageId",
        );

        const result = await linkDatabaseInPageService({
          databaseId: input.databaseId,

          hostPageId,
          userId: context.userId,
        });

        return toToolResult(
          result.action === "addLink"
            ? "Linked database in page navigation."
            : "Database already belongs to this host page.",
          {
            databaseId: result.databaseId,
            hostPageId: result.hostPageId,
          },
        );
      }),
    }),

    createDatabaseProperty: tool({
      description:
        "Add a supported property/column to a database. Formula, rollup, and button properties are forbidden and are not accepted by this tool. Prefer type status (not select) for task/workflow columns — it auto-seeds Not started / In progress / Done with colors and kanban groups. For select/multi_select, pass config.options with { id, name }; colors are auto-assigned when omitted. Valid colors: gray, brown, orange, yellow, green, blue, purple, pink, red.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        type: agentCreatableDatabasePropertyTypeSchema.optional(),
        config: propertyConfigSchema,
        position: z.number().int().min(0).optional(),
      }),
      execute: withDbExecute(context, "createDatabaseProperty", async (input) => {
        const result = await createDatabasePropertyService({
          config: input.config ?? null,
          databaseId: input.dataSourceId,
          env: context.env,

          name: input.name,
          position: input.position,
          type: input.type,
          userId: context.userId,
        });

        const hints = [
          "Use pagePropertyId for setDatabaseCellValue.",
          "Use databasePropertyId for view filters, sorts, and conditionalColors.",
        ];

        if (result.type === "status") {
          hints.push(
            `Status defaults: ${defaultStatusOptions
              .map((option) => `${option.name} (${option.color})`)
              .join(", ")}. Cell values use option names.`,
          );
        } else if (
          result.type === "select" ||
          result.type === "multi_select"
        ) {
          hints.push(
            `Select option colors cycle through: ${selectOptionColors.join(", ")} when omitted.`,
          );
        }

        return toToolResult(`Created property "${result.name}" (${result.type}).`, {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          databasePropertyId: result.databasePropertyId,
          pagePropertyId: result.pagePropertyId,
        }, hints);
      }),
    }),

    updateDatabaseProperty: tool({
      description:
        "Update an existing database property. Changing a property to formula, rollup, or button is forbidden and is not accepted by this tool. Use to add or extend select/status/multi_select options before setDatabaseCellValue. Status options support color and group (To-do, In progress, Complete). Colors are auto-filled when omitted.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        databasePropertyId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        type: agentCreatableDatabasePropertyTypeSchema.optional(),
        config: propertyConfigSchema,
        position: z.number().int().min(0).optional(),
      }),
      execute: withDbExecute(context, "updateDatabaseProperty", async (input) => {
        const result = await updateDatabasePropertyService({
          config: input.config,
          databaseId: input.dataSourceId,
          databasePropertyId: input.databasePropertyId,
          env: context.env,

          name: input.name,
          position: input.position,
          type: input.type,
          userId: context.userId,
        });

        return toToolResult("Updated database property.", {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          databasePropertyId: result.databasePropertyId,
          pagePropertyId: result.pagePropertyId,
        });
      }),
    }),

    createDatabaseView: tool({
      description:
        "Create an additional supported database view: table, kanban, timeline, chart, gallery, list, or form. Map views are not supported. Skip if the default Table view from createDatabase is enough.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        dataSourceId: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        type: agentDatabaseViewTypeSchema.optional(),
        config: propertyConfigSchema,
      }),
      execute: withDbExecute(context, "createDatabaseView", async (input) => {
        const result = await createDatabaseViewService({
          config: input.config ?? null,
          databaseId: input.databaseId,
          dataSourceId: input.dataSourceId,
          env: context.env,

          name: input.name,
          type: input.type,
          userId: context.userId,
        });

        return toToolResult(`Created ${result.type} view "${result.name}".`, {
          databaseId: result.databaseId,
          viewId: result.viewId,
        });
      }),
    }),

    updateDatabaseView: tool({
      description:
        "Update a database view config: filters, sorts, conditionalColors, kanban groupPropertyId, hidden columns. Use databasePropertyId (not pagePropertyId) in filters and conditionalColors.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        viewId: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        type: agentDatabaseViewTypeSchema.optional(),
        config: propertyConfigSchema,
      }),
      execute: withDbExecute(context, "updateDatabaseView", async (input) => {
        const result = await updateDatabaseViewService({
          config: input.config,
          databaseId: input.databaseId,
          env: context.env,

          name: input.name,
          type: input.type,
          userId: context.userId,
          viewId: input.viewId,
        });

        return toToolResult("Updated database view.", {
          databaseId: result.databaseId,
          viewId: result.viewId,
        });
      }),
    }),

    updateDataSource: tool({
      description: "Update data-source settings such as its name, emoji, or name-column config.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: withDbExecute(context, "updateDataSource", async (input) => {
        const result = await updateDataSourceService({
          config: input.config,
          dataSourceId: input.dataSourceId,
          env: context.env,

          name: input.name,
          userId: context.userId,
        });

        return toToolResult("Updated data source.", {
          dataSourceId: result.dataSourceId,
        });
      }),
    }),

    createDatabaseRow: tool({
      description:
        "Add a row to a database. Creates a real editable sub-page for the row unless pageId is provided. Returns rowPageId and a page citation. To write the row page body, call readWorkspacePage and then updateWorkspacePage with rowPageId; never use setDatabaseCellValue for page body content.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        title: z.string().trim().min(1).optional(),
        pageId: z.string().trim().optional(),
        position: z.number().int().min(0).optional(),
        parentRowId: z.string().trim().optional(),
      }),
      execute: withDbExecute(context, "createDatabaseRow", async (input) => {
        const result = await createDatabaseRowService({
          databaseId: input.dataSourceId,
          env: context.env,

          pageId: input.pageId,
          parentRowId: input.parentRowId,
          position: input.position,
          title: input.title,
          userId: context.userId,
        });
        context.allowedPageIds.add(result.rowPageId);

        return toToolResult(`Created row "${result.title}".`, {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          rowId: result.rowId,
          rowPageId: result.rowPageId,
        }, [
          "Use rowId and pagePropertyId in setDatabaseCellValue.",
          "Use rowPageId with readWorkspacePage and updateWorkspacePage for the page body.",
        ], [{
          id: result.rowPageId,
          source: "page",
          title: result.title,
          url: `/p/${encodeURIComponent(result.rowPageId)}`,
        }]);
      }),
    }),

    setDatabaseCellValue: tool({
      description:
        "Set a cell value. Requires rowId and pagePropertyId from prior tool results. For select/status use option names; for multi_select use an array of option names.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        rowId: z.string().trim().min(1),
        pagePropertyId: z.string().trim().min(1),
        value: z.unknown(),
      }),
      execute: withDbExecute(context, "setDatabaseCellValue", async (input) => {
        const result = await setDatabaseCellValueService({
          databaseId: input.dataSourceId,
          env: context.env,

          rowId: input.rowId,
          userId: context.userId,
          value: input.value,
          pagePropertyId: input.pagePropertyId,
        });

        return toToolResult("Updated cell value.", {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          rowId: result.rowId,
          rowPageId: result.rowPageId,
          pagePropertyId: result.pagePropertyId,
        });
      }),
    }),
  };
}

export function buildDatabaseConfigInstruction(input: {
  allowedPageIds: string[];
  primaryPageId: string | null;
}) {
  const primaryHint = input.primaryPageId
    ? ` Default pageId/pageId to ${input.primaryPageId} unless the user names another page.`
    : "";

  return [
    "",
    "## Zilobase database and page configuration",
    "You can create and configure accessible Zilobase databases and pages using the database tools. Every successful mutation returns a durable action receipt.",
    "Call tools one at a time in dependency order. Never invent a batch tool.",
    "Typical order: createPage (optional) -> createDatabase -> createDatabaseProperty -> createDatabaseView/updateDatabaseView -> createDatabaseRow -> setDatabaseCellValue. Use the dataSourceId returned by createDatabase for property, row, and cell tools.",
    "createDatabase always embeds the new live database block inline in its host page. Never create a page-owned database as navigation-only state.",
    "Use embedDatabaseInPage only to repair or place an existing database. Call linkDatabaseInPage only when the user explicitly asks for an additional sidebar/navigation link.",
    "Inline embed format: [Database (<databaseId>)].",
    "Every database row is also an editable page. createDatabaseRow returns rowPageId. When the user asks for content, notes, a description, or a body inside row pages, call readWorkspacePage(rowPageId) and then updateWorkspacePage for each row page. Never invent a pagePropertyId and never use setDatabaseCellValue for page body content; that tool only changes database property cells.",
    "For workflow/task columns (Status, Priority with states, etc.), prefer type status over select. Status auto-creates default options: Not started (gray, To-do), In progress (blue), Done (green). You can extend with more options and groups.",
    "For plain picklists use select or multi_select. Always create property options before setDatabaseCellValue. Option colors are assigned automatically; valid colors: gray, brown, orange, yellow, green, blue, purple, pink, red.",
    "Status cell values use option names (e.g. \"Not started\", \"In progress\", \"Done\"). Status supports kanban grouping via option group.",
    "setDatabaseCellValue uses pagePropertyId. View filters and conditionalColors use databasePropertyId.",
    input.allowedPageIds.length > 0
      ? `Attached editable pageIds: ${input.allowedPageIds.join(", ")}.${primaryHint}`
      : "No editable page is attached. Use createPage first when a new host page is needed, or use an exact accessible page/database ID found with workspace read tools.",
  ].join(" ");
}
