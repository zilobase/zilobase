import type { AgentToolResult } from "@zilobase/features/ai-chat/agent-contract";
import { tool, type ToolSet } from "ai";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import * as z from "zod";

import { db } from "../../../../infrastructure/database";
import {
  aiMcpDataset,
  aiMcpDatasetChunk,
  aiMcpConnection,
  aiMcpMaterialization,
  aiMcpMaterializationReservation,
  database,
  databaseProperty,
  databaseRow,
  databaseView,
  pageProperty,
} from "../../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../../shared/config/config";
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error";
import {
  createDatabasePropertyService,
  createDatabaseRowService,
  createDatabaseService,
  createDatabaseViewService,
  setDatabaseCellValueService,
} from "../../../databases/core";
import {
  agentDatabaseViewTypeSchema,
  databaseBlueprintViewSchema,
} from "../../tools/database/blueprint/schema";
import { resolveDatabaseBlueprintViewConfig } from "../../tools/database/blueprint/view-config";
import { enqueueAiJob, PermanentAiJobError, type AiJobHandler } from "../../jobs/ai-jobs";
import {
  agentMcpScope,
  getMcpScopeColumns,
  personalMcpScope,
  requireMcpScopeAccess,
  type McpScope,
} from "../mcp-scope";

const supportedTypeSchema = z.enum(["text", "number", "checkbox", "url", "email", "phone", "date"]);
export const mcpMaterializationInputSchema = z
  .object({
    datasetIds: z.array(z.string().uuid()).max(10).default([]),
    toolExecutionIds: z.array(z.string().uuid()).max(10).default([]),
    name: z.string().trim().min(1).max(240),
    placement: z.enum(["standalone", "inline"]),
    pageId: z.string().trim().min(1).optional(),
    titleSourceColumn: z.string().trim().min(1).max(120),
    properties: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          sourceColumn: z.string().trim().min(1).max(120),
          type: supportedTypeSchema,
        }),
      )
      .max(30),
    sourceUrlColumn: z.string().trim().min(1).max(120).optional(),
    views: z.array(databaseBlueprintViewSchema).max(10).optional(),
  })
  .superRefine((value, context) => {
    if (value.placement === "inline" && !value.pageId) {
      context.addIssue({
        code: "custom",
        message: "pageId is required for inline materialization.",
      });
    }
    if (value.datasetIds.length + value.toolExecutionIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one connector dataset or tool execution ID is required.",
      });
    }
  });

type MaterializationSpec = z.infer<typeof mcpMaterializationInputSchema> & {
  provenance: {
    providers: string[];
    tools: string[];
  };
  target: {
    databaseId: string;
    dataSourceId: string;
    defaultViewId: string;
    properties: Array<{
      databasePropertyId: string;
      name: string;
      pagePropertyId: string;
      sourceColumn: string;
      type: z.infer<typeof supportedTypeSchema>;
    }>;
    views: Array<
      {
        id: string;
        name: string;
        type: z.infer<typeof agentDatabaseViewTypeSchema>;
      } & z.infer<typeof databaseBlueprintViewSchema>
    >;
  };
};

export function buildMcpMaterializationTools(context: {
  agentProfileId: string | null;
  env: RuntimeEnv;
  threadId: string;
  userId: string;
  workspaceId: string;
  withDb<T>(fn: () => Promise<T>): Promise<T>;
}): ToolSet {
  const scope = context.agentProfileId
    ? agentMcpScope(context.agentProfileId)
    : personalMcpScope(context.userId);
  return {
    materializeConnectedDataAsDatabase: tool({
      description:
        "Queue one-time creation of a native Zilobase database from connector data returned in this private thread. Use only dataset IDs or tool execution IDs returned by connector tools. Do not pass raw rows. The user must have previewed the sample and asked to create the database.",
      inputSchema: mcpMaterializationInputSchema,
      execute: (input) =>
        context.withDb(() =>
          queueMcpMaterialization({
            ...context,
            scope,
            spec: input,
          }),
        ),
    }),
  };
}

export async function queueMcpMaterialization(input: {
  env: RuntimeEnv;
  scope: McpScope;
  spec: z.infer<typeof mcpMaterializationInputSchema>;
  threadId: string;
  userId: string;
  workspaceId: string;
}): Promise<AgentToolResult> {
  await requireMcpScopeAccess({
    minimum: "user",
    scope: input.scope,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const datasetIds = [...new Set(input.spec.datasetIds)];
  const toolExecutionIds = [...new Set(input.spec.toolExecutionIds)];
  const datasets = await loadThreadDatasets(input, datasetIds, toolExecutionIds);
  const foundDatasetIds = new Set(datasets.map((dataset) => dataset.id));
  const foundExecutionIds = new Set(
    datasets.flatMap((dataset) => (dataset.toolExecutionId ? [dataset.toolExecutionId] : [])),
  );
  if (
    datasetIds.some((id) => !foundDatasetIds.has(id)) ||
    toolExecutionIds.some((id) => !foundExecutionIds.has(id))
  ) {
    return unavailable(
      "mcp_dataset_unavailable",
      "One or more connector datasets expired or do not belong to this thread.",
    );
  }
  const resolvedDatasetIds = [...foundDatasetIds].sort();
  const totalRows = datasets.reduce((total, dataset) => total + dataset.rowCount, 0);
  if (totalRows > 10_000)
    return unavailable(
      "mcp_dataset_row_limit",
      "A materialization can contain at most 10,000 rows.",
    );
  const availableColumns = new Set(
    datasets.flatMap((dataset) => {
      const schema = isRecord(dataset.schema) ? dataset.schema : {};
      return Array.isArray(schema.columns)
        ? schema.columns.filter((column): column is string => typeof column === "string")
        : [];
    }),
  );
  const mappedColumns = [
    input.spec.titleSourceColumn,
    input.spec.sourceUrlColumn,
    ...input.spec.properties.map((property) => property.sourceColumn),
  ].filter((column): column is string => Boolean(column));
  if (mappedColumns.some((column) => !availableColumns.has(column))) {
    return unavailable(
      "mcp_dataset_mapping_invalid",
      "A selected source column is not present in the connector dataset preview.",
    );
  }
  const mappedProperties = importProperties(input.spec);
  if (!mappedProperties)
    return unavailable(
      "mcp_dataset_column_limit",
      "Source URL mapping must fit within the 30-property import limit.",
    );
  const id = crypto.randomUUID();
  const connections = await db
    .select({
      id: aiMcpConnection.id,
      serverLabel: aiMcpConnection.serverLabel,
    })
    .from(aiMcpConnection)
    .where(
      inArray(aiMcpConnection.id, [...new Set(datasets.map((dataset) => dataset.connectionId))]),
    );
  const target = {
    databaseId: crypto.randomUUID(),
    dataSourceId: crypto.randomUUID(),
    defaultViewId: crypto.randomUUID(),
    properties: mappedProperties.map((property) => ({
      ...property,
      databasePropertyId: crypto.randomUUID(),
      pagePropertyId: crypto.randomUUID(),
    })),
    views: (input.spec.views ?? []).map((view) => ({
      ...view,
      id: crypto.randomUUID(),
    })),
  };
  try {
    const propertiesByReference = materializationPropertyReferences(target.properties);
    for (const view of target.views) {
      resolveDatabaseBlueprintViewConfig(view, propertiesByReference);
    }
  } catch {
    return unavailable(
      "mcp_dataset_view_invalid",
      "A requested view references an unknown imported property.",
    );
  }
  const spec: MaterializationSpec = {
    ...input.spec,
    datasetIds: resolvedDatasetIds,
    toolExecutionIds,
    provenance: {
      providers: [...new Set(connections.map((connection) => connection.serverLabel))],
      tools: [...new Set(datasets.map((dataset) => dataset.externalToolName))],
    },
    target,
  };
  const now = new Date();
  const reservations = datasets.flatMap((dataset) =>
    Array.from({ length: dataset.rowCount }, (_, sourceRowIndex) => ({
      createdAt: now,
      datasetId: dataset.id,
      id: crypto.randomUUID(),
      materializationId: id,
      pageId: crypto.randomUUID(),
      rowId: crypto.randomUUID(),
      sourceRowIndex,
      status: "reserved" as const,
      updatedAt: now,
    })),
  );
  await db.transaction(async (tx) => {
    await tx.insert(aiMcpMaterialization).values({
      ...getMcpScopeColumns(input.scope),
      completedRows: 0,
      createdAt: now,
      dataSourceId: target.dataSourceId,
      databaseId: target.databaseId,
      failedRows: 0,
      id,
      mapping: spec,
      name: input.spec.name,
      status: "queued",
      threadId: input.threadId,
      updatedAt: now,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
    for (let offset = 0; offset < reservations.length; offset += 500) {
      await tx
        .insert(aiMcpMaterializationReservation)
        .values(reservations.slice(offset, offset + 500));
    }
  });
  const job = await enqueueAiJob({
    dedupeKey: id,
    env: input.env,
    input: { materializationId: id },
    maxAttempts: 5,
    type: "mcp-database-materialization",
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  await db
    .update(aiMcpMaterialization)
    .set({ aiJobId: job.id, updatedAt: new Date() })
    .where(eq(aiMcpMaterialization.id, id));
  return {
    data: {
      materializationId: id,
      rowCount: totalRows,
    },
    job: { id: job.id, statusUrl: `/api/ai/jobs/${job.id}` },
    ok: true,
    status: "queued",
    summary: `Queued one-time import of ${totalRows} connector rows into “${input.spec.name}”.`,
  };
}

export const materializeMcpDatasetJob: AiJobHandler = async (context) => {
  try {
    return await materializeMcpDatasetJobAttempt(context);
  } catch (error) {
    const payload = context.job.input as { materializationId?: unknown };
    if (typeof payload.materializationId === "string") {
      const terminal = isTerminalMaterializationFailure(error, context.job);
      const [current] = await db
        .select({
          completedRows: aiMcpMaterialization.completedRows,
        })
        .from(aiMcpMaterialization)
        .where(eq(aiMcpMaterialization.id, payload.materializationId))
        .limit(1);
      const completedRows = current ? Number(current.completedRows) : 0;
      const outcome = completedRows > 0 ? "partial" : "failed";
      await db
        .update(aiMcpMaterialization)
        .set({
          ...(terminal ? { completedAt: new Date() } : {}),
          errorCode: terminal ? "materialization_terminal_failure" : null,
          status: terminal ? outcome : "queued",
          updatedAt: new Date(),
        })
        .where(eq(aiMcpMaterialization.id, payload.materializationId));
      if (terminal) {
        console.info(
          JSON.stringify({
            completedRows,
            event: "mcp_database_materialization",
            outcome,
          }),
        );
      }
    }
    throw error;
  }
};

const materializeMcpDatasetJobAttempt: AiJobHandler = async ({
  assertLease,
  env,
  job,
  reportProgress,
}) => {
  const payload = job.input as { materializationId?: unknown };
  if (typeof payload.materializationId !== "string") {
    throw new PermanentAiJobError("MCP materialization input is invalid.");
  }
  const [materialization] = await db
    .select()
    .from(aiMcpMaterialization)
    .where(
      and(
        eq(aiMcpMaterialization.id, payload.materializationId),
        eq(aiMcpMaterialization.workspaceId, job.workspaceId),
      ),
    )
    .limit(1);
  if (!materialization || !job.userId)
    throw new PermanentAiJobError("MCP materialization was not found.");
  const spec = mcpMaterializationInputSchema
    .and(
      z.object({
        provenance: z.object({
          providers: z.array(z.string().max(160)).max(10),
          tools: z.array(z.string().max(160)).max(100),
        }),
        target: z.object({
          databaseId: z.string().uuid(),
          dataSourceId: z.string().uuid(),
          defaultViewId: z.string().uuid(),
          properties: z
            .array(
              z.object({
                databasePropertyId: z.string().uuid(),
                name: z.string(),
                pagePropertyId: z.string().uuid(),
                sourceColumn: z.string(),
                type: supportedTypeSchema,
              }),
            )
            .max(30),
          views: z
            .array(
              z
                .object({
                  id: z.string().uuid(),
                })
                .and(databaseBlueprintViewSchema),
            )
            .max(10),
        }),
      }),
    )
    .parse(materialization.mapping) as MaterializationSpec;
  const availableDatasets = await db
    .select({ id: aiMcpDataset.id })
    .from(aiMcpDataset)
    .where(and(inArray(aiMcpDataset.id, spec.datasetIds), gt(aiMcpDataset.expiresAt, new Date())));
  if (availableDatasets.length !== spec.datasetIds.length) {
    throw new PermanentAiJobError(
      "Connector source data expired or was disconnected before import.",
    );
  }
  await db
    .update(aiMcpMaterialization)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(aiMcpMaterialization.id, materialization.id));
  await assertLease();

  await ensureMaterializationStructure(
    { assertLease, env, job, reportProgress },
    spec,
    materialization.id,
    job.userId,
  );

  const { completed, failed } = await importReservedRows(
    { assertLease, env, job, reportProgress },
    spec,
    materialization.id,
    job.userId,
  );
  const status = failed > 0 ? "partial" : "succeeded";
  await db
    .update(aiMcpMaterialization)
    .set({
      completedAt: new Date(),
      completedRows: completed,
      failedRows: failed,
      status,
      updatedAt: new Date(),
    })
    .where(eq(aiMcpMaterialization.id, materialization.id));
  await reportProgress(100);
  console.info(
    JSON.stringify({
      completedRows: completed,
      event: "mcp_database_materialization",
      failedRows: failed,
      outcome: status,
    }),
  );
  return {
    completedRows: completed,
    dataSourceId: spec.target.dataSourceId,
    databaseId: spec.target.databaseId,
    failedRows: failed,
    materializationId: materialization.id,
    providers: spec.provenance.providers,
    status,
    tools: spec.provenance.tools,
  };
};

async function markReservation(id: string, status: "inserted" | "failed", errorCode?: string) {
  await db
    .update(aiMcpMaterializationReservation)
    .set({
      errorCode: errorCode ?? null,
      status,
      updatedAt: new Date(),
    })
    .where(eq(aiMcpMaterializationReservation.id, id));
}

function coercePropertyValue(value: unknown, type: z.infer<typeof supportedTypeSchema>) {
  if (value == null) return type === "checkbox" ? false : "";
  if (type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (type === "checkbox") return value === true || value === "true" || value === 1;
  return displayCell(value);
}

function displayCell(value: unknown) {
  if (typeof value === "string") return value.slice(0, 64 * 1024);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  return JSON.stringify(value).slice(0, 64 * 1024);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function materializationPropertyReferences(
  properties: MaterializationSpec["target"]["properties"],
) {
  return new Map(
    properties.flatMap((property) => {
      const record = {
        databasePropertyId: property.databasePropertyId,
        key: property.sourceColumn,
        name: property.name,
        pagePropertyId: property.pagePropertyId,
        type: property.type,
      };
      return [
        [property.name.trim().toLowerCase(), record] as const,
        [property.sourceColumn.trim().toLowerCase(), record] as const,
      ];
    }),
  );
}

function unavailable(code: string, summary: string): AgentToolResult {
  return {
    error: { code, retryable: false },
    ok: false,
    status: "unavailable",
    summary,
  };
}

async function ensureMaterializationStructure(
  { assertLease, env, job, reportProgress }: Parameters<AiJobHandler>[0],
  spec: MaterializationSpec,
  materializationId: string,
  userId: string,
) {
  const [existingDatabase] = await db
    .select({ id: database.id })
    .from(database)
    .where(eq(database.id, spec.target.databaseId))
    .limit(1);
  if (!existingDatabase) {
    await createDatabaseService({
      config: {
        mcpImport: {
          importedAt: new Date().toISOString(),
          materializationId: materializationId,
          oneTime: true,
          providers: spec.provenance.providers,
          sourceUrlColumn: spec.sourceUrlColumn ?? null,
          tools: spec.provenance.tools,
        },
      },
      env,
      name: spec.name,
      newDatabaseId: spec.target.databaseId,
      newDataSourceId: spec.target.dataSourceId,
      newDefaultViewId: spec.target.defaultViewId,
      pageId: spec.pageId,
      standalone: spec.placement === "standalone",
      userId: userId,
      workspaceId: job.workspaceId,
    });
  }
  await reportProgress(5);

  for (const [index, property] of spec.target.properties.entries()) {
    await assertLease();
    const [existing] = await db
      .select({ id: databaseProperty.id })
      .from(databaseProperty)
      .where(eq(databaseProperty.id, property.databasePropertyId))
      .limit(1);
    if (!existing) {
      await createDatabasePropertyService({
        databaseId: spec.target.dataSourceId,
        env,
        name: property.name,
        newDatabasePropertyId: property.databasePropertyId,
        newPagePropertyId: property.pagePropertyId,
        type: property.type,
        userId: userId,
      });
    }
    await reportProgress(
      5 + Math.round(((index + 1) / Math.max(1, spec.target.properties.length)) * 10),
    );
  }

  for (const view of spec.target.views) {
    await assertLease();
    const [existing] = await db
      .select({ id: databaseView.id })
      .from(databaseView)
      .where(eq(databaseView.id, view.id))
      .limit(1);
    if (!existing) {
      const propertiesByReference = materializationPropertyReferences(spec.target.properties);
      await createDatabaseViewService({
        config: resolveDatabaseBlueprintViewConfig(view, propertiesByReference),
        databaseId: spec.target.databaseId,
        dataSourceId: spec.target.dataSourceId,
        env,
        name: view.name,
        newViewId: view.id,
        type: view.type,
        userId: userId,
      });
    }
  }
}

async function loadThreadDatasets(
  input: Parameters<typeof queueMcpMaterialization>[0],
  datasetIds: string[],
  toolExecutionIds: string[],
) {
  return await db
    .select()
    .from(aiMcpDataset)
    .where(
      and(
        or(
          ...(datasetIds.length ? [inArray(aiMcpDataset.id, datasetIds)] : []),
          ...(toolExecutionIds.length
            ? [inArray(aiMcpDataset.toolExecutionId, toolExecutionIds)]
            : []),
        ),
        eq(aiMcpDataset.workspaceId, input.workspaceId),
        eq(aiMcpDataset.userId, input.userId),
        eq(aiMcpDataset.threadId, input.threadId),
        eq(aiMcpDataset.scopeType, input.scope.type),
        input.scope.type === "agent"
          ? eq(aiMcpDataset.agentProfileId, input.scope.agentProfileId)
          : eq(aiMcpDataset.scopeUserId, input.scope.userId),
        gt(aiMcpDataset.expiresAt, new Date()),
      ),
    );
}

function importProperties(spec: z.infer<typeof mcpMaterializationInputSchema>) {
  const mappedProperties = [...spec.properties];
  if (
    spec.sourceUrlColumn &&
    !mappedProperties.some((property) => property.sourceColumn === spec.sourceUrlColumn)
  ) {
    if (mappedProperties.length >= 30) {
      return null;
    }
    mappedProperties.push({
      name: "Source URL",
      sourceColumn: spec.sourceUrlColumn,
      type: "url",
    });
  }
  return mappedProperties;
}

function isTerminalMaterializationFailure(error: unknown, job: Parameters<AiJobHandler>[0]["job"]) {
  return error instanceof PermanentAiJobError || job.attempt >= job.maxAttempts;
}

async function importReservedRows(
  { assertLease, env, reportProgress }: Parameters<AiJobHandler>[0],
  spec: MaterializationSpec,
  materializationId: string,
  userId: string,
) {
  const rowsByDataset = await readDatasetRows(spec.datasetIds);
  const reservations = await db
    .select()
    .from(aiMcpMaterializationReservation)
    .where(eq(aiMcpMaterializationReservation.materializationId, materializationId))
    .orderBy(
      asc(aiMcpMaterializationReservation.datasetId),
      asc(aiMcpMaterializationReservation.sourceRowIndex),
    );
  let completed = reservations.filter((reservation) => reservation.status === "inserted").length;
  let failed = reservations.filter((reservation) => reservation.status === "failed").length;
  for (const reservation of reservations) {
    if (reservation.status !== "reserved") continue;
    await assertLease();
    const row = rowsByDataset.get(reservation.datasetId)?.[reservation.sourceRowIndex];
    if (!row) {
      failed += 1;
      await markReservation(reservation.id, "failed", "source_row_missing");
      continue;
    }
    if (await importReservedRow(env, userId, spec, reservation, row)) completed += 1;
    else failed += 1;
    await db
      .update(aiMcpMaterialization)
      .set({
        completedRows: completed,
        failedRows: failed,
        updatedAt: new Date(),
      })
      .where(eq(aiMcpMaterialization.id, materializationId));
    await reportProgress(
      15 + Math.round(((completed + failed) / Math.max(1, reservations.length)) * 84),
    );
  }
  return { completed, failed };
}

async function readDatasetRows(datasetIds: string[]) {
  const chunks = await db
    .select()
    .from(aiMcpDatasetChunk)
    .where(inArray(aiMcpDatasetChunk.datasetId, datasetIds))
    .orderBy(asc(aiMcpDatasetChunk.datasetId), asc(aiMcpDatasetChunk.chunkIndex));
  const rowsByDataset = new Map<string, Array<Record<string, unknown>>>();
  for (const chunk of chunks) {
    const current = rowsByDataset.get(chunk.datasetId) ?? [];
    if (Array.isArray(chunk.rows)) current.push(...chunk.rows.filter(isRecord));
    rowsByDataset.set(chunk.datasetId, current);
  }
  return rowsByDataset;
}

async function importReservedRow(
  env: RuntimeEnv,
  userId: string,
  spec: MaterializationSpec,
  reservation: typeof aiMcpMaterializationReservation.$inferSelect,
  row: Record<string, unknown>,
): Promise<boolean> {
  try {
    const [existingRow] = await db
      .select({ id: databaseRow.id })
      .from(databaseRow)
      .where(eq(databaseRow.id, reservation.rowId))
      .limit(1);
    if (!existingRow) {
      await createDatabaseRowService({
        databaseId: spec.target.dataSourceId,
        env,
        newPageId: reservation.pageId,
        newRowId: reservation.rowId,
        origin: "ai",
        title: displayCell(row[spec.titleSourceColumn]) || "Untitled",
        userId: userId,
      });
    }
    for (const property of spec.target.properties) {
      await setDatabaseCellValueService({
        databaseId: spec.target.dataSourceId,
        env,
        origin: "ai",
        pagePropertyId: property.pagePropertyId,
        rowId: reservation.rowId,
        userId: userId,
        value: coercePropertyValue(row[property.sourceColumn], property.type),
      });
    }
    await markReservation(reservation.id, "inserted");
    return true;
  } catch (error) {
    if (!(error instanceof ServiceMutationError) || error.status >= 500) throw error;
    await markReservation(reservation.id, "failed", "row_validation_failed");
    return false;
  }
}
