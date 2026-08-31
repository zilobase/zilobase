import type {
  AgentActionReceipt,
  AgentCitation,
  AgentToolResult,
} from "@zilobase/features/ai-chat/agent-contract";
import {
  type AgentIconName,
  type AgentIconSpec,
} from "@zilobase/features/ai-chat/live-agent";
import {
  buildAgentGlyphSvg,
  buildAgentIconSvg,
  resolveAgentGlyphName,
  resolveAgentIconSpec,
} from "@zilobase/features/ai-chat/agent-icons";
import { tool, type ToolCallOptions, type ToolSet } from "ai";
import * as z from "zod";

import type { RuntimeEnv } from "../../../shared/config/config";
import {
  createDatabasePropertyService,
  createDatabaseRowService,
  createDatabaseService,
  createDatabaseViewService,
  setDatabaseCellValueService,
  updateDatabasePropertyService,
  updateDatabaseViewService,
} from "../../databases/core";
import { getDatabasePayload } from "../../databases/core/payload";
import { updateDataSourceService } from "../../databases/data-sources";
import {
  defaultStatusOptions,
  selectOptionColors,
} from "../../databases/properties";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { runIdempotentAgentAction } from "../actions/agent-action-receipts";
import { markdownToPageContent } from "../conversion/markdown-to-page-content";
import {
  createPageService,
  embedDatabaseInPageService,
  linkDatabaseInPageService,
} from "../../pages/mutations";
import { replacePageContent } from "../../collaboration/service";
import type { AgentProgressPublisher } from "../chat/agent-progress";
import {
  AGENT_CREATABLE_DATABASE_PROPERTY_TYPES,
  AGENT_DATABASE_VIEW_TYPES,
  agentCreatableDatabasePropertyTypeSchema,
  agentDatabaseViewTypeSchema,
  agentGlyphSchema,
  agentIconSchema,
  databaseBlueprintSchema,
  propertyConfigSchema,
  type DatabaseBlueprintInput,
} from "./database/blueprint/schema";
import { stripDuplicatePageTitleHeadings } from "./database/blueprint/page-title";
import {
  normalizeBlueprintReference,
  requireBlueprintProperty,
  resolveDatabaseBlueprintViewConfig,
  type BlueprintPropertyRecord,
} from "./database/blueprint/view-config";

export {
  AGENT_CREATABLE_DATABASE_PROPERTY_TYPES,
  AGENT_DATABASE_VIEW_TYPES,
  databaseBlueprintSchema,
};

type DatabaseBlueprintStep = {
  detail: string;
  label: string;
  status: "completed" | "failed";
};

type DatabaseBlueprintData = {
  databaseId?: string;
  dataSourceId?: string;
  pageId?: string;
  placement: "inline" | "standalone";
  properties: Array<{
    databasePropertyId: string;
    key: string;
    name: string;
    pagePropertyId: string;
    type: string;
  }>;
  rowCount: number;
  showInlineDatabaseTitle?: boolean;
  steps: DatabaseBlueprintStep[];
  views: Array<{ id: string; name: string; type: string }>;
};

type ToolContext = {
  allowedPageIds: Set<string>;
  env: RuntimeEnv;
  threadId: string;
  workspaceId: string;
  primaryPageId: string | null;
  progress?: AgentProgressPublisher;
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
  handler: (input: TInput, options: ToolCallOptions) => Promise<TOutput>,
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
          execute: () => handler(input, options),
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

function resolveStoredAgentIcon(input: {
  emoji?: string;
  fallbackKind: "database" | "page";
  name: string;
  requested?: AgentIconSpec;
}) {
  return input.emoji || buildAgentIconSvg(resolveAgentIconSpec({
    fallbackKind: input.fallbackKind,
    name: input.name,
    requested: input.requested,
  }));
}

export function resolveAgentGlyphConfig(input: {
  config?: unknown;
  fallbackKind: "property" | "view";
  includeFallback: boolean;
  name: string;
  requested?: AgentIconName;
  type?: string;
}) {
  const config = input.config && typeof input.config === "object" &&
      !Array.isArray(input.config)
    ? { ...(input.config as Record<string, unknown>) }
    : {};
  delete config.icon;
  if (input.requested || input.includeFallback) {
    config.icon = buildAgentGlyphSvg(resolveAgentGlyphName({
      fallbackKind: input.fallbackKind,
      name: input.name,
      requested: input.requested,
      type: input.type,
    }));
  }
  return config;
}

function serializeForClient<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emitCreatedPageEffects(
  context: ToolContext,
  toolCallId: string,
  created: Awaited<ReturnType<typeof createPageService>>,
) {
  if (!context.progress) return;
  const page = serializeForClient<typeof created.page>(created.page);
  const detail = {
    accessLevel: "full",
    databaseIds: [],
    page,
  };
  const delta = {
    upsertPages: [page],
    upsertPlacements: created.parentPlacement
      ? [created.parentPlacement]
      : [],
  };

  context.progress.effect({
    detail,
    kind: "page-upsert",
    pageId: page.id,
    toolCallId,
    workspaceId: context.workspaceId,
  });
  context.progress.effect({
    delta,
    kind: "nav-delta",
    toolCallId,
    workspaceId: context.workspaceId,
  });
}

async function emitCreatedDatabaseEffects(input: {
  afterHeading?: string;
  context: ToolContext;
  created: Awaited<ReturnType<typeof createDatabaseService>>;
  pageId?: string;
  showTitle?: boolean;
  toolCallId: string;
}) {
  if (!input.context.progress) return;
  const loaded = await getDatabasePayload(
    input.created.databaseId,
    input.context.userId,
  );
  if (!loaded) return;

  const payload = serializeForClient<typeof loaded>({
    ...loaded,
    database: { ...loaded.database, accessLevel: "full" },
  });
  const delta = {
    upsertDatabases: [{
      ...payload.database,
      views: payload.views,
    }],
    upsertPlacements: input.created.parentPlacement
      ? [input.created.parentPlacement]
      : [],
  };

  input.context.progress.effect({
    databaseId: input.created.databaseId,
    kind: "database-seed",
    payload,
    toolCallId: input.toolCallId,
    workspaceId: input.context.workspaceId,
  });
  input.context.progress.effect({
    delta,
    kind: "nav-delta",
    toolCallId: input.toolCallId,
    workspaceId: input.context.workspaceId,
  });

  if (input.pageId) {
    input.context.progress.effect({
      ...(input.afterHeading ? { afterHeading: input.afterHeading } : {}),
      databaseId: input.created.databaseId,
      kind: "page-embed",
      pageId: input.pageId,
      ...(typeof input.showTitle === "boolean"
        ? { showTitle: input.showTitle }
        : {}),
      toolCallId: input.toolCallId,
      workspaceId: input.context.workspaceId,
    });
  }
}

type DatabaseBlueprintToolResult = AgentToolResult<DatabaseBlueprintData> & {
  ids: Record<string, string>;
};

async function executeDatabaseBlueprint(
  context: ToolContext,
  input: DatabaseBlueprintInput,
  toolCallId: string,
): Promise<DatabaseBlueprintToolResult> {
  const data: DatabaseBlueprintData = {
    placement: input.placement,
    properties: [],
    rowCount: 0,
    steps: [],
    views: [],
  };
  const citations: AgentCitation[] = [];
  const propertiesByReference = new Map<string, BlueprintPropertyRecord>();

  const runStep = async <T>(
    key: string,
    label: string,
    phase: "container" | "schema" | "views",
    operation: () => Promise<T>,
    describe: (result: T) => string,
  ) => {
    context.progress?.startStep({ key, label, phase, toolCallId });
    try {
      const result = await operation();
      const detail = describe(result);
      data.steps.push({ detail, label, status: "completed" });
      context.progress?.finishStep({ detail, key, toolCallId });
      return result;
    } catch (error) {
      const detail = readBlueprintErrorMessage(error);
      data.steps.push({
        detail,
        label,
        status: "failed",
      });
      context.progress?.finishStep({
        detail,
        failed: true,
        key,
        toolCallId,
      });
      throw error;
    }
  };

  try {
    const pageId = input.placement === "inline"
      ? input.pageId ?? (await runStep(
          "host-page",
          "Create host page",
          "container",
          async () => {
            const created = await createPageService({
              content: input.hostPage?.markdown
                ? markdownToPageContent(stripDuplicatePageTitleHeadings(
                    input.hostPage.markdown,
                    input.hostPage.name,
                  ))
                : undefined,
              metadata: {
                emoji: resolveStoredAgentIcon({
                  emoji: input.hostPage?.emoji,
                  fallbackKind: "page",
                  name: input.hostPage!.name,
                  requested: input.hostPage?.icon,
                }),
              },
              name: input.hostPage!.name,
              parentPageId: input.hostPage?.parentPageId,
              userId: context.userId,
              workspaceId: context.workspaceId,
            });
            emitCreatedPageEffects(context, toolCallId, created);
            return created;
          },
          () => `Created “${input.hostPage!.name}”.`,
        )).pageId
      : undefined;

    if (pageId) {
      data.pageId = pageId;
      context.allowedPageIds.add(pageId);
    }

    if (pageId && !input.pageId) {
      citations.push({
        id: pageId,
        source: "page",
        title: input.hostPage!.name,
        url: `/p/${encodeURIComponent(pageId)}`,
      });
    }

    const createdDatabase = await runStep(
      "database",
      "Create database",
      "container",
      async () => {
        const result = await createDatabaseService({
          defaultViewIcon: buildAgentGlyphSvg(resolveAgentGlyphName({
            fallbackKind: "view",
            name: input.views[0]?.name ?? "Table",
            requested: input.views[0]?.icon,
            type: input.views[0]?.type ?? "table",
          })),
          icon: resolveStoredAgentIcon({
            emoji: input.emoji,
            fallbackKind: "database",
            name: input.databaseName,
            requested: input.icon,
          }),
          name: input.databaseName,
          pageId,
          standalone: input.placement === "standalone",
          teamspaceId: input.teamspaceId,
          userId: context.userId,
          workspaceId: context.workspaceId,
        });
        if (input.placement === "inline" && pageId) {
          const embed = await embedDatabaseInPageService({
            databaseId: result.databaseId,
            env: context.env,
            pageId,
            showTitle: input.showInlineDatabaseTitle,
            userId: context.userId,
          });
          data.showInlineDatabaseTitle = embed.showTitle;
        }
        await emitCreatedDatabaseEffects({
          context,
          created: result,
          pageId,
          showTitle: data.showInlineDatabaseTitle,
          toolCallId,
        });
        return result;
      },
      () => input.placement === "standalone"
        ? `Created full-page database “${input.databaseName}”.`
        : `Created and embedded “${input.databaseName}”.`,
    );
    data.databaseId = createdDatabase.databaseId;
    data.dataSourceId = createdDatabase.dataSourceId;
    citations.push({
      id: createdDatabase.databaseId,
      source: "database",
      title: input.databaseName,
      url: `/d/${encodeURIComponent(createdDatabase.databaseId)}`,
    });

    if (input.views.length === 0) {
      data.views.push({
        id: createdDatabase.defaultViewId,
        name: "Table",
        type: "table",
      });
    }

    for (const property of input.properties) {
      const created = await runStep(
        `property:${property.key}`,
        `Add ${property.name}`,
        "schema",
        () => createDatabasePropertyService({
          config: resolveAgentGlyphConfig({
            config: property.config,
            fallbackKind: "property",
            includeFallback: true,
            name: property.name,
            requested: property.icon,
            type: property.type,
          }),
          databaseId: createdDatabase.dataSourceId,
          env: context.env,
          name: property.name,
          type: property.type,
          userId: context.userId,
        }),
        (result) => `Added ${result.name} (${result.type}).`,
      );
      const record: BlueprintPropertyRecord = {
        databasePropertyId: created.databasePropertyId,
        key: property.key,
        name: created.name,
        pagePropertyId: created.pagePropertyId,
        type: created.type,
      };
      data.properties.push(record);
      propertiesByReference.set(normalizeBlueprintReference(property.key), record);
      propertiesByReference.set(normalizeBlueprintReference(property.name), record);
    }

    let defaultViewAvailable = true;
    for (const view of input.views) {
      const config = resolveDatabaseBlueprintViewConfig(
        view,
        propertiesByReference,
      );
      const useDefault: boolean =
        defaultViewAvailable && view.useDefault !== false;
      const result = await runStep(
        `view:${view.name.toLowerCase()}`,
        `Configure ${view.name}`,
        "views",
        () => useDefault
          ? updateDatabaseViewService({
              config: resolveAgentGlyphConfig({
                config,
                fallbackKind: "view",
                includeFallback: true,
                name: view.name,
                requested: view.icon,
                type: view.type,
              }),
              databaseId: createdDatabase.databaseId,
              env: context.env,
              name: view.name,
              type: view.type,
              userId: context.userId,
              viewId: createdDatabase.defaultViewId,
            })
          : createDatabaseViewService({
              config: resolveAgentGlyphConfig({
                config,
                fallbackKind: "view",
                includeFallback: true,
                name: view.name,
                requested: view.icon,
                type: view.type,
              }),
              databaseId: createdDatabase.databaseId,
              dataSourceId: createdDatabase.dataSourceId,
              env: context.env,
              name: view.name,
              type: view.type,
              userId: context.userId,
            }),
        () => `${useDefault ? "Configured" : "Created"} ${view.type} view “${view.name}”.`,
      );
      defaultViewAvailable = useDefault ? false : defaultViewAvailable;
      data.views.push({ id: result.viewId, name: view.name, type: view.type });
    }

    if (input.rows.length > 0) {
      const rowStepKey = "rows";
      context.progress?.startStep({
        key: rowStepKey,
        label: "Populate rows",
        phase: "rows",
        toolCallId,
      });
      context.progress?.setRowProgress({
        completed: 0,
        toolCallId,
        total: input.rows.length,
      });

      try {
        for (const row of input.rows) {
          const createdRow = await createDatabaseRowService({
            databaseId: createdDatabase.dataSourceId,
            env: context.env,
            title: row.title,
            userId: context.userId,
          });
          context.allowedPageIds.add(createdRow.rowPageId);

          for (const [reference, value] of Object.entries(row.values)) {
            const property = requireBlueprintProperty(
              reference,
              propertiesByReference,
            );
            await setDatabaseCellValueService({
              databaseId: createdDatabase.dataSourceId,
              env: context.env,
              pagePropertyId: property.pagePropertyId,
              rowId: createdRow.rowId,
              userId: context.userId,
              value,
            });
          }

          if (row.markdown) {
            await replacePageContent({
              content: markdownToPageContent(row.markdown),
              env: context.env,
              pageId: createdRow.rowPageId,
              userId: context.userId,
            });
          }
          data.rowCount += 1;
          context.progress?.setRowProgress({
            completed: data.rowCount,
            toolCallId,
            total: input.rows.length,
          });
        }

        const detail = `Added ${data.rowCount} rows.`;
        data.steps.push({
          detail,
          label: "Populate rows",
          status: "completed",
        });
        context.progress?.finishStep({
          detail,
          key: rowStepKey,
          toolCallId,
        });
      } catch (error) {
        const detail = readBlueprintErrorMessage(error);
        data.steps.push({
          detail,
          label: "Populate rows",
          status: "failed",
        });
        context.progress?.finishStep({
          detail,
          failed: true,
          key: rowStepKey,
          toolCallId,
        });
        throw error;
      }
    }

    return {
      citations,
      data,
      ids: blueprintIds(data),
      ok: true,
      status: "succeeded",
      summary:
        `Built ${input.placement === "standalone" ? "full-page" : "inline"} database “${input.databaseName}” with ${data.properties.length} properties, ${data.views.length} views, and ${data.rowCount} rows.`,
    };
  } catch (error) {
    return {
      citations,
      data,
      error: { code: "database_blueprint_incomplete", retryable: true },
      ids: blueprintIds(data),
      ok: false,
      status: "failed",
      summary:
        `Database setup stopped after ${data.steps.filter((step) => step.status === "completed").length} completed steps: ${readBlueprintErrorMessage(error)}`,
    };
  }
}

function blueprintIds(data: DatabaseBlueprintData) {
  return Object.fromEntries(
    Object.entries({
      databaseId: data.databaseId,
      dataSourceId: data.dataSourceId,
      pageId: data.pageId,
    }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export {
  resolveDatabaseBlueprintViewConfig,
  stripDuplicatePageTitleHeadings,
};
export type { BlueprintPropertyRecord };

function readBlueprintErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message.slice(0, 500)
    : "An unexpected database setup error occurred.";
}

export function buildDatabaseConfigTools(context: ToolContext): ToolSet {
  return {
    buildDatabaseFromBlueprint: tool({
      description:
        "Build a complete new Zilobase database from one declarative blueprint. The placement decision is required: choose standalone when the database is the primary artifact, and inline only when it belongs inside a page, dashboard, brief, or section. Infer sensible reversible defaults and include the full property schema, useful views and filters, initial rows, and optional row-page content in one call. The native page name is already its title, so duplicate title headings are removed. Property keys let views and rows refer to properties without internal IDs. For a this-week date filter use operator is_relative_to_today with value relative:this:week. Use low-level database tools only to edit existing databases or recover a failed blueprint step.",
      inputSchema: databaseBlueprintSchema,
      execute: (input, options) =>
        context.withDb(() =>
          runIdempotentAgentAction({
            context: {
              threadId: context.threadId,
              userId: context.userId,
              workspaceId: context.workspaceId,
            },
            execute: () => executeDatabaseBlueprint(
              context,
              input,
              options.toolCallId,
            ),
            toolCallId: options.toolCallId,
            toolInput: input,
            toolName: "buildDatabaseFromBlueprint",
          })
        ),
    }),

    createPage: tool({
      description:
        "Create a new Zilobase page, optionally with an emoji and populated Markdown body. The native page name is already its title, so matching Markdown headings are removed. The returned pageId is authorized for later tools in this turn.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(240),
        parentPageId: z.string().trim().optional(),
        markdown: z.string().trim().max(64_000).optional(),
        emoji: z.string().trim().max(32).optional(),
        icon: agentIconSchema.optional(),
      }).refine((value) => !(value.emoji && value.icon), {
        message: "Choose either an emoji or a colored icon for the page.",
      }),
      execute: withDbExecute(context, "createPage", async (input, options) => {
        const result = await createPageService({
          content: input.markdown
            ? markdownToPageContent(
                stripDuplicatePageTitleHeadings(input.markdown, input.name),
              )
            : undefined,
          metadata: {
            emoji: resolveStoredAgentIcon({
              emoji: input.emoji,
              fallbackKind: "page",
              name: input.name,
              requested: input.icon,
            }),
          },
          name: input.name,
          parentPageId: input.parentPageId,
          workspaceId: context.workspaceId,
          userId: context.userId,
        });
        context.allowedPageIds.add(result.pageId);
        emitCreatedPageEffects(context, options.toolCallId, result);

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
        "Create either a standalone full-page database or an inline database on a host page. Choose standalone when the database is the primary artifact; choose inline only when it belongs inside a page, dashboard, brief, or named section.",
      inputSchema: z.object({
        emoji: z.string().trim().max(32).optional(),
        icon: agentIconSchema.optional(),
        name: z.string().trim().min(1).max(240).optional(),
        pageId: z.string().trim().optional(),
        placement: z.enum(["standalone", "inline"]),
        showInlineDatabaseTitle: z.boolean().optional(),
        teamspaceId: z.string().trim().min(1).nullable().optional(),
      }).refine((value) => !(value.emoji && value.icon), {
        message: "Choose either an emoji or a colored icon for the database.",
      }),
      execute: withDbExecute(context, "createDatabase", async (input, options) => {
        const pageId = input.placement === "inline"
          ? resolvePageId(context, input.pageId, "pageId")
          : undefined;

        const result = await createDatabaseService({
          defaultViewIcon: buildAgentGlyphSvg(resolveAgentGlyphName({
            fallbackKind: "view",
            name: "Table",
            type: "table",
          })),
          icon: resolveStoredAgentIcon({
            emoji: input.emoji,
            fallbackKind: "database",
            name: input.name ?? "New database",
            requested: input.icon,
          }),
          name: input.name,
          workspaceId: context.workspaceId,
          pageId,
          standalone: input.placement === "standalone",
          teamspaceId: input.teamspaceId,
          userId: context.userId,
        });
        const embed = pageId
          ? await embedDatabaseInPageService({
              databaseId: result.databaseId,
              env: context.env,
              pageId,
              showTitle: input.showInlineDatabaseTitle,
              userId: context.userId,
            })
          : null;
        await emitCreatedDatabaseEffects({
          context,
          created: result,
          pageId,
          showTitle: embed?.showTitle,
          toolCallId: options.toolCallId,
        });

        return toToolResult(
          input.placement === "standalone"
            ? `Created full-page database "${result.name}".`
            : `Created and embedded database "${result.name}".`, {
          databaseId: result.databaseId,
          dataSourceId: result.dataSourceId,
          defaultViewId: result.defaultViewId,
          pageId,
        }, [
          "Default Table view already exists as defaultViewId.",
          ...(embed
            ? [
                embed.alreadyEmbedded
                  ? "The live database block was already present in the host page."
                  : `The live database block is inline in the host page with its title ${embed.showTitle ? "shown" : "hidden"}.`,
              ]
            : ["The database is a standalone full-page workspace item."]),
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
        showTitle: z.boolean().optional().describe(
          "Override inline title visibility. By default it is hidden when the page and database names match.",
        ),
      }),
      execute: withDbExecute(context, "embedDatabaseInPage", async (input, options) => {
        const pageId = resolvePageId(
          context,
          input.pageId,
          "pageId",
        );

        const result = await embedDatabaseInPageService({
          afterHeading: input.afterHeading,
          databaseId: input.databaseId,
          env: context.env,
          showTitle: input.showTitle,
          userId: context.userId,
          pageId,
        });
        context.progress?.effect({
          ...(input.afterHeading ? { afterHeading: input.afterHeading } : {}),
          databaseId: input.databaseId,
          kind: "page-embed",
          pageId,
          ...(typeof result.showTitle === "boolean"
            ? { showTitle: result.showTitle }
            : {}),
          toolCallId: options.toolCallId,
          workspaceId: context.workspaceId,
        });

        return toToolResult(
          result.titleUpdated
            ? `Updated the inline database title to ${result.showTitle ? "shown" : "hidden"}.`
            : result.alreadyEmbedded
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
        "Add a supported property/column to a database. The optional icon is a curated glyph token only and never accepts a color. Formula, rollup, and button properties are forbidden and are not accepted by this tool. Prefer type status (not select) for task/workflow columns — it auto-seeds Not started / In progress / Done with colors and kanban groups. For select/multi_select, pass config.options with { id, name }; option colors are auto-assigned when omitted.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        type: agentCreatableDatabasePropertyTypeSchema.optional(),
        config: propertyConfigSchema,
        icon: agentGlyphSchema.optional(),
        position: z.number().int().min(0).optional(),
      }),
      execute: withDbExecute(context, "createDatabaseProperty", async (input) => {
        const name = input.name ?? "Property";
        const type = input.type ?? "text";
        const result = await createDatabasePropertyService({
          config: resolveAgentGlyphConfig({
            config: input.config,
            fallbackKind: "property",
            includeFallback: true,
            name,
            requested: input.icon,
            type,
          }),
          databaseId: input.dataSourceId,
          env: context.env,

          name,
          position: input.position,
          type,
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
        "Update an existing database property. The optional icon is a curated glyph token only and never accepts a color. Changing a property to formula, rollup, or button is forbidden and is not accepted by this tool. Use to add or extend select/status/multi_select options before setDatabaseCellValue. Status options support color and group (To-do, In progress, Complete). Option colors are auto-filled when omitted.",
      inputSchema: z.object({
        dataSourceId: z.string().trim().min(1),
        databasePropertyId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        type: agentCreatableDatabasePropertyTypeSchema.optional(),
        config: propertyConfigSchema,
        icon: agentGlyphSchema.optional(),
        position: z.number().int().min(0).optional(),
      }),
      execute: withDbExecute(context, "updateDatabaseProperty", async (input) => {
        const hasConfigPatch = input.config !== undefined || input.icon !== undefined;
        const result = await updateDatabasePropertyService({
          config: hasConfigPatch
            ? resolveAgentGlyphConfig({
                config: input.config,
                fallbackKind: "property",
                includeFallback: false,
                name: input.name ?? "Property",
                requested: input.icon,
                type: input.type,
              })
            : undefined,
          databaseId: input.dataSourceId,
          databasePropertyId: input.databasePropertyId,
          env: context.env,
          mergeConfig: hasConfigPatch,
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
        "Create an additional supported database view: table, kanban, timeline, chart, gallery, list, or form. The optional icon is a curated glyph token only and never accepts a color. Map views are not supported. Skip if the default Table view from createDatabase is enough.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        dataSourceId: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        type: agentDatabaseViewTypeSchema.optional(),
        config: propertyConfigSchema,
        icon: agentGlyphSchema.optional(),
      }),
      execute: withDbExecute(context, "createDatabaseView", async (input) => {
        const name = input.name ?? "Table";
        const type = input.type ?? "table";
        const result = await createDatabaseViewService({
          config: resolveAgentGlyphConfig({
            config: input.config,
            fallbackKind: "view",
            includeFallback: true,
            name,
            requested: input.icon,
            type,
          }),
          databaseId: input.databaseId,
          dataSourceId: input.dataSourceId,
          env: context.env,

          name,
          type,
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
        "Update a database view config: filters, sorts, conditionalColors, kanban groupPropertyId, hidden columns, and an optional uncolored curated icon glyph. Use databasePropertyId (not pagePropertyId) in filters and conditionalColors.",
      inputSchema: z.object({
        databaseId: z.string().trim().min(1),
        viewId: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        type: agentDatabaseViewTypeSchema.optional(),
        config: propertyConfigSchema,
        icon: agentGlyphSchema.optional(),
      }),
      execute: withDbExecute(context, "updateDatabaseView", async (input) => {
        const hasConfigPatch = input.config !== undefined || input.icon !== undefined;
        const result = await updateDatabaseViewService({
          config: hasConfigPatch
            ? resolveAgentGlyphConfig({
                config: input.config,
                fallbackKind: "view",
                includeFallback: false,
                name: input.name ?? "View",
                requested: input.icon,
                type: input.type,
              })
            : undefined,
          databaseId: input.databaseId,
          env: context.env,
          mergeConfig: hasConfigPatch,
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
    ? ` For inline placement only, default pageId to ${input.primaryPageId} unless the user names another page.`
    : "";

  return [
    "",
    "## Zilobase database and page configuration",
    "For a new database, prefer one buildDatabaseFromBlueprint call and explicitly choose placement. Use a standalone full-page database when the database itself is the primary requested artifact, such as 'create a release tracker', CRM, log, or content calendar. Use inline only when the user asks to put it inside/on an existing page, dashboard, brief, or named section, or when they ask for a page whose supporting content includes a database. Do not infer inline merely because a page is attached. Ask one placement question only if those rules still leave a consequential ambiguity.",
    "Infer a complete, useful schema from the user's goal: human-readable names, appropriate property types and options, useful views/filters/sorts, and any requested starter rows or row-page content. The blueprint accepts property keys so rows and views do not need internal IDs. For a 'This week' date view use is_relative_to_today with value relative:this:week.",
    "Choose a safe semantic icon name and palette color for newly created pages and database containers. Properties and views may receive a semantic icon glyph, but never a color; their icon input is a plain curated token rather than an icon/color object. Do not assign icons to generated row pages. Use emoji only when the user explicitly asks for emoji. The server validates all icon tokens and supplies deterministic semantic fallbacks when a choice is omitted or invalid.",
    "The native page name is its only page title. Never repeat that title as an H1 or equivalent body heading. For inline databases with the same name as their host page, leave showInlineDatabaseTitle unset so the server hides the redundant block title automatically; set it only when the user explicitly wants another visible title.",
    "Use the atomic database tools for edits to existing databases or to recover a failed blueprint step. Call them in dependency order and use IDs returned by prior tools. When a continuation includes existing page or database IDs, preserve completed work and never call buildDatabaseFromBlueprint, createPage, or createDatabase for an existing container. Every successful mutation returns a durable action receipt.",
    "Atomic createDatabase also requires placement: standalone creates a full-page workspace database; inline creates and embeds a page-owned database.",
    "Use embedDatabaseInPage only to repair or place an existing database. Call linkDatabaseInPage only when the user explicitly asks for an additional sidebar/navigation link.",
    "Every database row is also an editable page. createDatabaseRow returns rowPageId. When the user asks for content, notes, a description, or a body inside row pages, call readWorkspacePage(rowPageId) and then updateWorkspacePage for each row page. Never invent a pagePropertyId and never use setDatabaseCellValue for page body content; that tool only changes database property cells.",
    "For workflow/task columns (Status, Priority with states, etc.), prefer type status over select. Status auto-creates default options: Not started (gray, To-do), In progress (blue), Done (green). You can extend with more options and groups.",
    "For plain picklists use select or multi_select and define options before setting cells. Status cell values use option names such as Not started, In progress, and Done.",
    "setDatabaseCellValue uses pagePropertyId. View filters and conditionalColors use databasePropertyId.",
    input.allowedPageIds.length > 0
      ? `Attached editable pageIds: ${input.allowedPageIds.join(", ")}.${primaryHint}`
      : "No editable page is attached. A standalone database needs no host page. For inline placement, use hostPage in the blueprint, createPage first, or use an exact accessible page ID found with workspace read tools.",
  ].join(" ");
}
