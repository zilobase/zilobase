import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  consumed: true,
  writes: [] as Record<string, unknown>[],
  order: [] as string[],
}));
vi.mock("../../../infrastructure/database", () => ({
  runWithDbEnv: (_env: unknown, run: () => unknown) => run(),
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.rows.shift() ?? [] }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            state.order.push("consume");
            return state.consumed ? [{ id: "attempt" }] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        state.writes.push(value);
        return {
          onConflictDoUpdate: async () => {
            state.order.push("persist");
          },
        };
      },
    }),
  },
}));
import { beginSlackOauth, completeSlackOauth } from "./slack-provider";
import { decryptAutomationSecret } from "./secret-crypto";
const env = {
  AUTOMATION_SLACK_ENABLED: "true",
  SLACK_CLIENT_ID: "client",
  SLACK_CLIENT_SECRET: "client-secret",
  AUTOMATION_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64"),
  BETTER_AUTH_URL: "https://api.example.test",
};
beforeEach(() => {
  state.rows = [];
  state.consumed = true;
  state.writes = [];
  state.order = [];
});
async function attempt() {
  const url = new URL(
    await beginSlackOauth(env, { userId: "user", workspaceId: "workspace" }),
  );
  state.rows.push([state.writes[0]]);
  return { code: "code", state: url.searchParams.get("state")! };
}
test("Slack OAuth consumes attempts before exchange and encrypts tokens under the existing connection owner", async () => {
  const input = await attempt();
  state.rows.push([{ id: "existing" }]);
  let verifier = "";
  const fetcher: typeof fetch = async (_url, options) => {
    state.order.push("exchange");
    verifier = new URLSearchParams(String(options?.body)).get("code_verifier")!;
    return Response.json({
      ok: true,
      access_token: "token",
      bot_user_id: "bot",
      team: { id: "team", name: "Team" },
      scope: "groups:read,chat:write,channels:read",
    });
  };
  assert.deepEqual(await completeSlackOauth(env, input, fetcher), {
    connectionId: "existing",
    workspaceId: "workspace",
  });
  assert.ok(verifier.length > 0);
  assert.deepEqual(state.order, ["consume", "exchange", "persist"]);
  const saved = state.writes[1];
  assert.equal(saved.accessTokenCiphertext === "token", false);
  assert.deepEqual(saved.scopes, [
    "channels:read",
    "chat:write",
    "groups:read",
  ]);
  assert.equal(
    await decryptAutomationSecret(
      env,
      {
        ciphertext: String(saved.accessTokenCiphertext),
        iv: String(saved.accessTokenIv),
        keyVersion: String(saved.accessTokenKeyVersion),
      },
      {
        ownerUserId: "user",
        purpose: "slack_access_token",
        secretId: "existing",
        workspaceId: "workspace",
      },
    ),
    "token",
  );
});
test("Slack OAuth rejects expired or consumed attempts before contacting the provider", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await assert.rejects(
    completeSlackOauth(env, { code: "code", state: "state" }, fetcher),
    { code: "SLACK_OAUTH_EXPIRED" },
  );
  const input = await attempt();
  state.consumed = false;
  await assert.rejects(completeSlackOauth(env, input, fetcher), {
    code: "SLACK_OAUTH_USED",
  });
  assert.equal(fetcher.mock.calls.length, 0);
});
test("Slack OAuth refuses incomplete provider grants without persisting a connection", async () => {
  const input = await attempt();
  await assert.rejects(
    completeSlackOauth(env, input, async () =>
      Response.json({
        ok: true,
        access_token: "token",
        bot_user_id: "bot",
        team: { id: "team", name: "Team" },
        scope: "chat:write",
      }),
    ),
    { code: "SLACK_OAUTH_REJECTED" },
  );
  assert.equal(state.writes.length, 1);
});
