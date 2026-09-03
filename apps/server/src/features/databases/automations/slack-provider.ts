import { and, eq, gt, isNull } from "drizzle-orm";

import { db, runWithDbEnv } from "../../../infrastructure/database";
import { slackConnection, slackOauthAttempt } from "../../../infrastructure/database/schema";
import { getCanonicalApiOrigin, getRequiredStringEnv, getStringEnv, isAutomationSlackEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { requestSignal } from "../../../shared/http/request";
import { decryptAutomationSecret, encryptAutomationSecret } from "./secret-crypto";

const AUTHORIZATION_URL = "https://slack.com/oauth/v2/authorize";
const TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const REQUIRED_SCOPES = ["channels:read", "chat:write", "groups:read"] as const;
const OAUTH_TTL_MS = 10 * 60_000;

export class SlackProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly retryable = false,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "SlackProviderError";
  }
}

export function slackProviderConfigured(env: RuntimeEnv) {
  return isAutomationSlackEnabled(env) && Boolean(
    getStringEnv(env, "SLACK_CLIENT_ID") &&
    getStringEnv(env, "SLACK_CLIENT_SECRET") &&
    getStringEnv(env, "AUTOMATION_SECRET_ENCRYPTION_KEY"),
  );
}

export async function beginSlackOauth(env: RuntimeEnv, input: { userId: string; workspaceId: string }) {
  if (!slackProviderConfigured(env)) throw new SlackProviderError("Slack is not configured on this server", "SLACK_NOT_CONFIGURED", 503);
  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const challenge = bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const id = crypto.randomUUID();
  const encrypted = await encryptAutomationSecret(env, verifier, {
    ownerUserId: input.userId,
    purpose: "slack_oauth_verifier",
    secretId: id,
    workspaceId: input.workspaceId,
  });
  const now = new Date();
  await db.insert(slackOauthAttempt).values({
    codeVerifierCiphertext: encrypted.ciphertext,
    codeVerifierIv: encrypted.iv,
    codeVerifierKeyVersion: encrypted.keyVersion,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OAUTH_TTL_MS),
    id,
    stateHash: await sha256Hex(state),
    updatedAt: now,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const url = new URL(AUTHORIZATION_URL);
  url.search = new URLSearchParams({
    client_id: getRequiredStringEnv(env, "SLACK_CLIENT_ID"),
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: slackOauthCallbackUrl(env),
    scope: REQUIRED_SCOPES.join(","),
    state,
  }).toString();
  return url.toString();
}

export async function completeSlackOauth(
  env: RuntimeEnv,
  input: { code: string; state: string },
  fetcher: typeof fetch = fetch,
) {
  return runWithDbEnv(env, async () => {
    const [attempt] = await db.select().from(slackOauthAttempt).where(and(
      eq(slackOauthAttempt.stateHash, await sha256Hex(input.state)),
      isNull(slackOauthAttempt.consumedAt),
      gt(slackOauthAttempt.expiresAt, new Date()),
    )).limit(1);
    if (!attempt) throw new SlackProviderError("This Slack connection request has expired", "SLACK_OAUTH_EXPIRED");
    const consumed = await db.update(slackOauthAttempt).set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(slackOauthAttempt.id, attempt.id), isNull(slackOauthAttempt.consumedAt)))
      .returning({ id: slackOauthAttempt.id });
    if (consumed.length !== 1) throw new SlackProviderError("This Slack connection request was already used", "SLACK_OAUTH_USED");
    const verifier = await decryptAutomationSecret(env, {
      ciphertext: attempt.codeVerifierCiphertext,
      iv: attempt.codeVerifierIv,
      keyVersion: attempt.codeVerifierKeyVersion,
    }, {
      ownerUserId: attempt.userId,
      purpose: "slack_oauth_verifier",
      secretId: attempt.id,
      workspaceId: attempt.workspaceId,
    });
    const response = await fetcher(TOKEN_URL, {
      body: new URLSearchParams({
        client_id: getRequiredStringEnv(env, "SLACK_CLIENT_ID"),
        client_secret: getRequiredStringEnv(env, "SLACK_CLIENT_SECRET"),
        code: input.code,
        code_verifier: verifier,
        redirect_uri: slackOauthCallbackUrl(env),
      }),
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: requestSignal(10_000),
    });
    const body = await response.json().catch(() => ({})) as {
      access_token?: string; bot_user_id?: string; error?: string; ok?: boolean; scope?: string;
      team?: { id?: string; name?: string };
    };
    const scopes = new Set((body.scope ?? "").split(/[ ,]+/).filter(Boolean));
    if (!response.ok || !body.ok || !body.access_token || !body.bot_user_id || !body.team?.id || !body.team.name || REQUIRED_SCOPES.some((scope) => !scopes.has(scope))) {
      throw new SlackProviderError("Slack did not grant the required workspace access", body.error ?? "SLACK_OAUTH_REJECTED");
    }
    const [existing] = await db.select({ id: slackConnection.id }).from(slackConnection).where(and(
      eq(slackConnection.workspaceId, attempt.workspaceId),
      eq(slackConnection.ownerUserId, attempt.userId),
      eq(slackConnection.teamId, body.team.id),
    )).limit(1);
    const id = existing?.id ?? crypto.randomUUID();
    const encrypted = await encryptAutomationSecret(env, body.access_token, {
      ownerUserId: attempt.userId,
      purpose: "slack_access_token",
      secretId: id,
      workspaceId: attempt.workspaceId,
    });
    const now = new Date();
    await db.insert(slackConnection).values({
      accessTokenCiphertext: encrypted.ciphertext,
      accessTokenIv: encrypted.iv,
      accessTokenKeyVersion: encrypted.keyVersion,
      botUserId: body.bot_user_id,
      createdAt: now,
      id,
      ownerUserId: attempt.userId,
      scopes: [...scopes].sort(),
      status: "connected",
      teamId: body.team.id,
      teamName: body.team.name,
      updatedAt: now,
      workspaceId: attempt.workspaceId,
    }).onConflictDoUpdate({
      target: [slackConnection.workspaceId, slackConnection.ownerUserId, slackConnection.teamId],
      set: {
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenKeyVersion: encrypted.keyVersion,
        botUserId: body.bot_user_id,
        lastErrorCode: null,
        scopes: [...scopes].sort(),
        status: "connected",
        teamName: body.team.name,
        updatedAt: now,
      },
    });
    return { connectionId: id, workspaceId: attempt.workspaceId };
  });
}

export async function listSlackChannels(env: RuntimeEnv, connection: typeof slackConnection.$inferSelect, fetcher: typeof fetch = fetch) {
  const token = await connectionToken(env, connection);
  const channels: Array<{ id: string; isPrivate: boolean; name: string }> = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ exclude_archived: "true", limit: "200", types: "public_channel,private_channel" });
    if (cursor) query.set("cursor", cursor);
    const body = await slackApi<{ channels?: Array<{ id?: string; is_archived?: boolean; is_im?: boolean; is_mpim?: boolean; is_private?: boolean; name?: string }>; response_metadata?: { next_cursor?: string } }>(
      `https://slack.com/api/conversations.list?${query}`,
      token,
      undefined,
      fetcher,
    );
    for (const channel of body.channels ?? []) {
      if (channel.id && channel.name && !channel.is_archived && !channel.is_im && !channel.is_mpim) {
        channels.push({ id: channel.id, isPrivate: channel.is_private === true, name: channel.name });
      }
    }
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return channels.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function sendSlackMessage(
  env: RuntimeEnv,
  connection: typeof slackConnection.$inferSelect,
  input: { channelId: string; deliveryId: string; text: string },
  fetcher: typeof fetch = fetch,
) {
  const token = await connectionToken(env, connection);
  const body = await slackApi<{ channel?: string; ts?: string }>("https://slack.com/api/chat.postMessage", token, {
    channel: input.channelId,
    client_msg_id: input.deliveryId,
    mrkdwn: true,
    text: input.text,
    unfurl_links: false,
    unfurl_media: false,
  }, fetcher);
  if (!body.ts || !body.channel) throw new SlackProviderError("Slack did not return a message receipt", "SLACK_RECEIPT_MISSING", 502, true);
  return { channelId: body.channel, messageTs: body.ts };
}

async function connectionToken(env: RuntimeEnv, connection: typeof slackConnection.$inferSelect) {
  if (!connection.ownerUserId || connection.status !== "connected") throw new SlackProviderError("Slack connection must be reconnected", "SLACK_CONNECTION_REVOKED", 409);
  return decryptAutomationSecret(env, {
    ciphertext: connection.accessTokenCiphertext,
    iv: connection.accessTokenIv,
    keyVersion: connection.accessTokenKeyVersion,
  }, {
    ownerUserId: connection.ownerUserId,
    purpose: "slack_access_token",
    secretId: connection.id,
    workspaceId: connection.workspaceId,
  });
}

async function slackApi<T>(url: string, token: string, payload?: unknown, fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...(payload === undefined ? {} : { body: JSON.stringify(payload), method: "POST" }),
      headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
      signal: requestSignal(10_000),
    });
  } catch {
    throw new SlackProviderError("Slack request failed", "SLACK_NETWORK_ERROR", 502, true);
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string; ok?: boolean };
  const retryAfter = boundedRetryAfter(response.headers.get("retry-after"));
  if (response.status === 429) throw new SlackProviderError("Slack rate limit reached", "SLACK_RATE_LIMITED", 429, true, retryAfter);
  if (!response.ok || body.ok === false) {
    const revoked = ["account_inactive", "invalid_auth", "not_authed", "token_revoked"].includes(body.error ?? "");
    const retryable = response.status >= 500 || ["fatal_error", "internal_error", "request_timeout", "service_unavailable"].includes(body.error ?? "");
    throw new SlackProviderError(revoked ? "Slack connection must be reconnected" : "Slack rejected the request", revoked ? "SLACK_CONNECTION_REVOKED" : body.error ?? "SLACK_API_ERROR", revoked ? 409 : 502, retryable);
  }
  return body;
}

export function slackOauthCallbackUrl(env: RuntimeEnv) {
  return new URL("/automation-slack/oauth/callback", getCanonicalApiOrigin(env)).toString();
}

function boundedRetryAfter(value: string | null) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(seconds * 1_000, 60 * 60_000)) : null;
}

function randomUrlSafe(bytes: number) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
