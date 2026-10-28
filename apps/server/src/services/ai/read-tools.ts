import { workspaceSearchRequestSchema } from "@zilobase/features/search";
import { searchWorkspaceUsersOperation } from "../search/users";
import { listTeamspacesOperation } from "../teamspaces/operations";
import { recordDebugEvent } from "./debug";
import { createHash, randomUUID } from "node:crypto";
import type { AiDiagnostics } from "./diagnostics";
import { tool } from "ai";
import { z } from "zod";
import {
  sourceRecordQuerySchema,
  type ChatToolName,
  type ChatToolActivity,
  type SourceReadRevision,
  type SourceRecordPosition,
} from "@zilobase/features/runtime";
import type { ContextManifestEntry, ResourceRef } from "@zilobase/page-context";
import { readDocumentWindow, readPageIdentity } from "../pages/read/document-window";
import {
  aggregateSourceRecords,
  authorizeSourceRead,
  describeDatabaseSource,
  readDatabaseMetadataRevision,
  querySourceRecords,
} from "../databases/read/source-query";
import {
  runServerOperation,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { authorizeChatWorkspace } from "./context";
import { searchWorkspaceOperation } from "../search/operations";
import { readProgressKey, updateReadCoverage, type AgentState } from "./agent-state";
import {
  restoreAgentKnowledge,
  rememberInspection,
  rememberRead,
  inspectionKey,
  forgetDatabaseKnowledge,
  markReadUnavailable,
  type InspectionInput,
} from "./agent-memory";

const id = z.string().min(1).max(128);
const cursor = z.string().max(128).nullable().default(null);
const responseMode = z
  .enum(["list", "read"])
  .default("read")
  .describe(
    'Use "list" when the user only wants to find, locate, or list pages/databases. Matches are returned as links and the turn ends without reading them. Use "read" for summaries, explanations, comparisons, or other questions about content. User lookup is an intermediate step and does not end the turn.',
  );
const searchSchema = workspaceSearchRequestSchema.safeExtend({ responseMode });
const semanticSearchSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .describe("A natural-language question or concept to find by meaning."),
    types: z
      .array(z.literal("page"))
      .max(1)
      .default([])
      .describe("Semantic search indexes pages, including database row pages."),
    limit: z.number().int().min(1).max(50).default(10),
    responseMode,
  })
  .strict();
const describeSchema = z
  .object({
    type: z.enum(["page", "database"]),
    id: id.describe("The pageId or databaseId matching type. Never a dataSourceId."),
    dataSourceId: id
      .describe("A dataSourceId returned by section=sources. It is not a pageId.")
      .nullable()
      .default(null),
    section: z.enum(["sources", "properties", "views"]).default("sources"),
    cursor,
  })
  .strict();
const pageSchema = z
  .object({
    pageId: id.describe(
      "A mentioned page ID or pageId discovered in record/reference results. Never a dataSourceId or recordId.",
    ),
    cursor,
  })
  .strict();
const recordsSchema = sourceRecordQuerySchema
  .extend({
    databaseId: id.describe("The mentioned/discovered databaseId."),
    dataSourceId: id.describe("A dataSourceId from describe_source(section=sources)."),
    propertyIds: z
      .array(id)
      .max(20)
      .default([])
      .describe(
        "propertyIds returned by describe_source(section=properties). Empty reads record identities without property values.",
      ),
    cursor,
  })
  .strict();
const recordSchema = z
  .object({
    databaseId: id.describe("The record's databaseId."),
    dataSourceId: id.describe("The record's dataSourceId, not a pageId."),
    recordId: id.describe("A recordId returned by query_records, not its pageId."),
    propertyIds: z.array(id).max(20).default([]),
  })
  .strict();
const aggregateSchema = recordsSchema
  .omit({
    limit: true,
    recordId: true,
    sort: true,
    sortPropertyId: true,
    direction: true,
    propertyIds: true,
    cursor: true,
  })
  .extend({
    operation: z.enum(["count", "sum", "avg", "min", "max"]),
    propertyId: id.nullable().default(null),
  })
  .strict();
export const readToolSchemas = {
  search_workspace: searchSchema,
  semantic_search_workspace: semanticSearchSchema,
  describe_source: describeSchema,
  read_page: pageSchema,
  query_records: recordsSchema,
  read_record: recordSchema,
  aggregate_records: aggregateSchema,
};
export const readToolSchemaText = JSON.stringify(
  Object.fromEntries(
    Object.entries(readToolSchemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { io: "input" }),
    ]),
  ),
);

export type ReadToolDependencies = {
  teamspaces?: typeof listTeamspacesOperation;
  search: typeof searchWorkspaceOperation;
  users: typeof searchWorkspaceUsersOperation;
  document: typeof readDocumentWindow;
  describe: typeof describeDatabaseSource;
  query: typeof querySourceRecords;
  aggregate: typeof aggregateSourceRecords;
  authorizeDatabase: typeof authorizeSourceRead;
  authorizePage: typeof readPageIdentity;
  authorizeWorkspace: typeof authorizeChatWorkspace;
  metadataRevision?: typeof readDatabaseMetadataRevision;
};
const dependencies: ReadToolDependencies = {
  teamspaces: listTeamspacesOperation,
  search: searchWorkspaceOperation,
  users: searchWorkspaceUsersOperation,
  document: readDocumentWindow,
  describe: describeDatabaseSource,
  query: querySourceRecords,
  aggregate: aggregateSourceRecords,
  authorizeDatabase: authorizeSourceRead,
  authorizePage: readPageIdentity,
  authorizeWorkspace: authorizeChatWorkspace,
  metadataRevision: readDatabaseMetadataRevision,
};

export async function readChatLocations(
  context: ServerOperationContext,
  workspaceId: string,
  ports: ReadToolDependencies = dependencies,
) {
  const result = await ports.teamspaces?.(
    { ...context, pinnedWorkspaceId: workspaceId },
    { workspaceId },
  );
  return result?.teamspaces.map(({ id, name }) => ({ id, name })) ?? [];
}

/** Do not replay retained inspection metadata after access revocation or a revision change. */
export async function revalidateReadKnowledge(
  context: ServerOperationContext,
  state: AgentState,
  ports: ReadToolDependencies = dependencies,
) {
  if (!ports.metadataRevision || !state.knowledge) return;
  const scoped = { ...context, pinnedWorkspaceId: state.workspaceId };
  const checks = new Map<string, { databaseId: string; dataSourceId?: string; revision: string }>();
  for (const entry of state.knowledge.inspections)
    checks.set(JSON.stringify([entry.input.id, entry.input.dataSourceId]), {
      databaseId: entry.input.id,
      dataSourceId: entry.input.dataSourceId ?? undefined,
      revision: entry.revision,
    });
  for (const source of state.knowledge.sources)
    if (source.revision)
      checks.set(JSON.stringify([source.databaseId, source.dataSourceId]), {
        databaseId: source.databaseId,
        dataSourceId: source.dataSourceId,
        revision: source.revision,
      });
  for (const check of checks.values()) {
    try {
      await ports.authorizeWorkspace(scoped, state.workspaceId);
      if ((await ports.metadataRevision(scoped, check)) !== check.revision)
        forgetDatabaseKnowledge(state, check.databaseId);
    } catch (error) {
      forgetDatabaseKnowledge(state, check.databaseId);
      if (error instanceof ServerOperationError && [403, 404].includes(error.status)) {
        state.progress.stopReason = "source_unavailable";
        throw new Error("CHAT_SOURCE_UNAVAILABLE");
      }
      throw error;
    }
  }
}
const key = (resource: ResourceRef) => `${resource.type}:${resource.id}`;
function metadataEntry(
  section: string,
  databaseId: string,
  dataSourceId: string | null,
  entry: Record<string, unknown> & { id: string },
) {
  const { id, ...metadata } = entry;
  return {
    ...metadata,
    kind: section === "sources" ? "data_source" : section === "properties" ? "property" : "view",
    databaseId,
    ...(section === "sources"
      ? { dataSourceId: id }
      : { dataSourceId, [section === "properties" ? "propertyId" : "viewId"]: id }),
  };
}
const fingerprint = (name: string, input: Record<string, unknown>) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        name,
        Object.fromEntries(
          Object.entries(input)
            .filter(([k]) => !["cursor", "limit"].includes(k))
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ]),
    )
    .digest("hex");
class ReadToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public recovery?: { tool: ChatToolName; input: Record<string, unknown> },
  ) {
    super(message);
  }
}
const fail = (
  detail: string,
  recovery?: { tool: ChatToolName; input: Record<string, unknown> },
): never => {
  const separator = detail.indexOf(":");
  throw new ReadToolError(
    separator < 0 ? detail : detail.slice(0, separator),
    separator < 0 ? detail : detail.slice(separator + 1).trim(),
    recovery,
  );
};

export function createReadTools(
  context: ServerOperationContext,
  state: AgentState,
  options: {
    signal: AbortSignal;
    changed?: () => Promise<void>;
    dependencies?: ReadToolDependencies;
    diagnostics?: AiDiagnostics;
  },
) {
  const ports = options.dependencies ?? dependencies;
  restoreAgentKnowledge(state);
  const scoped = { ...context, pinnedWorkspaceId: state.workspaceId };
  const check = () => {
    options.signal.throwIfAborted();
    if (Date.now() > state.expiresAt) fail("CURSOR_EXPIRED");
  };
  const assertGrant = async (resource: ResourceRef, seen = new Set<string>()) => {
    const grant = state.grants.find((g) => key(g.resource) === key(resource));
    if (!grant || seen.has(key(resource)) || seen.size >= 8) {
      const source =
        resource.type === "page" &&
        state.knowledge!.sources.find((entry) => entry.dataSourceId === resource.id);
      if (source) {
        await assertGrant({ type: "database", id: source.databaseId }, seen);
        await ports.authorizeDatabase(scoped, source.databaseId, source.dataSourceId);
        fail(
          `RESOURCE_TYPE_MISMATCH: ${resource.id} is a dataSourceId, not a pageId. Call query_records with databaseId=${source.databaseId} and dataSourceId=${source.dataSourceId}; use returned pageIds with read_page.`,
          {
            tool: "query_records",
            input: { databaseId: source.databaseId, dataSourceId: source.dataSourceId },
          },
        );
      }
      fail(
        "OUT_OF_SCOPE: discover this source with search_workspace or semantic_search_workspace, or mention it before reading it",
      );
    }
    seen.add(key(resource));
    if (grant!.parent) {
      await assertGrant(grant!.parent, seen);
      if (grant!.parent.type === "database")
        await ports.authorizeDatabase(scoped, grant!.parent.id, grant!.sourceId);
      else await ports.authorizePage(scoped, grant!.parent.id);
    }
  };
  const grant = (resource: ResourceRef, parent?: ResourceRef, sourceId?: string) => {
    if (state.grants.some((g) => key(g.resource) === key(resource))) return;
    state.grants.push({ resource, parent, sourceId });
  };
  const evidence = (entry: Omit<ContextManifestEntry, "provenance">, revision: unknown) => {
    const record: ContextManifestEntry = {
      ...entry,
      title: entry.title.slice(0, 512),
      provenance: {
        capturedAt: new Date().toISOString(),
        origin: "saved",
        revision: JSON.stringify(revision),
      },
    };
    const index = state.context.manifest.findIndex((e) => e.key === entry.key);
    if (index >= 0) state.context.manifest[index] = record;
    else state.context.manifest.push(record);
  };
  const readCursor = (name: string, input: Record<string, unknown>) => {
    if (!input.cursor) return undefined;
    const value = state.cursors[String(input.cursor)];
    if (!value || value.expiresAt < Date.now())
      fail("CURSOR_EXPIRED: restart this query without a cursor");
    if (value.fingerprint !== fingerprint(name, input))
      fail("INVALID_CURSOR: cursor belongs to a different query");
    return value;
  };
  const continuation = (
    name: ChatToolName,
    input: Record<string, unknown>,
    revision: unknown,
    position: unknown,
    hasMore: boolean,
  ) => {
    const hash = fingerprint(name, input);
    delete state.pending[hash];
    if (input.cursor) delete state.cursors[String(input.cursor)];
    let nextCursor: string | null = null;
    if (hasMore) {
      // Replace the consumed cursor; retained cursors are bounded with the source graph.
      nextCursor = randomUUID();
      state.cursors[nextCursor] = {
        fingerprint: hash,
        revision,
        position,
        expiresAt: state.expiresAt,
      };
      state.pending[hash] = { name, input: { ...input, cursor: nextCursor } };
    }
    updateReadCoverage(state);
    return nextCursor;
  };
  let active = 0;
  let findingSources = false;
  const waiters: Array<() => void> = [];
  const execute = async (
    name: ChatToolName,
    input: Record<string, unknown>,
    toolCallId: string,
    run: () => Promise<unknown>,
  ) => {
    check();
    const startedAt = performance.now();
    const debugDetail = { tool: name, toolCallId };
    recordDebugEvent(state, "tool.call", input, debugDetail);
    state.calls++;
    const isSearch = name === "search_workspace" || name === "semantic_search_workspace";
    const source = isSearch
      ? undefined
      : name === "read_page"
        ? { type: "page" as const, id: String(input.pageId) }
        : name === "describe_source"
          ? { type: input.type as "page" | "database", id: String(input.id) }
          : {
              type: "database" as const,
              id: String(input.databaseId),
              dataSourceId: String(input.dataSourceId),
            };
    const activity = {
      id: toolCallId,
      name,
      source,
      ...(isSearch ? { query: String(input.query) } : {}),
      status: "running" as "running" | "completed" | "failed",
      label:
        name === "search_workspace" && input.queryType === "user"
          ? "Finding workspace users"
          : {
              search_workspace: "Searching workspace by keyword",
              semantic_search_workspace: "Searching workspace by meaning",
              describe_source: "Inspecting source",
              read_page: "Reading page",
              query_records: "Reading records",
              read_record: "Reading record",
              aggregate_records: "Calculating totals",
            }[name],
      returned: undefined as number | undefined,
      hasMore: undefined as boolean | undefined,
      error: undefined as string | undefined,
      cached: undefined as boolean | undefined,
      searchMetadata: undefined as ChatToolActivity["searchMetadata"],
    };
    state.progress.activities.push(activity);
    const queuedAt = performance.now();
    while (active >= 3) {
      await new Promise<void>((resolve) => waiters.push(resolve));
      check();
    }
    active++;
    const timing = options.diagnostics?.start("tool", {
      tool: name,
      toolCallId,
      calls: state.calls,
      waitMs: performance.now() - queuedAt,
    });
    try {
      await options.changed?.();
      const read = () =>
        runServerOperation(
          scoped,
          async () => {
            check();
            await ports.authorizeWorkspace(scoped, state.workspaceId);
            if (
              state.searchListing ||
              ((findingSources || state.intent?.mode === "list") && !isSearch)
            )
              fail("SEARCH_COMPLETE: return the matching source list; no further reads are needed");
            if (
              ["query_records", "read_record", "aggregate_records"].includes(name) &&
              ports.metadataRevision
            ) {
              const retained = state.knowledge!.operations?.find(
                (entry) => entry.key === JSON.stringify([name, input]),
              );
              const revision = retained?.result.revision as SourceReadRevision | undefined;
              if (
                retained &&
                (retained.result.coverage as { complete?: boolean } | undefined)?.complete &&
                revision
              ) {
                const databaseId = String(input.databaseId);
                await assertGrant({ type: "database", id: databaseId });
                await ports.authorizeDatabase(scoped, databaseId, String(input.dataSourceId));
                const live = await ports.metadataRevision(scoped, {
                  databaseId,
                  dataSourceId: String(input.dataSourceId),
                });
                const expected = `${revision.database}:${revision.source}`;
                if (live === expected || live.startsWith(`${expected}:`))
                  return { ...retained.result, cached: true };
              }
            }
            return run();
          },
          { onTiming: options.diagnostics?.databaseTiming("tool") },
        );
      const result = options.diagnostics
        ? await options.diagnostics.measure("tool_read", read, { tool: name, toolCallId })
        : await read();
      check();
      activity.status = "completed";
      if (!isSearch && result && typeof result === "object" && !("error" in result)) {
        const object = result as Record<string, unknown>;
        const operationKey = JSON.stringify([name, input]);
        const { cached: _cached, continuation: _continuation, ...stable } = object;
        const signature = JSON.stringify(stable);
        const progress = readProgressKey(state);
        if (state.knowledge!.stalledProgress && state.knowledge!.stalledProgress !== progress) {
          if (state.progress.stopReason === "no_progress") delete state.progress.stopReason;
          delete state.knowledge!.stalledProgress;
        }
        const operations = (state.knowledge!.operations ??= []);
        const previous = operations.find((entry) => entry.key === operationKey);
        const previousActivity = state.progress.activities.at(-2);
        const duplicateInspection =
          previousActivity?.name === name && previousActivity.status === "completed";
        if (
          (name !== "describe_source" || duplicateInspection) &&
          previous?.signature === signature &&
          previous.progress === progress
        ) {
          activity.cached = true;
          state.knowledge!.stalledProgress = progress;
          state.progress.stopReason = "no_progress";
        }
        state.knowledge!.operations = operations.filter((entry) => entry.key !== operationKey);
        state.knowledge!.operations.push({
          key: operationKey,
          tool: name,
          input,
          signature,
          progress,
          result: object,
        });
      }
      if (source)
        state.knowledge!.unavailable = state.knowledge!.unavailable.filter(
          (entry) => entry !== `${source.type}:${source.id}`,
        );
      if (result && typeof result === "object" && "cached" in result)
        activity.cached = activity.cached || result.cached === true;
      if (result && typeof result === "object" && "searchMetadata" in result)
        activity.searchMetadata = result.searchMetadata as typeof activity.searchMetadata;
      if (result && typeof result === "object" && "coverage" in result) {
        const coverage = result.coverage as { returned?: number; complete: boolean };
        activity.returned = coverage.returned;
        activity.hasMore = !coverage.complete;
      }
      recordDebugEvent(state, "tool.result", result, {
        ...debugDetail,
        durationMs: performance.now() - startedAt,
      });
      updateReadCoverage(state);
      await options.changed?.();
      return result;
    } catch (error) {
      check();
      activity.status = "failed";
      activity.error =
        error instanceof ServerOperationError
          ? [403, 404].includes(error.status)
            ? "SOURCE_UNAVAILABLE"
            : String(error.body.error).slice(0, 512)
          : error instanceof ReadToolError
            ? error.code.slice(0, 512)
            : "READ_FAILED";
      if (source && error instanceof ServerOperationError && [403, 404].includes(error.status)) {
        markReadUnavailable(state, source);
      }
      const result = {
        ...(error instanceof ReadToolError && error.recovery ? { next: error.recovery } : {}),
        error: {
          code: activity.error,
          message:
            error instanceof ReadToolError
              ? error.message
              : "Do not infer content from a failed read. Correct the query or explain the limitation.",
        },
      };
      recordDebugEvent(state, "tool.result", result, {
        ...debugDetail,
        durationMs: performance.now() - startedAt,
      });
      updateReadCoverage(state);
      await options.changed?.();
      return result;
    } finally {
      timing?.({ outcome: activity.status, returned: activity.returned });
      active--;
      waiters.shift()?.();
    }
  };
  const pageRead = async (
    name: "read_page" | "describe_source",
    input: Record<string, unknown>,
    pageId: string,
    outline = false,
  ) => {
    const parent: ResourceRef = { type: "page", id: pageId };
    await assertGrant(parent);
    if (state.continuation && !input.cursor) {
      const pending = Object.values(state.pending).find(
        (read) => read.name === name && read.input.pageId === pageId,
      );
      if (pending)
        fail("READ_IN_PROGRESS: resume the existing cursor instead of restarting this page", {
          tool: pending.name,
          input: pending.input,
        });
      if (
        state.knowledge!.reads.some(
          (read) => read.tool === name && read.resource.id === pageId && read.complete,
        )
      )
        fail("ALREADY_READ: this page is complete; continue another unfinished source");
    }
    const previous = readCursor(name, input);
    const result = await ports.document(scoped, {
      pageId,
      outline,
      offset: previous?.position as number | undefined,
      revision: previous?.revision as string | undefined,
    });
    const entries = result.entries;
    const hasMore = result.hasMore || entries.length < result.entries.length;
    const nextCursor = continuation(
      name,
      input,
      result.revision,
      result.offset + entries.length,
      hasMore,
    );
    for (const entry of entries) if (entry.kind === "reference") grant(entry.resource, parent);
    rememberRead(state, name, parent, !hasMore, entries.length);
    evidence(
      { key: `page:${pageId}`, type: "page", id: pageId, title: result.title, pageId },
      result.revision,
    );
    return {
      ...(result.verification ? { verification: result.verification } : {}),
      title: result.title.slice(0, 512),
      revision: result.revision,
      entries,
      evidence: [`[[page:${pageId}]]`],
      coverage: {
        scope: outline ? "outline" : "page",
        complete: !hasMore,
        returned: entries.length,
      },
      continuation: { nextCursor },
    };
  };
  const queryRead = async (name: "query_records" | "read_record", raw: Record<string, unknown>) => {
    const { cursor: _cursor, ...args } = raw;
    const query = sourceRecordQuerySchema.parse(args);
    const parent: ResourceRef = { type: "database", id: query.databaseId };
    await assertGrant(parent);
    const previous = readCursor(name, raw);
    const result = await ports.query(
      scoped,
      query,
      previous?.position as SourceRecordPosition | undefined,
      previous?.revision as SourceReadRevision | undefined,
    );
    const typedRecord = ({ id, ...record }: (typeof result.records)[number]) => ({
      ...record,
      kind: "record",
      recordId: id,
      databaseId: query.databaseId,
      dataSourceId: query.dataSourceId,
    });
    const properties = result.properties.map(({ id, ...property }) => ({
      ...property,
      kind: "property",
      propertyId: id,
    }));
    const records = result.records;
    const hasMore = result.hasMore || records.length < result.records.length;
    const nextCursor = continuation(
      name,
      raw,
      result.revision,
      result.positions[records.length - 1],
      hasMore,
    );
    evidence(
      {
        key: `database:${query.databaseId}`,
        type: "database",
        id: query.databaseId,
        title: "Database",
        databaseId: query.databaseId,
      },
      result.revision,
    );
    evidence(
      {
        key: `source:${query.dataSourceId}`,
        type: "source",
        id: query.dataSourceId,
        title: "Records",
        databaseId: query.databaseId,
        sourceId: query.dataSourceId,
      },
      result.revision,
    );
    for (const record of records) {
      grant({ type: "page", id: record.pageId }, parent, query.dataSourceId);
      evidence(
        {
          key: `record:${query.dataSourceId}:${record.id}`,
          type: "record",
          id: record.id,
          title: record.name,
          databaseId: query.databaseId,
          sourceId: query.dataSourceId,
          pageId: record.pageId,
        },
        result.revision,
      );
      for (const property of result.properties)
        if (property.type === "relation") {
          const value = record.values[property.id];
          for (const pageId of Array.isArray(value) ? value : [value])
            if (typeof pageId === "string" && pageId.length <= 128)
              grant({ type: "page", id: pageId }, parent, query.dataSourceId);
        }
    }
    rememberRead(state, name, parent, !hasMore, records.length, query.dataSourceId);
    return {
      revision: result.revision,
      records: records.map(typedRecord),
      properties,
      next: "Use recordId with read_record for selected properties. Use the returned pageId with read_page for page bodies. Follow nextCursor with the same query for more records.",
      evidence: [`[[source:${query.dataSourceId}]]`],
      coverage: {
        scope: "matching-records",
        complete: !hasMore,
        returned: records.length,
        total: null,
      },
      continuation: { nextCursor },
    };
  };
  const search = (
    name: "search_workspace" | "semantic_search_workspace",
    input: z.infer<typeof searchSchema> | z.infer<typeof semanticSearchSchema>,
    toolCallId: string,
    mode: "keyword" | "semantic",
  ) => {
    if (!("queryType" in input && input.queryType === "user") && state.intent) {
      input = { ...input, responseMode: state.intent.mode };
      if (mode === "keyword") {
        if (state.intent.mode === "list" && state.intent.keywordQuery !== null)
          input = { ...input, query: state.intent.keywordQuery };
        if (state.intent.teamspaceIds?.length)
          input = {
            ...input,
            filters: {
              ...("filters" in input ? input.filters : {}),
              teamspaceIds: state.intent.teamspaceIds,
            },
          };
      } else if (state.intent.teamspaceIds?.length) {
        return execute(name, input, toolCallId, async () =>
          fail(
            "STRUCTURED_SEARCH_REQUIRED: use search_workspace for the requested teamspace constraint",
          ),
        );
      }
    }
    if (mode === "keyword") input = searchSchema.parse(input);
    if (input.responseMode === "list" && !("queryType" in input && input.queryType === "user"))
      findingSources = true;
    return execute(name, input, toolCallId, async () => {
      if (state.continuation) {
        state.progress.stopReason = "no_progress";
        fail("CONTINUATION_READS_ONLY: resume retained unfinished reads; do not search again");
      }
      const searchKey = fingerprint(name, { ...input, requestedLimit: input.limit });
      const searchKeys = (state.knowledge!.searchKeys ??= []);
      if (searchKeys.includes(searchKey)) {
        state.progress.stopReason = "no_progress";
        fail("NO_PROGRESS: this search already completed; use its matches instead of repeating it");
      }
      if ("queryType" in input && input.queryType === "user") {
        const { responseMode: _responseMode, ...request } = input;
        const found = await ports.users(scoped, { workspaceId: state.workspaceId, request });
        searchKeys.push(searchKey);
        const users = found.users.slice(0, input.limit);
        return {
          type: "user_search",
          users,
          exhaustive: false,
          coverage: {
            scope: "workspace-users",
            complete: users.length === found.users.length,
            returned: users.length,
            total: null,
          },
          next: "Use returned user IDs in createdByUserIds or editedByUserIds. User matches grant no content access and are not citation evidence.",
        };
      }
      const matches = await ports.search(scoped, {
        workspaceId: state.workspaceId,
        q: input.query,
        mode,
        ...(mode === "semantic" ? { purpose: "question_answering" as const } : {}),
        types: input.types.join(","),
        limit: input.limit,
        ...("filters" in input && input.filters ? { filters: input.filters } : {}),
        ...("sort" in input && input.sort ? { sort: input.sort } : {}),
      });
      searchKeys.push(searchKey);
      const results = matches.results.slice(0, input.limit).map((match) => ({
        type: match.type,
        id: match.id,
        title: match.title.slice(0, 256),
        path: match.path.slice(0, 256),
        excerpt: match.excerpt?.slice(0, 280) ?? null,
        updatedAt: match.updatedAt.toISOString(),
        ...(match.createdAt
          ? {
              createdAt: match.createdAt,
              createdById: match.createdById ?? null,
              lastEditedAt: match.lastEditedAt,
              lastEditedById: match.lastEditedById ?? null,
            }
          : {}),
        ...(match.verification ? { verification: match.verification } : {}),
        ...(match.match ? { match: match.match } : {}),
      }));
      // Only matches actually returned to the model become traversable. Search
      // snippets never enter the evidence manifest; reads recheck source access.
      for (const result of results) {
        grant({ type: result.type, id: result.id });
        if (result.match?.kind === "property" && result.match.databaseId)
          grant({ type: "database", id: result.match.databaseId });
      }
      if (input.responseMode === "list")
        state.searchListing = {
          ...("metadata" in matches ? { searchMetadata: matches.metadata } : {}),
          matches: [
            ...new Map(
              [
                ...(state.searchListing?.matches ?? []),
                ...results.map(({ type, id, title }) => ({ type, id, title })),
              ].map((match) => [`${match.type}:${match.id}`, match]),
            ).values(),
          ].slice(0, input.limit),
        };
      return {
        ...(mode === "keyword" ? { type: "workspace_search" } : {}),
        results,
        exhaustive: false,
        ...("metadata" in matches ? { searchMetadata: matches.metadata } : {}),
        coverage: {
          scope: "ranked-search-results",
          complete: results.length === matches.results.length,
          returned: results.length,
          total: null,
        },
        next:
          input.responseMode === "list"
            ? "The source list completes this request. Stop calling tools; page bodies were not read."
            : "Read important matches before relying on their content or citing them; listing search matches needs no page read. Search is bounded and not exhaustive; no matches does not prove absence. Use match locations to guide live reads. Property match references identify the record and property to read; indexed excerpts alone never establish evidence. Refine the question or types for other matches.",
      };
    });
  };
  return {
    search_workspace: tool({
      description:
        "Search accessible pages and databases by keywords or exact controls: locations (page/subtree, data source, teamspace), creators, latest editors, created/edited date ranges, titleOnly, verification status, and sorting. Use me for the current user in creator/editor filters. Empty query requires a narrowing filter or a single type. Dates require ISO timestamps with offsets. queryType=user looks up workspace users by name/email and rejects content filters, types and sorting. Use returned user IDs in content filters. User matches grant no content access. Use this tool for precise constraints, date ordering and filter-only discovery. This is independent of semantic_search_workspace and works without an embedding index. Results are bounded keyword-ranked discovery hints, not citation evidence or an exhaustive inventory. Read important matches before relying on their content; listing matches needs no page read. Refine keywords or types for other matches; there is no search cursor.",
      inputSchema: searchSchema,
      execute: (input, { toolCallId }) => search("search_workspace", input, toolCallId, "keyword"),
    }),
    semantic_search_workspace: tool({
      description:
        "Search accessible indexed pages in the current workspace by meaning. Use natural-language questions, concepts and paraphrases, including database row content and supported properties. Ranking uses semantic similarity only, independently of search_workspace. Unavailable semantic search returns no matches; consult searchMetadata for the reason. Results are bounded discovery hints, not citation evidence or an exhaustive inventory. Read body matches with read_page. Read property matches with read_record using the supplied databaseId, dataSourceId, recordId and propertyId. Refine the question for other matches; there is no search cursor.",
      inputSchema: semanticSearchSchema,
      execute: (input, { toolCallId }) =>
        search("semantic_search_workspace", input, toolCallId, "semantic"),
    }),
    describe_source: tool({
      description:
        "Inspect a page outline or database metadata. section=sources returns data_source entries with dataSourceId, NOT pages. Then query_records to get records and their pageIds; inspect properties only when property values/filters are needed. Views are optional metadata, not records. Reuse inspected metadata. Follow nextCursor for remaining metadata.",
      inputSchema: describeSchema,
      execute: (input, { toolCallId }) =>
        execute("describe_source", input, toolCallId, async () => {
          if (input.type === "page") return pageRead("describe_source", input, input.id, true);
          await assertGrant({ type: "database", id: input.id });
          const previous = readCursor("describe_source", input);
          const inspectionInput: InspectionInput = { ...input, type: "database" };
          const cached = state.knowledge!.inspections.find(
            (entry) => entry.key === inspectionKey(inspectionInput),
          );
          // Consumed cursors cannot be revived by a cache hit. First-page complete inspections are reusable.
          if (
            cached &&
            !input.cursor &&
            !cached.result.continuation?.nextCursor &&
            ports.metadataRevision
          ) {
            try {
              const revision = await ports.metadataRevision(scoped, {
                databaseId: input.id,
                dataSourceId: input.dataSourceId ?? undefined,
              });
              if (revision === cached.revision) {
                if (input.dataSourceId)
                  evidence(
                    {
                      key: `source:${input.dataSourceId}`,
                      type: "source",
                      id: input.dataSourceId,
                      databaseId: input.id,
                      sourceId: input.dataSourceId,
                      title: String(cached.result.title),
                    },
                    revision,
                  );
                cached.hits++;
                state.knowledge!.repeatedInspections++;
                return { ...cached.result, cached: true };
              }
              forgetDatabaseKnowledge(state, input.id);
            } catch (error) {
              forgetDatabaseKnowledge(state, input.id);
              throw error;
            }
          }
          const result = await ports.describe(scoped, {
            databaseId: input.id,
            dataSourceId: input.dataSourceId ?? undefined,
            section: input.section,
            after: previous?.position as string | undefined,
            revision: previous?.revision as string | undefined,
          });
          const typedEntry = (entry: (typeof result.entries)[number]) =>
            metadataEntry(input.section, input.id, input.dataSourceId, entry);
          const entries = result.entries;
          const hasMore = result.hasMore || entries.length < result.entries.length;
          const nextCursor = continuation(
            "describe_source",
            input,
            result.revision,
            entries.at(-1)?.id,
            hasMore,
          );
          evidence(
            {
              key: `database:${input.id}`,
              type: "database",
              id: input.id,
              title: result.title,
              databaseId: input.id,
            },
            result.revision,
          );
          if (input.dataSourceId)
            evidence(
              {
                key: `source:${input.dataSourceId}`,
                type: "source",
                id: input.dataSourceId,
                databaseId: input.id,
                sourceId: input.dataSourceId,
                title: result.title,
              },
              result.revision,
            );
          const response = {
            ...(result.verification ? { verification: result.verification } : {}),
            title: result.title.slice(0, 512),
            kind: "database_metadata",
            databaseId: input.id,
            dataSourceId: input.dataSourceId,
            revision: result.revision,
            section: result.section,
            entries: entries.map(typedEntry),
            next:
              input.section === "sources"
                ? "These entries are database data sources, not pages. Use their dataSourceId with query_records (or inspect properties for needed values/filters). To summarize pages inside the database, query_records first, then read_page using returned pageIds."
                : "Use propertyId values with query_records or aggregate_records as needed. Read records before summarizing their content; inspect views only if the question needs view metadata.",
            evidence: [`[[database:${input.id}]]`],
            coverage: { scope: input.section, complete: !hasMore, returned: entries.length },
            continuation: { nextCursor },
          };
          rememberInspection(state, inspectionInput, response);
          state.knowledge!.repeatedInspections = 0;
          return response;
        }),
    }),
    read_page: tool({
      description:
        "Read saved page content in bounded chunks. References in returned entries can be read next. Continue with nextCursor; never claim the full page was read while more chunks remain.",
      inputSchema: pageSchema,
      execute: (input, { toolCallId }) =>
        execute("read_page", input, toolCallId, () => pageRead("read_page", input, input.pageId)),
    }),
    query_records: tool({
      description:
        "Read a page of source records. Choose propertyIds from describe_source; only requested properties are returned. Filters are ANDed, including effective default statuses, independently of view filters. Sort supports id/name/createdAt/updatedAt, or sortPropertyId for a scalar property with direction asc/desc and missing values last. Computed-property values/filters/sorts and saved-view queries are unsupported. Pass the same query with nextCursor for more records. Record page bodies require read_page.",
      inputSchema: recordsSchema,
      execute: (input, { toolCallId }) =>
        execute("query_records", input, toolCallId, () => queryRead("query_records", input)),
    }),
    read_record: tool({
      description:
        "Read selected properties of one record in a mentioned/discovered database source. The returned pageId can be read with read_page.",
      inputSchema: recordSchema,
      execute: (input, { toolCallId }) =>
        execute("read_record", input, toolCallId, () => queryRead("read_record", input)),
    }),
    aggregate_records: tool({
      description:
        "Compute an exact count, or sum/avg/min/max of a numeric property over all matching source records on the server. Uses the same scalar AND filters as query_records. Never count sampled pages yourself. Grouping and computed properties are unsupported.",
      inputSchema: aggregateSchema,
      execute: (input, { toolCallId }) =>
        execute("aggregate_records", input, toolCallId, async () => {
          await assertGrant({ type: "database", id: input.databaseId });
          const query = sourceRecordQuerySchema.parse({
            databaseId: input.databaseId,
            dataSourceId: input.dataSourceId,
            filters: input.filters,
            nameContains: input.nameContains,
          });
          const result = await ports.aggregate(
            scoped,
            query,
            input.operation,
            input.propertyId ?? undefined,
          );
          evidence(
            {
              key: `source:${input.dataSourceId}`,
              type: "source",
              id: input.dataSourceId,
              title: "Aggregate",
              databaseId: input.databaseId,
              sourceId: input.dataSourceId,
            },
            result.revision,
          );
          rememberRead(
            state,
            "aggregate_records",
            { type: "database", id: input.databaseId },
            true,
            result.matchingRecords,
            input.dataSourceId,
          );
          return {
            ...result,
            evidence: [`[[source:${input.dataSourceId}]]`],
            coverage: {
              scope: "matching-records",
              complete: true,
              returned: result.matchingRecords,
            },
          };
        }),
    }),
  };
}
