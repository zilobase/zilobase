import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import {
  createNavigationRealtimeTicket,
  verifyNavigationRealtimeTicket,
} from "./navigation-realtime-ticket";

const env = { COLLABORATION_SECRET: "navigation-realtime-test-secret" };

afterEach(() => {
  vi.useRealTimers();
});

test("navigation realtime tickets preserve workspace and user scope", async () => {
  const ticket = await createNavigationRealtimeTicket(
    {
      sessionId: "session-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );
  const claims = await verifyNavigationRealtimeTicket(ticket.token, env);

  assert.equal(claims.sessionId, "session-1");
  assert.equal(claims.userId, "user-1");
  assert.equal(claims.workspaceId, "workspace-1");
});

test("navigation realtime tickets honor access expiry", async () => {
  const maxExpiresAt = new Date(Date.now() + 45_000);
  const ticket = await createNavigationRealtimeTicket(
    { userId: "user-1", workspaceId: "workspace-1" },
    env,
    { maxExpiresAt },
  );
  const claims = await verifyNavigationRealtimeTicket(ticket.token, env);

  assert.equal(claims.exp, maxExpiresAt.getTime());
});

test("navigation realtime tickets reject tampering and expiry", async () => {
  const ticket = await createNavigationRealtimeTicket(
    { userId: "user-1", workspaceId: "workspace-1" },
    env,
  );
  const [payload, signature] = ticket.token.split(".");
  const tampered = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
  await assert.rejects(
    verifyNavigationRealtimeTicket(`${payload}.${tampered}`, env),
    /Invalid navigation realtime ticket/,
  );

  vi.useFakeTimers();
  vi.setSystemTime(new Date(ticket.expiresAt).getTime() + 1);
  await assert.rejects(
    verifyNavigationRealtimeTicket(ticket.token, env),
    /Expired navigation realtime ticket/,
  );
});

test("navigation realtime tickets require a configured signing secret", async () => {
  await assert.rejects(
    createNavigationRealtimeTicket(
      { userId: "user-1", workspaceId: "workspace-1" },
      {},
    ),
    /COLLABORATION_SECRET or BETTER_AUTH_SECRET is required/,
  );
});
