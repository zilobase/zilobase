import { beforeEach, describe, expect, it, vi } from "vitest";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  hostedPersist: vi.fn(async (_messages: unknown[]) => undefined),
  loadMessages: vi.fn(async () => []),
  runAiChatTurn: vi.fn(async () => new Response("ok")),
  syncMessages: vi.fn(async () => undefined),
}));

vi.mock("@cloudflare/ai-chat", () => ({
  AIChatAgent: class {
    env: Record<string, unknown>;
    messages: unknown[] = [];
    name = `org-workspace-1-user-user-1-thread-${THREAD_ID}`;

    constructor(_ctx: unknown, env: Record<string, unknown>) {
      this.env = env;
    }

    async persistMessages(messages: unknown[]) {
      await mocks.hostedPersist(messages);
      this.messages = messages;
    }
  },
}));

vi.mock("@zilobase/server/adapter-api", () => ({
  coerceAiChatRequestBody: (body: unknown) => body,
  loadAiChatThreadMessages: mocks.loadMessages,
  maybeAutoTitleAiChatThread: vi.fn(async () => undefined),
  runAiChatTurn: mocks.runAiChatTurn,
  runWithDbEnv: (_env: unknown, fn: () => Promise<unknown>) => fn(),
  syncAiChatThreadMessages: mocks.syncMessages,
  touchAiChatThreadActivity: vi.fn(async () => undefined),
}));

import {
  mergeCanonicalChatMessages,
} from "@zilobase/features/ai-chat/agent-room";
import { ChatAgent } from "../../src/worker/features/chat/chat-agent";

function createAgent() {
  return new ChatAgent(
    {} as DurableObjectState,
    {} as ConstructorParameters<typeof ChatAgent>[1],
  );
}

describe("ChatAgent hibernation-safe thread identity", () => {
  beforeEach(() => {
    mocks.loadMessages.mockClear();
    mocks.runAiChatTurn.mockClear();
    mocks.syncMessages.mockClear();
    mocks.loadMessages.mockReset();
    mocks.loadMessages.mockResolvedValue([]);
    mocks.hostedPersist.mockReset();
    mocks.hostedPersist.mockResolvedValue(undefined);
  });

  it("syncs the first persisted message using the durable instance name", async () => {
    const agent = createAgent();
    const messages = [{ id: "message-1", parts: [], role: "user" }] as never[];

    await agent.persistMessages(messages);

    expect(mocks.syncMessages).toHaveBeenCalledWith(THREAD_ID, messages, {
      deleteStaleRows: false,
    });
  });

  it("commits canonical Postgres state before the hosted message cache", async () => {
    const agent = createAgent();
    const order: string[] = [];
    mocks.syncMessages.mockImplementationOnce(async () => {
      order.push("canonical");
    });
    mocks.hostedPersist.mockImplementationOnce(async () => {
      order.push("hosted");
    });

    await agent.persistMessages([
      { id: "message-1", parts: [], role: "user" },
    ] as never[]);

    expect(order).toEqual(["canonical", "hosted"]);
  });

  it("hydrates canonical history before assigning sequences to a new message", async () => {
    const agent = createAgent();
    const history = [{
      id: "message-1",
      parts: [{ type: "text", text: "Earlier question" }],
      role: "user",
    }] as never[];
    const incoming = [{
      id: "message-2",
      parts: [{ type: "text", text: "New question" }],
      role: "user",
    }] as never[];
    mocks.loadMessages.mockResolvedValueOnce(history);

    await agent.persistMessages(incoming);

    expect(mocks.syncMessages).toHaveBeenCalledWith(
      THREAD_ID,
      [...history, ...incoming],
      { deleteStaleRows: false },
    );
  });

  it("derives ownership from the durable instance instead of client fields", async () => {
    const agent = createAgent();

    const response = await agent.onChatMessage(vi.fn(), {
      body: {
        threadId: "22222222-2222-4222-8222-222222222222",
        userId: "attacker",
        workspaceId: "other-workspace",
      },
    });

    expect(response?.status).toBe(200);
    expect(mocks.runAiChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        threadId: THREAD_ID,
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    }));
  });

  it("enables recoverable streams across disconnects and object eviction", () => {
    expect(createAgent().chatRecovery).toBe(true);
  });
});

describe("mergeCanonicalChatMessages", () => {
  it("keeps canonical order, appends local messages, and lets local data win", () => {
    const canonical = [
      { id: "one", role: "user", parts: [] },
      { id: "two", role: "assistant", parts: [] },
    ] as never[];
    const local = [
      { id: "two", role: "assistant", parts: [{ type: "text", text: "new" }] },
      { id: "three", role: "user", parts: [] },
    ] as never[];

    expect(mergeCanonicalChatMessages(canonical, local)).toEqual([
      canonical[0],
      local[0],
      local[1],
    ]);
  });
});
