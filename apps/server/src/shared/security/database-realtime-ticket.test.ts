import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { afterEach, test, vi } from "vitest";

import {
  createDataSourceRealtimeTicket,
  verifyDataSourceRealtimeTicket,
} from "./database-realtime-ticket";

const env = { COLLABORATION_SECRET: "database-realtime-test-secret" };

async function signRawClaims(value: unknown, secret: string) {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${Buffer.from(signature).toString("base64url")}`;
}

afterEach(() => {
  vi.useRealTimers();
});

test("data source realtime tickets carry only source identity and clock", async () => {
  const ticket = await createDataSourceRealtimeTicket(
    {
      canEdit: true,
      sessionId: "session-1",
      sourceId: "source-1",
      sourceVersion: 11,
      user: { id: "user-1", name: "User One" },
      workspaceId: "workspace-1",
    },
    env,
  );
  const claims = await verifyDataSourceRealtimeTicket(ticket.token, env);

  assert.equal(claims.sourceId, "source-1");
  assert.equal(claims.sourceVersion, 11);
  assert.equal(claims.sessionId, "session-1");
  assert.equal("databaseId" in claims, false);
  assert.equal("version" in claims, false);
});

test("data source tickets reject host-shaped claims", async () => {
  const token = await signRawClaims({
    canEdit: true,
    databaseId: "database-1",
    exp: Date.now() + 60_000,
    sessionId: "session-1",
    user: { id: "user-1", name: "User One" },
    version: 3,
    workspaceId: "workspace-1",
  }, env.COLLABORATION_SECRET);

  await assert.rejects(
    verifyDataSourceRealtimeTicket(token, env),
    /Expired data source realtime ticket/,
  );
});

test("data source realtime tickets are capped by temporary membership expiry", async () => {
  const maxExpiresAt = new Date(Date.now() + 45_000);
  const ticket = await createDataSourceRealtimeTicket(
    {
      canEdit: true,
      sourceId: "source-1",
      sourceVersion: 7,
      user: { id: "user-1", name: "User One" },
      workspaceId: "workspace-1",
    },
    env,
    { maxExpiresAt },
  );
  const claims = await verifyDataSourceRealtimeTicket(ticket.token, env);

  assert.equal(claims.exp, maxExpiresAt.getTime());
});

test("data source realtime tickets reject tampering", async () => {
  const { token } = await createDataSourceRealtimeTicket(
    {
      canEdit: false,
      sourceId: "source-1",
      sourceVersion: 7,
      user: { id: "user-1", name: "User One" },
      workspaceId: "workspace-1",
    },
    env,
  );

  const [payload, signature] = token.split(".");
  const tamperedSignature = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
  await assert.rejects(
    verifyDataSourceRealtimeTicket(`${payload}.${tamperedSignature}`, env),
    /Invalid data source realtime ticket/,
  );
});

test("data source realtime tickets validate shape, expiry, and configuration", async () => {
  await assert.rejects(
    verifyDataSourceRealtimeTicket("missing-segments", env),
    /Invalid data source realtime ticket/,
  );
  await assert.rejects(
    verifyDataSourceRealtimeTicket("payload.signature.extra", env),
    /Invalid data source realtime ticket/,
  );
  await assert.rejects(
    createDataSourceRealtimeTicket(
      {
        canEdit: false,
        sourceId: "source-1",
        sourceVersion: 1,
        user: { id: "user-1", name: "User One" },
        workspaceId: "workspace-1",
      },
      {},
    ),
    /COLLABORATION_SECRET or BETTER_AUTH_SECRET is required/,
  );

  const invalidShape = await createDataSourceRealtimeTicket(
    {
      canEdit: false,
      sourceId: "source-1",
      sourceVersion: -1,
      user: { id: "user-1", name: "User One" },
      workspaceId: "workspace-1",
    },
    env,
  );
  await assert.rejects(
    verifyDataSourceRealtimeTicket(invalidShape.token, env),
    /Expired data source realtime ticket/,
  );
  await assert.rejects(
    verifyDataSourceRealtimeTicket(
      await signRawClaims(null, env.COLLABORATION_SECRET),
      env,
    ),
    /Expired data source realtime ticket/,
  );

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
  const expiring = await createDataSourceRealtimeTicket(
    {
      canEdit: true,
      sourceId: "source-1",
      sourceVersion: 1,
      user: { id: "user-1", name: "User One" },
      workspaceId: "workspace-1",
    },
    { BETTER_AUTH_SECRET: "fallback-secret" },
  );
  vi.advanceTimersByTime(30 * 60 * 1000 + 1);
  await assert.rejects(
    verifyDataSourceRealtimeTicket(expiring.token, {
      BETTER_AUTH_SECRET: "fallback-secret",
    }),
    /Expired data source realtime ticket/,
  );
});
