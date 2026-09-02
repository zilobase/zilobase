import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { encryptAutomationSecret } from "./secret-crypto";
import { listSlackChannels, sendSlackMessage } from "./slack-provider";

const env = { AUTOMATION_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64") };

async function connection() {
  const encrypted = await encryptAutomationSecret(env, "xoxb-secret", {
    ownerUserId: "user-1", purpose: "slack_access_token", secretId: "slack-1", workspaceId: "workspace-1",
  });
  return {
    accessTokenCiphertext: encrypted.ciphertext,
    accessTokenIv: encrypted.iv,
    accessTokenKeyVersion: encrypted.keyVersion,
    botUserId: "bot-1",
    createdAt: new Date(),
    id: "slack-1",
    lastErrorCode: null,
    ownerUserId: "user-1",
    scopes: ["channels:read", "chat:write", "groups:read"],
    status: "connected",
    teamId: "team-1",
    teamName: "Example",
    updatedAt: new Date(),
    workspaceId: "workspace-1",
  };
}

describe("Slack automation provider", () => {
  it("uses hashed single-use state, encrypted S256 PKCE, exact scopes, and encrypted tokens", async () => {
    const [source, migration] = await Promise.all([
      readFile(new URL("./slack-provider.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../../drizzle/0075_automation_slack_connections.sql", import.meta.url), "utf8"),
    ]);
    expect(source).toContain('code_challenge_method: "S256"');
    expect(source).toContain("stateHash: await sha256Hex(state)");
    expect(source).toContain("isNull(slackOauthAttempt.consumedAt)");
    expect(source).toContain("REQUIRED_SCOPES");
    expect(source).toContain('purpose: "slack_access_token"');
    expect(source).not.toContain("accessToken: body.access_token");
    expect(migration).toMatch(/"slack_connection"[\s\S]*"access_token_ciphertext" text NOT NULL/);
    expect(migration).toContain("slack_oauth_attempt_state_unique");
  });

  it("discovers only public/private channels and excludes DMs and MPIMs", async () => {
    let requestedUrl = "";
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({
      channels: [
        { id: "C1", name: "general" },
        { id: "G1", is_private: true, name: "leadership" },
        { id: "D1", is_im: true, name: "direct" },
        { id: "G2", is_mpim: true, name: "group-dm" },
      ],
      ok: true,
      response_metadata: { next_cursor: "" },
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await expect(listSlackChannels(env, await connection(), fetcher)).resolves.toEqual([
      { id: "C1", isPrivate: false, name: "general" },
      { id: "G1", isPrivate: true, name: "leadership" },
    ]);
    expect(requestedUrl).toContain("types=public_channel%2Cprivate_channel");
  });

  it("uses a stable client message id and classifies provider rate limits", async () => {
    let requestedBody = "";
    const success = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestedBody = String(init?.body);
      return new Response(JSON.stringify({ channel: "C1", ok: true, ts: "123.456" }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    await expect(sendSlackMessage(env, await connection(), { channelId: "C1", deliveryId: "slack_delivery", text: "Hello" }, success)).resolves.toEqual({ channelId: "C1", messageTs: "123.456" });
    expect(requestedBody).toContain('"client_msg_id":"slack_delivery"');

    await expect(sendSlackMessage(env, await connection(), { channelId: "C1", deliveryId: "slack_delivery", text: "Hello" }, async () => new Response(JSON.stringify({ error: "ratelimited", ok: false }), {
      headers: { "content-type": "application/json", "retry-after": "3" }, status: 429,
    }))).rejects.toMatchObject({ code: "SLACK_RATE_LIMITED", retryAfterMs: 3_000, retryable: true });
  });

  it("classifies revocation as terminal reconnect state", async () => {
    await expect(sendSlackMessage(env, await connection(), { channelId: "C1", deliveryId: "slack_delivery", text: "Hello" }, async () => new Response(JSON.stringify({ error: "token_revoked", ok: false }), {
      headers: { "content-type": "application/json" }, status: 200,
    }))).rejects.toEqual(expect.objectContaining({ code: "SLACK_CONNECTION_REVOKED", retryable: false }));
  });
});
