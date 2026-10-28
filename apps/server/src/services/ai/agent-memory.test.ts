import { expect, test } from "vitest";
import { createAgentState, updateReadCoverage } from "./agent-state";
import {
  agentKnowledgeSummary,
  hasRemainingReads,
  rememberInspection,
  rememberRead,
  restoreAgentKnowledge,
  pruneStaleInspections,
  forgetDatabaseKnowledge,
} from "./agent-memory";

const stateFor = () =>
  createAgentState(
    "workspace",
    [{ type: "database", id: "db" }],
    [{ role: "user", content: "Summarize [[database:db]]" }],
  );
const input = {
  type: "database" as const,
  id: "db",
  dataSourceId: null,
  section: "sources",
  cursor: null,
};
const sources = {
  revision: "v1",
  entries: [{ kind: "data_source", dataSourceId: "source", name: "Project" }],
  coverage: { complete: true, returned: 1 },
  continuation: { nextCursor: null },
};

test("search-discovered identities survive checkpoint recovery and transcript compaction without becoming evidence", () => {
  const original = stateFor();
  original.grants.push({ resource: { type: "page", id: "found-page" } });
  original.grants.push({ resource: { type: "database", id: "found-db" } });
  original.grants.push({ resource: { type: "page", id: "revoked" } });
  original.knowledge!.unavailable.push("page:revoked");
  const recovered = JSON.parse(JSON.stringify(original)) as typeof original;
  recovered.messages = [{ role: "user", content: "Continue reading the launch sources" }];
  const summary = agentKnowledgeSummary(recovered);
  expect(JSON.parse(summary).discovered).toEqual([
    { type: "database", id: "db" },
    { type: "page", id: "found-page" },
    { type: "database", id: "found-db" },
  ]);
  expect(recovered.context.manifest).toEqual([]);
  expect(recovered.knowledge!.reads).toEqual([]);
});

test("source identities and unfinished reads survive transcript compaction", () => {
  const state = stateFor();
  rememberInspection(state, input, sources);
  state.messages.push(
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c", toolName: "describe_source", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c",
          toolName: "describe_source",
          output: { type: "json", value: sources },
        },
      ],
    },
    { role: "assistant", content: "Later exchange" },
  );
  state.messages = [state.messages[0]!];
  const inventory = JSON.parse(agentKnowledgeSummary(state));
  expect(inventory.sources[0]).toMatchObject({
    databaseId: "db",
    dataSourceId: "source",
    recordsRead: false,
  });
  expect(hasRemainingReads(state)).toBe(true);
  rememberRead(state, "query_records", { type: "database", id: "db" }, true, 0, "source");
  state.progress.stopReason = "step_budget";
  updateReadCoverage(state);
  expect(state.progress.canContinue).toBe(false);
});

test("a large discovered-source inventory cannot crowd out pending cursors or completed reads", () => {
  const state = stateFor();
  state.grants.push(
    ...Array.from({ length: 190 }, (_, i) => ({
      resource: { type: "page" as const, id: `discovered-${i}-${"x".repeat(70)}` },
    })),
  );
  rememberRead(state, "read_page", { type: "page", id: "completed" }, true, 1);
  state.pending.next = { name: "read_page", input: { pageId: "unfinished", cursor: "cursor" } };
  const summary = JSON.parse(agentKnowledgeSummary(state));
  expect(summary.pending.next.input.cursor).toBe("cursor");
  expect(summary.reads[0].resource.id).toBe("completed");
  expect(summary.discovered).toHaveLength(191);
});

test("legacy v2 metadata normalizes using its originating call, without page grants", () => {
  const state = stateFor();
  delete state.knowledge;
  state.messages.push(
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "legacy", toolName: "describe_source", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "legacy",
          toolName: "describe_source",
          output: {
            type: "json",
            value: { ...sources, entries: [{ id: "source", name: "Project" }] },
          },
        },
      ],
    },
  );
  restoreAgentKnowledge(state);
  expect(state.knowledge!.inspections[0].result.entries![0]).toEqual({
    kind: "data_source",
    dataSourceId: "source",
    databaseId: "db",
    name: "Project",
  });
  expect(state.grants).toHaveLength(1);
});

test("source inventory has no per-run source ceiling", () => {
  const state = stateFor();
  rememberInspection(state, input, {
    ...sources,
    entries: Array.from({ length: 101 }, (_, i) => ({
      dataSourceId: `s${i}`,
      name: "x".repeat(128),
    })),
  });
  expect(state.knowledge!.sources).toHaveLength(101);
  expect(state.progress.stopReason).toBeUndefined();
  expect(JSON.parse(agentKnowledgeSummary(state)).sources).toHaveLength(101);
});

test("a properties inspection cannot imply that database source discovery is complete", () => {
  const state = stateFor();
  rememberInspection(state, { ...input, section: "properties" }, { ...sources, entries: [] });
  expect(hasRemainingReads(state)).toBe(true);
});

test("a revision change removes stale metadata calls and matching results before replay", () => {
  const state = stateFor();
  rememberInspection(state, input, sources);
  state.messages.push(
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "stale", toolName: "describe_source", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "stale",
          toolName: "describe_source",
          output: { type: "json", value: sources },
        },
      ],
    },
  );
  expect(pruneStaleInspections(state.messages, state).omitted).toBe(0);
  forgetDatabaseKnowledge(state, "db");
  const clean = pruneStaleInspections(state.messages, state);
  expect(clean.omitted).toBe(1);
  expect(clean.messages).toEqual([state.messages[0]]);
});
