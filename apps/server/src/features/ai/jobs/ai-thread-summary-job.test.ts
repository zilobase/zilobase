import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  calls: [] as string[],
  prompt: "",
  persisted: null as Record<string, unknown> | null,
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    select: () => {
      const rows = state.rows.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => rows,
        orderBy: async () => rows,
      };
      return query;
    },
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          state.calls.push("persist");
          state.persisted = value;
        },
      }),
    }),
  },
}));
vi.mock("../providers/ai-provider", () => ({
  resolveWorkspaceAiModel: async () => {
    state.calls.push("model");
    return { model: "controlled" };
  },
}));
vi.mock("../../../infrastructure/background/telemetry", () => ({
  measureBackgroundProvider: async (_env: unknown, _name: string, run: () => unknown) => run(),
}));
vi.mock("ai", () => ({
  generateText: async (input: { prompt: string }) => {
    state.calls.push("generate");
    state.prompt = input.prompt;
    return { text: "summary" };
  },
}));
vi.mock("./ai-jobs", () => ({ PermanentAiJobError: class extends Error {} }));
import { compactAiThreadJob } from "./ai-thread-summary-job";
function run() {
  return compactAiThreadJob({
    env: {},
    job: {
      input: { threadId: "thread" },
      workspaceId: "workspace",
      userId: "user",
    },
    reportProgress: async () => {
      state.calls.push("progress");
    },
    assertLease: async () => {
      state.calls.push("lease");
    },
  } as unknown as Parameters<typeof compactAiThreadJob>[0]);
}
beforeEach(() => {
  state.rows = [];
  state.calls = [];
  state.prompt = "";
  state.persisted = null;
});
test("thread compaction includes only text and summarized tool outcomes and checks leases around provider work", async () => {
  state.rows = [
    [{ nextMessageSequence: 30 }],
    [],
    [
      {
        role: "assistant",
        sequence: 1,
        parts: [
          null,
          5,
          [],
          { type: "text", text: "Fact" },
          { type: "text", text: 7 },
          { type: "tool-search", output: { summary: "Found page" } },
          {
            type: "tool-write",
            output: { summary: "Saved page", status: "success" },
          },
          { type: "tool-empty", output: {} },
          { type: "tool-false", output: false },
          { type: "data", text: "Ignored" },
        ],
      },
    ],
  ];
  assert.deepEqual(await run(), {
    coveredThroughSequence: 17,
    status: "compacted",
  });
  assert.match(
    state.prompt,
    /ASSISTANT: Fact Tool tool-search: completed: Found page Tool tool-write: success: Saved page/,
  );
  assert.doesNotMatch(state.prompt, /Ignored|tool-empty|tool-false/);
  assert.deepEqual(state.calls, ["progress", "lease", "model", "generate", "lease", "persist"]);
  assert.equal(state.persisted?.summary, "summary");
});
test("thread compaction avoids provider work for already-covered or empty segments", async () => {
  state.rows = [[{ nextMessageSequence: 12 }], [{ coveredThroughSequence: 0 }]];
  assert.deepEqual(await run(), {
    coveredThroughSequence: 0,
    status: "unchanged",
  });
  assert.deepEqual(state.calls, []);
  state.rows = [[{ nextMessageSequence: 30 }], [], []];
  assert.deepEqual(await run(), {
    coveredThroughSequence: -1,
    status: "unchanged",
  });
  assert.deepEqual(state.calls, []);
});
