import type { ModelMessage } from "ai";
import type { ResourceRef } from "@zilobase/page-context";
import type { ChatToolName } from "@zilobase/features/runtime";
import type { AgentState } from "./agent-state";

export type InspectionInput = {
  type: "database";
  id: string;
  dataSourceId: string | null;
  section: string;
  cursor: string | null;
};
type InspectionResult = Record<string, unknown> & {
  entries?: Array<Record<string, unknown>>;
  coverage?: { complete?: boolean; returned?: number };
  continuation?: { nextCursor?: string | null };
};
type LegacyToolInput = Record<string, unknown> & {
  id: string;
  pageId: string;
  databaseId: string;
  dataSourceId?: string;
  section?: string;
  cursor?: string;
};
type Inspection = {
  key: string;
  input: InspectionInput;
  revision: string;
  result: InspectionResult;
  hits: number;
};
export type AgentKnowledge = {
  sources: Array<{
    databaseId: string;
    dataSourceId: string;
    name: string;
    recordsRead: boolean;
    revision?: string;
  }>;
  inspections: Inspection[];
  reads: Array<{
    tool: ChatToolName;
    resource: ResourceRef;
    dataSourceId?: string;
    section?: string;
    complete: boolean;
    returned: number;
    historical?: boolean;
  }>;
  repeatedInspections: number;
  unavailable: string[];
  inventoryLimited?: boolean;
  searchKeys?: string[];
  stalledProgress?: string;
  operations?: Array<{
    key: string;
    tool: ChatToolName;
    input: Record<string, unknown>;
    signature: string;
    progress: string;
    result: Record<string, unknown>;
  }>;
};
export const newAgentKnowledge = (): AgentKnowledge => ({
  sources: [],
  inspections: [],
  reads: [],
  repeatedInspections: 0,
  unavailable: [],
});
export const inspectionKey = (input: InspectionInput) =>
  JSON.stringify([input.id, input.dataSourceId, input.section, input.cursor]);

/** Data-only encrypted-checkpoint memory. It never authorizes a resource. */
export function rememberInspection(
  state: AgentState,
  input: InspectionInput,
  result: InspectionResult,
) {
  const knowledge = state.knowledge!;
  const key = inspectionKey(input);
  knowledge.inspections = knowledge.inspections.filter((entry) => entry.key !== key);
  knowledge.inspections.push({ key, input, result, revision: String(result.revision), hits: 0 });
  for (const entry of result.entries ?? []) {
    if (input.section !== "sources") continue;
    const dataSourceId = entry.dataSourceId ?? entry.id;
    if (typeof dataSourceId !== "string") continue;
    const old = knowledge.sources.find(
      (source) => source.databaseId === input.id && source.dataSourceId === dataSourceId,
    );
    const revision =
      entry.version === undefined
        ? undefined
        : `${String(result.revision).split(":")[0]}:${entry.version}`;
    if (old) {
      old.name = String(entry.name ?? "").slice(0, 128);
      old.revision = revision;
    } else
      knowledge.sources.push({
        databaseId: input.id,
        dataSourceId,
        name: String(entry.name ?? "").slice(0, 128),
        recordsRead: false,
        revision,
      });
  }
  rememberRead(
    state,
    "describe_source",
    { type: "database", id: input.id },
    !!result.coverage?.complete,
    result.coverage?.returned ?? 0,
    input.dataSourceId ?? undefined,
    input.section,
  );
}
export function rememberRead(
  state: AgentState,
  tool: ChatToolName,
  resource: ResourceRef,
  complete: boolean,
  returned: number,
  dataSourceId?: string,
  section?: string,
) {
  const knowledge = state.knowledge!;
  const match = (entry: AgentKnowledge["reads"][number]) =>
    entry.tool === tool &&
    entry.resource.type === resource.type &&
    entry.resource.id === resource.id &&
    entry.dataSourceId === dataSourceId &&
    entry.section === section;
  knowledge.reads = knowledge.reads.filter((entry) => !match(entry));
  knowledge.reads.push({ tool, resource, dataSourceId, section, complete, returned });
  if (tool !== "describe_source") {
    knowledge.repeatedInspections = 0;
    if (resource.type === "database") {
      const source = knowledge.sources.find(
        (entry) => entry.databaseId === resource.id && entry.dataSourceId === dataSourceId,
      );
      if (source) source.recordsRead = complete;
    }
  }
}
export function forgetDatabaseKnowledge(state: AgentState, databaseId: string) {
  const knowledge = state.knowledge!;
  knowledge.sources = knowledge.sources.filter((entry) => entry.databaseId !== databaseId);
  knowledge.inspections = knowledge.inspections.filter((entry) => entry.input.id !== databaseId);
  knowledge.reads = knowledge.reads.filter(
    (entry) => entry.resource.type !== "database" || entry.resource.id !== databaseId,
  );
  knowledge.operations = knowledge.operations?.filter(
    (entry) => (entry.input.databaseId ?? entry.input.id) !== databaseId,
  );
}

export function markReadUnavailable(state: AgentState, resource: ResourceRef) {
  const key = `${resource.type}:${resource.id}`;
  if (!state.knowledge!.unavailable.includes(key)) state.knowledge!.unavailable.push(key);
  if (resource.type === "database") forgetDatabaseKnowledge(state, resource.id);
  state.knowledge!.operations = state.knowledge!.operations?.filter(
    (entry) => (entry.input.pageId ?? entry.input.databaseId ?? entry.input.id) !== resource.id,
  );
  const dependentPages = new Set(
    state.grants
      .filter((grant) => grant.parent?.type === resource.type && grant.parent.id === resource.id)
      .map((grant) => grant.resource.id),
  );
  for (const [fingerprint, pending] of Object.entries(state.pending)) {
    const id = pending.input.pageId ?? pending.input.databaseId ?? pending.input.id;
    if (id === resource.id || dependentPages.has(String(id))) {
      if (typeof pending.input.cursor === "string") delete state.cursors[pending.input.cursor];
      delete state.pending[fingerprint];
    }
  }
}

/** Upgrade optional memory on legacy v2 checkpoints using the originating call, never a guessed ID type. */
export function restoreAgentKnowledge(state: AgentState) {
  if (state.knowledge) {
    state.knowledge.unavailable ??= [];
    return;
  }
  state.knowledge = newAgentKnowledge();
  const calls = new Map<string, { name: string; input: LegacyToolInput }>();
  for (const message of state.messages) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type === "tool-call" && part.input && typeof part.input === "object")
        calls.set(part.toolCallId, {
          name: part.toolName,
          input: part.input as LegacyToolInput,
        });
      if (part.type !== "tool-result" || part.output.type !== "json") continue;
      const call = calls.get(part.toolCallId);
      const result = part.output.value as InspectionResult | null;
      if (!call || !result || result.error) continue;
      const input = call.input;
      if (
        call.name === "describe_source" &&
        input.type === "database" &&
        Array.isArray(result.entries)
      )
        rememberInspection(
          state,
          {
            type: "database",
            id: input.id,
            dataSourceId: input.dataSourceId ?? null,
            section: input.section ?? "sources",
            cursor: input.cursor ?? null,
          },
          {
            ...result,
            entries: result.entries.map((entry: Record<string, unknown>) => {
              const { id, ...fields } = entry;
              const section = input.section ?? "sources";
              return {
                ...fields,
                kind:
                  section === "sources"
                    ? "data_source"
                    : section === "properties"
                      ? "property"
                      : "view",
                databaseId: input.id,
                ...(section === "sources"
                  ? { dataSourceId: fields.dataSourceId ?? id }
                  : {
                      dataSourceId: input.dataSourceId,
                      [section === "properties" ? "propertyId" : "viewId"]:
                        fields[section === "properties" ? "propertyId" : "viewId"] ?? id,
                    }),
              };
            }),
          },
        );
      else if (
        call.name === "read_page" ||
        ["query_records", "read_record", "aggregate_records"].includes(call.name)
      )
        rememberRead(
          state,
          call.name as ChatToolName,
          call.name === "read_page"
            ? { type: "page", id: input.pageId }
            : { type: "database", id: input.databaseId },
          !!result.coverage?.complete,
          result.coverage?.returned ?? 0,
          input.dataSourceId,
        );
    }
  }
}

/** Small data-only inventory survives compaction; names and configs remain untrusted source data. */
export function agentKnowledgeSummary(state: AgentState) {
  const knowledge = state.knowledge!;
  const inventory: {
    sources: typeof knowledge.sources;
    discovered: ResourceRef[];
    inspections: Array<Record<string, unknown>>;
    reads: typeof knowledge.reads;
    pending: typeof state.pending;
    inventoryLimited?: boolean;
    summaryLimited: boolean;
    operations?: Array<Record<string, unknown>>;
  } = {
    sources: [],
    discovered: [],
    inspections: [],
    reads: [],
    pending: {},
    inventoryLimited: knowledge.inventoryLimited,
    summaryLimited: false,
  };
  inventory.sources = knowledge.sources;
  inventory.reads = knowledge.reads;
  inventory.pending = state.pending;
  inventory.operations = (knowledge.operations ?? []).map(({ tool, input, result }) => ({
    tool,
    input,
    coverage: result.coverage,
    ...(tool === "aggregate_records"
      ? {
          value: result.value,
          operation: result.operation,
          matchingRecords: result.matchingRecords,
        }
      : {}),
  }));
  inventory.discovered = state.grants
    .filter(
      ({ resource, parent }) =>
        !parent && !knowledge.unavailable.includes(`${resource.type}:${resource.id}`),
    )
    .map(({ resource }) => resource);
  inventory.inspections = knowledge.inspections.map((entry) => ({
    databaseId: entry.input.id,
    dataSourceId: entry.input.dataSourceId,
    section: entry.input.section,
    revision: entry.revision,
    entries: entry.result.entries,
    complete: entry.result.coverage?.complete,
  }));
  return JSON.stringify(inventory);
}

/** Persist identities and coverage only, never tool bodies or access decisions. */
export function retainConversationSources(state: AgentState) {
  if (!state.conversation) return;
  const retained = {
    grants: state.grants,
    reads: (state.knowledge?.reads ?? []).map(({ historical: _historical, ...read }) => read),
  };
  if (!retained.grants.length && !retained.reads.length) return;
  const previous = state.conversation.memory;
  if (JSON.stringify(previous?.retained) === JSON.stringify(retained)) return;
  state.conversation.memory = {
    summary: previous?.summary ?? "",
    throughTurnId: previous?.throughTurnId ?? "",
    retained: structuredClone(retained),
  };
  state.conversation.dirty = true;
}

/** Work must be a real pending cursor or an unread, discovered source/page, not merely a stop label. */
export function hasRemainingReads(state: AgentState) {
  if (Object.keys(state.pending).length) return true;
  const knowledge = state.knowledge;
  if (!knowledge) return false;
  if (
    knowledge.sources.some(
      (source) =>
        !source.recordsRead &&
        !knowledge.unavailable.includes(`database:${source.databaseId}`) &&
        !knowledge.unavailable.includes(`source:${source.databaseId}:${source.dataSourceId}`),
    )
  )
    return true;
  return state.grants.some(({ resource, parent }) => {
    if (
      knowledge.unavailable.includes(`${resource.type}:${resource.id}`) ||
      (parent && knowledge.unavailable.includes(`${parent.type}:${parent.id}`))
    )
      return false;
    if (resource.type === "page")
      return !knowledge.reads.some(
        (read) => read.tool === "read_page" && read.resource.id === resource.id && read.complete,
      );
    return !knowledge.reads.some(
      (entry) =>
        entry.tool === "describe_source" &&
        entry.resource.type === "database" &&
        entry.resource.id === resource.id &&
        !entry.dataSourceId &&
        entry.section === "sources" &&
        entry.complete,
    );
  });
}

/** Retain only metadata exchanges whose exact revision still has a validated inspection. */
export function pruneStaleInspections(messages: ModelMessage[], state: AgentState) {
  const calls = new Map<string, InspectionInput>();
  const stale = new Set<string>();
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) {
      if (
        part.type === "tool-call" &&
        part.toolName === "describe_source" &&
        part.input &&
        typeof part.input === "object"
      ) {
        const input = part.input as Record<string, unknown>;
        if (input.type === "database")
          calls.set(part.toolCallId, {
            type: "database",
            id: String(input.id),
            dataSourceId: typeof input.dataSourceId === "string" ? input.dataSourceId : null,
            section: String(input.section ?? "sources"),
            cursor: typeof input.cursor === "string" ? input.cursor : null,
          });
      }
      if (part.type === "tool-result" && part.output.type === "json") {
        const input = calls.get(part.toolCallId);
        const result = part.output.value as Record<string, unknown> | null;
        if (
          input &&
          result &&
          !result.error &&
          !state.knowledge!.inspections.some(
            (entry) =>
              entry.key === inspectionKey(input) && entry.revision === String(result.revision),
          )
        )
          stale.add(part.toolCallId);
      }
    }
  }
  const result: ModelMessage[] = [];
  for (const message of messages) {
    if (
      typeof message.content === "string" ||
      (message.role !== "assistant" && message.role !== "tool")
    ) {
      result.push(message);
      continue;
    }
    const removesMetadata = message.content.some(
      (part) =>
        (part.type === "tool-call" || part.type === "tool-result") && stale.has(part.toolCallId),
    );
    if (!removesMetadata) {
      result.push(message);
      continue;
    }
    if (message.role === "assistant") {
      const content = message.content.filter(
        (part) => part.type === "tool-call" && !stale.has(part.toolCallId),
      );
      if (content.length) result.push({ ...message, content });
    } else {
      const content = message.content.filter(
        (part) => part.type !== "tool-result" || !stale.has(part.toolCallId),
      );
      if (content.length) result.push({ ...message, content });
    }
  }
  return { messages: result, omitted: stale.size };
}
