import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { afterEach, test, vi } from "vitest";

import {
  createDatabaseRealtimeTicket,
  verifyDatabaseRealtimeTicket,
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

test("database realtime tickets preserve scope, identity, and edit capability", async () => {
  const ticket = await createDatabaseRealtimeTicket(
    {
      canEdit: true,
      databaseId: "database-1",
      sessionId: "session-1",
      user: {
        email: "user@example.com",
        id: "user-1",
        name: "User One",
      },
      version: 7,
      workspaceId: "workspace-1",
    },
    env,
  );
  const claims = await verifyDatabaseRealtimeTicket(ticket.token, env);

  assert.equal(claims.canEdit, true);
  assert.equal(claims.databaseId, "database-1");
  assert.equal(claims.sessionId, "session-1");
  assert.equal(claims.user.id, "user-1");
  assert.equal(claims.version, 7);
  assert.equal(claims.workspaceId, "workspace-1");
});

test("database realtime tickets reject tampering", async () => {
  const { token } = await createDatabaseRealtimeTicket(
    {
      canEdit: false,
      databaseId: "database-1",
      user: { id: "user-1", name: "User One" },
      version: 7,
      workspaceId: "workspace-1",
    },
    env,
  );

  const [payload, signature] = token.split(".");
  const tamperedSignature = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
  await assert.rejects(
    verifyDatabaseRealtimeTicket(`${payload}.${tamperedSignature}`, env),
    /Invalid database realtime ticket/,
  );
});

test("database realtime tickets validate shape, expiry, and configuration", async () => {
  await assert.rejects(
    verifyDatabaseRealtimeTicket("missing-segments", env),
    /Invalid database realtime ticket/,
  );
  await assert.rejects(
    verifyDatabaseRealtimeTicket("payload.signature.extra", env),
    /Invalid database realtime ticket/,
  );
  await assert.rejects(
    createDatabaseRealtimeTicket(
      {
        canEdit: false,
        databaseId: "database-1",
        user: { id: "user-1", name: "User One" },
        version: 1,
        workspaceId: "workspace-1",
      },
      {},
    ),
    /COLLABORATION_SECRET or BETTER_AUTH_SECRET is required/,
  );

  const invalidShape = await createDatabaseRealtimeTicket(
    {
      canEdit: false,
      databaseId: "database-1",
      user: { id: "user-1", name: "User One" },
      version: -1,
      workspaceId: "workspace-1",
    },
    env,
  );
  await assert.rejects(
    verifyDatabaseRealtimeTicket(invalidShape.token, env),
    /Expired database realtime ticket/,
  );
  await assert.rejects(
    verifyDatabaseRealtimeTicket(
      await signRawClaims(null, env.COLLABORATION_SECRET),
      env,
    ),
    /Expired database realtime ticket/,
  );

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
  const expiring = await createDatabaseRealtimeTicket(
    {
      canEdit: true,
      databaseId: "database-1",
      user: { id: "user-1", name: "User One" },
      version: 1,
      workspaceId: "workspace-1",
    },
    { BETTER_AUTH_SECRET: "fallback-secret" },
  );
  vi.advanceTimersByTime(30 * 60 * 1000 + 1);
  await assert.rejects(
    verifyDatabaseRealtimeTicket(expiring.token, {
      BETTER_AUTH_SECRET: "fallback-secret",
    }),
    /Expired database realtime ticket/,
  );
});
