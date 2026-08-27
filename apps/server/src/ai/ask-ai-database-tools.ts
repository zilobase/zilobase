import type { AgentActionReceipt } from "@zilobase/features/ai-chat/agent-contract";
import { tool, type ToolCallOptions, type ToolSet } from "ai";
import * as z from "zod";

import type { RuntimeEnv } from "../config";
import {
  createDatabasePropertyService,
  createDatabaseRowService,
  createDatabaseService,
  createDatabaseViewService,
  setDatabaseCellValueService,
  updateDatabasePropertyService,
  updateDatabaseViewService,
} from "../services/database-mutations";
import { updateDataSourceService } from "../services/data-source-service";
import {
  defaultStatusOptions,
  selectOptionColors,
} from "../services/database-property-config";
import { ServiceMutationError } from "../services/mutation-error";
import { runIdempotentAgentAction } from "./agent-action-receipts";
import { markdownToPageContent } from "./markdown-to-page-content";
import {
  createPageService,
  embedDatabaseInPageService,
  linkDatabaseInPageService,
} from "../services/page-mutations";

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
        });
      }),
    }),

    createDatabase: tool({
      description:
        "Create a database on a host page. Does NOT embed the database in page content. When the user asks to embed or add the database to the page/page, call embedDatabaseInPage immediately after this tool and before properties, rows, or cell values so they can preview the live database while setup continues.",
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

        return toToolResult(`Created database "${result.name}".`, {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          defaultViewId: result.defaultViewId,
          pageId,
        }, [
          "Default Table view already exists as defaultViewId.",
          "Do not embed unless the user asked to embed or add to the page.",
        ]);
      }),
    }),

    embedDatabaseInPage: tool({
      description:
        "Embed a database inline in page content using [Database (<uuid>)]. Only call when the user explicitly asks to embed or place the database in the page/page. Call immediately after createDatabase and before properties, rows, or cell values when embedding was requested.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
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
          databaseId: input.dataSourceId,
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
        "Add a row to a database. Creates a sub-page for the row unless pageId is provided.",
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

        return toToolResult(`Created row "${result.title}".`, {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          rowId: result.rowId,
          rowPageId: result.rowPageId,
        }, [
          "Use rowId and pagePropertyId in setDatabaseCellValue.",
        ]);
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
    "Typical order: createPage (optional) -> createDatabase -> embed/link (only if user asked) -> createDatabaseProperty -> createDatabaseView/updateDatabaseView -> createDatabaseRow -> setDatabaseCellValue. Use the dataSourceId returned by createDatabase for property, row, and cell tools.",
    "When the user asks to embed or add the database to the page/page, call embedDatabaseInPage immediately after createDatabase and before properties, rows, or cell values.",
    "createDatabase does not embed the database. Call embedDatabaseInPage only when the user asks to embed or place it in page content. Call linkDatabaseInPage only when the user asks for sidebar/navigation links.",
    "Inline embed format: [Database (<databaseId>)].",
    "For workflow/task columns (Status, Priority with states, etc.), prefer type status over select. Status auto-creates default options: Not started (gray, To-do), In progress (blue), Done (green). You can extend with more options and groups.",
    "For plain picklists use select or multi_select. Always create property options before setDatabaseCellValue. Option colors are assigned automatically; valid colors: gray, brown, orange, yellow, green, blue, purple, pink, red.",
    "Status cell values use option names (e.g. \"Not started\", \"In progress\", \"Done\"). Status supports kanban grouping via option group.",
    "setDatabaseCellValue uses pagePropertyId. View filters and conditionalColors use databasePropertyId.",
    input.allowedPageIds.length > 0
      ? `Attached editable pageIds: ${input.allowedPageIds.join(", ")}.${primaryHint}`
      : "No editable page is attached. Use createPage first when a new host page is needed, or use an exact accessible page/database ID found with workspace read tools.",
  ].join(" ");
}
