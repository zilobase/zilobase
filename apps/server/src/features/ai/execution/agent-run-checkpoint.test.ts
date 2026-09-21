import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCheckpointApprovals,
  checkpointToolCallIds,
  readAgentRunCheckpoint,
  resumeAgentRunAfterApproval,
  saveAgentRunCheckpoint,
  type AgentRunCheckpoint,
} from "./agent-run-checkpoint";

const state = vi.hoisted(() => ({
  run: {} as Record<string, unknown>,
  actions: [] as Record<string, unknown>[],
  dispatch: vi.fn(),
}));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: state.dispatch,
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => (state.run.id ? [state.run] : []),
              limit: async () =>
                state.actions
                  .filter((action) => action.status === "pending")
                  .slice(0, 1),
              then: (resolve: (value: unknown) => unknown) =>
                resolve(state.actions),
            }),
          }),
        }),
        update: () => ({
          set: (value: Record<string, unknown>) => ({
            where: async () => {
              Object.assign(state.run, value);
            },
          }),
        }),
      }),
  },
}));

const env = {
  MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({
    activeVersion: "v1",
    keys: { v1: btoa("x".repeat(32)) },
  }),
};
const run = {
  id: "run",
  profileId: "agent",
  workspaceId: "workspace",
  output: null,
};
const checkpoint: AgentRunCheckpoint = {
  version: 1,
  steps: 1,
  toolCallIds: ["first", "second"],
  messages: [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "first",
          toolName: "github",
          input: { private: "argument" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "first",
          toolName: "github",
          output: { type: "json", value: { status: "approval_required" } },
        },
        {
          type: "tool-result",
          toolCallId: "second",
          toolName: "github",
          output: { type: "json", value: { status: "approval_required" } },
        },
      ],
    },
  ],
};

beforeEach(() => {
  state.run = { ...run, status: "running" };
  state.actions = [];
  state.dispatch.mockReset();
});

describe("durable model checkpoints", () => {
  it("encrypts model arguments and binds the ciphertext to one run", async () => {
    expect(await saveAgentRunCheckpoint(env, run, "worker", checkpoint)).toBe(
      false,
    );
    expect(JSON.stringify(state.run.output)).not.toContain("argument");
    const stored = { ...run, output: state.run.output };
    expect(await readAgentRunCheckpoint(env, stored)).toEqual(checkpoint);
    await expect(
      readAgentRunCheckpoint(env, { ...stored, id: "other" }),
    ).rejects.toThrow();
    await expect(
      readAgentRunCheckpoint(env, { ...stored, workspaceId: "other" }),
    ).rejects.toThrow();
  });
  it("pauses only after saving a complete model step", async () => {
    state.actions = [{ status: "pending", toolCallId: "first" }];
    expect(await saveAgentRunCheckpoint(env, run, "worker", checkpoint)).toBe(
      true,
    );
    expect(state.run.status).toBe("waiting_approval");
    expect(
      await readAgentRunCheckpoint(env, { ...run, output: state.run.output }),
    ).toEqual(checkpoint);
  });
  it("rejects a checkpoint after ownership was lost", async () => {
    state.run = {};
    await expect(
      saveAgentRunCheckpoint(env, run, "worker", checkpoint),
    ).rejects.toThrow("ownership");
  });
  it("rejects oversized checkpoints before writing", async () => {
    await expect(
      saveAgentRunCheckpoint(env, run, "worker", {
        ...checkpoint,
        messages: [{ role: "assistant", content: "x".repeat(5 * 1024 * 1024) }],
      }),
    ).rejects.toThrow("limit");
    expect(state.run.output).toBeNull();
  });
  it("replaces only matching tool results without mutating the original", () => {
    const updated = applyCheckpointApprovals(checkpoint, [
      {
        toolCallId: "first",
        status: "succeeded",
        result: { answer: "username" },
      },
    ]);
    expect(JSON.stringify(updated.messages)).toContain("username");
    expect(JSON.stringify(checkpoint.messages)).not.toContain("username");
    expect(checkpointToolCallIds(updated.messages)).toEqual([
      "first",
      "second",
    ]);
  });
  it.each(["failed", "expired", "executing"])(
    "does not resume %s approval",
    (status) => {
      expect(() =>
        applyCheckpointApprovals(checkpoint, [
          { toolCallId: "first", status, result: {} },
        ]),
      ).toThrow();
    },
  );
  it("waits for all approvals, then queues exactly once", async () => {
    await saveAgentRunCheckpoint(env, run, "worker", checkpoint);
    state.run.status = "waiting_approval";
    state.actions = [
      { toolCallId: "first", status: "succeeded", result: { ok: true } },
      { toolCallId: "second", status: "executing", result: null },
    ];
    expect(await resumeAgentRunAfterApproval(env, run.id)).toBe(false);
    state.actions[1] = {
      toolCallId: "second",
      status: "succeeded",
      result: { ok: true },
    };
    expect(await resumeAgentRunAfterApproval(env, run.id)).toBe(true);
    expect(state.run.status).toBe("queued");
    expect(await resumeAgentRunAfterApproval(env, run.id)).toBe(false);
    expect(state.dispatch).toHaveBeenCalledTimes(1);
  });
  it.each(["cancelled", "failed", "succeeded"])(
    "does not overwrite a %s run",
    async (status) => {
      state.run.status = status;
      expect(await resumeAgentRunAfterApproval(env, run.id)).toBe(false);
      expect(state.run.status).toBe(status);
      expect(state.dispatch).not.toHaveBeenCalled();
    },
  );
  it("fails closed for waiting runs without a checkpoint", async () => {
    state.run.status = "waiting_approval";
    expect(await resumeAgentRunAfterApproval(env, run.id)).toBe(false);
    expect(state.run.status).toBe("failed");
  });
});
