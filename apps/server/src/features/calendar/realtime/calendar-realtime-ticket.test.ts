import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import {
  createCalendarRealtimeTicket,
  verifyCalendarRealtimeTicket,
} from "./calendar-realtime-ticket";

const env = { COLLABORATION_SECRET: "calendar-realtime-test-secret" };

afterEach(() => vi.useRealTimers());

test("calendar realtime tickets preserve the connection owner and expire quickly", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
  const result = await createCalendarRealtimeTicket(
    {
      bindingId: "binding-1",
      accountId: "connection-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );
  const claims = await verifyCalendarRealtimeTicket(result.ticket, env);

  assert.equal(claims.accountId, "connection-1");
  assert.equal(claims.bindingId, "binding-1");
  assert.equal(claims.userId, "user-1");
  assert.equal(claims.workspaceId, "workspace-1");
  assert.equal(claims.exp, Date.now() + 5 * 60_000);
  assert.equal(result.expiresAt, new Date(claims.exp).toISOString());

  vi.advanceTimersByTime(5 * 60_000 + 1);
  await assert.rejects(
    verifyCalendarRealtimeTicket(result.ticket, env),
    /Expired calendar realtime ticket/,
  );
});

test("calendar realtime tickets reject tampering and the wrong signing key", async () => {
  const { ticket } = await createCalendarRealtimeTicket(
    {
      bindingId: "binding-1",
      accountId: "connection-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );
  const [payload, signature] = ticket.split(".");
  const tampered = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;

  await assert.rejects(
    verifyCalendarRealtimeTicket(`${payload}.${tampered}`, env),
    /Invalid calendar realtime ticket/,
  );
  await assert.rejects(
    verifyCalendarRealtimeTicket(ticket, { COLLABORATION_SECRET: "another-secret" }),
    /Invalid calendar realtime ticket/,
  );
});

test("Calendar rejects Mail tickets even under a shared host secret", async () => {
  const { createMailRealtimeTicket } = await import("../../mail/realtime/mail-realtime-ticket");
  const { ticket } = await createMailRealtimeTicket(
    {
      bindingId: "binding-1",
      connectionId: "account-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );
  await assert.rejects(verifyCalendarRealtimeTicket(ticket, env));
});
