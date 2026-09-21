import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";
import type { AppBindings } from "../../../shared/types";
const state = vi.hoisted(() => ({
  authorized: true,
  member: true,
  action: null as Record<string, unknown> | null,
  executing: true,
  mcp: true,
  result: { ok: true } as unknown,
  error: null as Error | null,
  finished: [] as Record<string, unknown>[],
  expired: [] as string[],
  turns: [] as Record<string, unknown>[],
  prompts: [] as Record<string, unknown>[],
  skill: null as Record<string, unknown> | null,
  access: true,
  thread: true,
  existingTurn: null as Record<string, unknown> | null,
}));
vi.mock("../../access", () => ({
  getMembership: async () => (state.member ? { id: "member" } : null),
  getPageRecord: async () => state.skill,
  canAccessPage: async () => state.access,
}));
vi.mock("../files/routes", () => ({ aiFileRoutes: new Hono() }));
vi.mock("./chat-persistence", () => ({
  appendCanonicalUserMessage: async () => ({ id: "message" }),
  getAiChatThreadForUser: async () => state.thread ? ({ id: "thread" }) : null,
  loadAiChatThreadMessages: async () => [],
}));
vi.mock("../actions/agent-operations", () => ({
  getAiAgentTurnByClientId: async () => state.existingTurn,
}));
vi.mock("./chat-service", () => ({
  runAiChatTurn: async (input: Record<string, unknown>) => {
    state.turns.push(input);
    return Response.json({ ok: true });
  },
}));
vi.mock("../actions/agent-approvals", () => ({
  getOwnedPendingAgentAction: async () => state.action,
  markPendingAgentActionExecuting: async () =>
    state.executing ? state.action : null,
  expirePendingAgentAction: async (id: string) => {
    state.expired.push(id);
  },
  finishPendingAgentAction: async (input: Record<string, unknown>) => {
    state.finished.push(input);
  },
  rejectPendingAgentAction: async () => null,
}));
vi.mock("../mcp/execution/mcp-approval", () => ({
  isMcpPendingAction: () => state.mcp,
  executeApprovedMcpAction: async () => {
    if (state.error) throw state.error;
    return state.result;
  },
}));
vi.mock("../providers/ai-provider", async (original) => ({
  ...(await original<typeof import("../providers/ai-provider")>()),
  resolveWorkspaceAiModel: async () => {
    if (state.error) throw state.error;
    return { model: {}, providerOptions: undefined };
  },
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  streamText: (input: Record<string, unknown>) => {
    state.prompts.push(input);
    return {
      textStream: (async function* () {
        yield "Generated";
      })(),
    };
  },
}));
import { aiRoutes } from "./chat-routes";
const app = new Hono<AppBindings>();
app.use("*", async (c, next) => {
  if (state.authorized)
    c.set("user", { id: "user" } as NonNullable<
      AppBindings["Variables"]["user"]
    >);
  await next();
});
app.route("/", aiRoutes);
const request = (path: string, body: unknown = {}) =>
  app.request(
    path,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zilobase-workspace-id": "workspace",
      },
      body: JSON.stringify(body),
    },
    {},
  );
beforeEach(() => {
  state.authorized = true;
  state.member = true;
  state.action = {
    id: "action",
    status: "pending",
    expiresAt: new Date(Date.now() + 60000),
  };
  state.executing = true;
  state.mcp = true;
  state.result = { ok: true };
  state.error = null;
  state.finished = [];
  state.expired = [];
  state.turns = [];
  state.prompts = [];
  state.skill = null;
  state.access = true;
  state.thread = true;
  state.existingTurn = null;
});
test("canonical thread turns enforce membership, validation, ownership, and idempotency", async () => {
  const path = "/threads/thread/turns";
  const body = {
    clientMessageId: "client-message",
    clientTurnId: "00000000-0000-4000-8000-000000000001",
    text: "Hello",
  };
  state.authorized = false;
  assert.equal((await request(path, body)).status, 401);
  state.authorized = true;
  state.member = false;
  assert.equal((await request(path, body)).status, 403);
  state.member = true;
  assert.equal((await request(path, {})).status, 400);
  state.thread = false;
  assert.equal((await request(path, body)).status, 404);
  state.thread = true;
  state.existingTurn = { id: "turn", status: "completed" };
  assert.equal((await request(path, body)).status, 409);
  state.existingTurn = null;
  assert.equal((await request(path, body)).status, 200);
  assert.equal(state.turns.length, 1);
  assert.equal(
    (state.turns[0].requestBody as Record<string, unknown>).userId,
    "user",
  );
});
test("approval routes preserve missing, replay, expiration and claim outcomes", async () => {
  const path = "/threads/thread/actions/action/approve";
  state.action = null;
  assert.equal((await request(path)).status, 404);
  state.action = { id: "action", status: "succeeded", result: { saved: true } };
  assert.deepEqual(await (await request(path)).json(), {
    actionId: "action",
    result: { saved: true },
    status: "succeeded",
  });
  state.action.status = "rejected";
  assert.equal((await request(path)).status, 409);
  state.action.status = "pending";
  state.action.expiresAt = new Date(0);
  assert.equal((await request(path)).status, 410);
  assert.deepEqual(state.expired, ["action"]);
  state.action.expiresAt = new Date(Date.now() + 60000);
  state.executing = false;
  assert.equal((await request(path)).status, 409);
  assert.deepEqual(state.finished, []);
});
test("approved connector outcomes are persisted after the claim, including failures", async () => {
  const path = "/threads/thread/actions/action/approve";
  assert.equal((await request(path)).status, 200);
  assert.deepEqual(state.finished[0], {
    actionId: "action",
    result: { ok: true },
  });
  state.result = { ok: false, summary: "Provider rejected" };
  assert.equal((await request(path)).status, 409);
  assert.equal(state.finished[1].error, "Provider rejected");
  state.error = new Error("Disconnected");
  assert.equal((await request(path)).status, 409);
  assert.equal(state.finished[2].error, "Disconnected");
});
test("editor generation validates scope and streams skill marks through the selected model", async () => {
  assert.equal((await request("/editor", {})).status, 400);
  assert.equal(
    (await request("/editor", { prompt: "Write", skillPageId: "skill" }))
      .status,
    404,
  );
  state.skill = {
    id: "skill",
    workspaceId: "workspace",
    name: "Writing",
    metadata: { zilobaseai: "skill" },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Advice",
              marks: [
                { type: "bold" },
                { type: "italic" },
                { type: "strike" },
                { type: "code" },
                { type: "link", attrs: { href: "https://example.test" } },
                { type: "unknown" },
              ],
            },
          ],
        },
      ],
    },
  };
  state.access = false;
  assert.equal(
    (await request("/editor", { prompt: "Write", skillPageId: "skill" }))
      .status,
    403,
  );
  state.access = true;
  const response = await request("/editor", {
    prompt: "Write",
    selectedText: "Selection",
    skillPageId: "skill",
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Generated");
  assert.match(
    String(state.prompts[0].prompt),
    /\[`~~\*\*\*Advice\*\*\*~~`\]\(https:\/\/example.test\)/,
  );
  assert.match(String(state.prompts[0].prompt), /<selected_text>\nSelection/);
  assert.equal(
    await (await request("/editor", { prompt: "Write" })).text(),
    "Generated",
  );
  state.error = Object.assign(new Error("Canceled"), { name: "AbortError" });
  assert.equal((await request("/editor", { prompt: "Write" })).status, 408);
});
