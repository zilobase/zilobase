import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  intent: "configure",
  connector: null as string | null,
  role: "owner",
  messages: [] as Record<string, unknown>[],
  events: [] as string[],
  fail: false,
}));
const enqueue = vi.hoisted(() => vi.fn(async () => ({ id: "run", status: "queued" })));
vi.mock("ai", () => ({
  Output: { object: (v: unknown) => v },
  generateText: async () => ({ output: { intent: state.intent, connector: state.connector } }),
}));
vi.mock("../providers/ai-provider", () => ({
  resolveWorkspaceAiModel: async () => ({ model: {} }),
}));
vi.mock("../execution/agent-run-queue", () => ({ enqueueAgentRun: enqueue }));
vi.mock("../settings/settings-tools", () => ({
  proposeSettings: async (...args: unknown[]) => {
    state.events.push("propose");
    if (state.fail) throw new Error("Model failed");
    return {
      tab: "instructions",
      summary: "Prepared instructions",
      patch: { instructions: "New" },
    };
  },
}));
vi.mock("../agents/agent-profile-service", () => {
  class AgentProfileError extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  }
  return { AgentProfileError, requireAgentProfileRole: async () => state.role };
});
vi.mock("../../../infrastructure/database", async () => {
  const { getTableName } = await import("drizzle-orm");
  const database: any = {
    select: () => ({
      from: (table: any) => {
        const q: any = {
          where: () => q,
          innerJoin: () => q,
          orderBy: () => q,
          limit: () => q,
          for: () => q,
          then: (resolve: any) =>
            resolve(
              getTableName(table) === "ai_agent_profile"
                ? [{ id: "agent", name: "Agent", defaultModel: "auto" }]
                : getTableName(table) === "ai_agent_conversation"
                  ? [{ id: "conversation", nextMessageSequence: state.messages.length }]
                  : [],
            ),
        };
        return q;
      },
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        state.messages.push(value);
        return { returning: async () => [value] };
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    transaction: async (fn: any) => fn(database),
  };
  return { db: database };
});
import { submitAgentConversationMessage } from "./agent-conversation-service";
const input = {
  profileId: "agent",
  workspaceId: "workspace",
  userId: "owner",
  message: "Change the instructions",
  onSettingsEvent: async (event: { status: string }) => {
    state.events.push(event.status);
  },
};
beforeEach(() => {
  state.intent = "configure";
  state.connector = null;
  state.role = "owner";
  state.messages = [];
  state.events = [];
  state.fail = false;
  enqueue.mockClear();
});
describe("agent configuration through chat", () => {
  it("opens settings before generating the draft and never publishes a revision", async () => {
    const result = await submitAgentConversationMessage(input);
    expect(state.events).toEqual(["editing", "propose", "ready"]);
    expect(result.revision).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("defers configure-and-run until the user saves", async () => {
    state.intent = "configure_and_run";
    await submitAgentConversationMessage(input);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("runs saved configuration for an execution-only request", async () => {
    state.intent = "run";
    await submitAgentConversationMessage(input);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(state.events).toEqual([]);
  });
  it("rejects configuration from read-only users", async () => {
    state.role = "user";
    await expect(submitAgentConversationMessage(input)).rejects.toMatchObject({ status: 403 });
    expect(state.events).toEqual([]);
  });
  it("shows a private connector card instead of setup prose", async () => {
    state.connector = "github";
    await submitAgentConversationMessage(input);
    expect(state.messages.at(-1)).toMatchObject({
      authorUserId: "owner",
      parts: [{ type: "data-connector-setup", data: { provider: "github", scope: "agent" } }],
    });
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("marks failed proposals without running anything", async () => {
    state.fail = true;
    await expect(submitAgentConversationMessage(input)).rejects.toThrow("Model failed");
    expect(state.events.at(-1)).toBe("failed");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
