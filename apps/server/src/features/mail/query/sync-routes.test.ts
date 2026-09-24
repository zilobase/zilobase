import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";
import type { AppBindings } from "../../../shared/types";
const state = vi.hoisted(() => ({
  allowed: true,
  inputs: [] as unknown[][],
  metrics: [] as unknown[][],
  mode: "incremental",
}));
vi.mock("../route-support", async (original) => ({
  ...(await original<typeof import("../route-support")>()),
  requireOwnedConnection: async () =>
    state.allowed
      ? { userId: "user", connection: { id: "connection", mailboxRevision: 7 } }
      : new Response(null, { status: 403 }),
  runMailOperation: async (
    _context: unknown,
    _user: unknown,
    _connection: unknown,
    run: (gateway: unknown) => unknown,
  ) => run({ controlled: true }),
}));
vi.mock("../sync/mail-sync", () => ({
  synchronizeMailbox: async (...args: unknown[]) => {
    state.inputs.push(args);
    return { mode: state.mode };
  },
}));
vi.mock("../mail-metrics", () => ({
  recordMailMetric: async (...args: unknown[]) => {
    state.metrics.push(args);
  },
}));
import { mailSyncRoutes } from "./routes";
const app = new Hono<AppBindings>().route("/", mailSyncRoutes);
const request = (body: unknown) =>
  app.request("/sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  state.allowed = true;
  state.inputs = [];
  state.metrics = [];
  state.mode = "incremental";
});
test("mail sync rejects unauthorized owners before validating requests and cursors", async () => {
  state.allowed = false;
  assert.equal((await request(null)).status, 403);
  state.allowed = true;
  for (const body of [
    null,
    {},
    { connectionId: "other", view: "inbox" },
    { connectionId: "connection", view: "unknown" },
  ])
    assert.equal((await request(body)).status, 400);
  for (const patch of [
    { historyId: 3 },
    { pageToken: 3 },
    { query: 3 },
    { knownMessageIds: [null] },
    { knownThreadIds: [null] },
  ])
    assert.equal(
      (await request({ connectionId: "connection", view: "inbox", ...patch })).status,
      400,
    );
  assert.deepEqual(state.inputs, []);
});
test("mail sync passes the connection revision and distinguishes recovery metrics", async () => {
  const body = {
    connectionId: "connection",
    view: "inbox",
    historyId: "123",
    knownMessageIds: ["message"],
  };
  assert.equal((await request(body)).status, 200);
  assert.deepEqual(state.inputs[0], [{ controlled: true }, body, 7]);
  assert.equal(state.metrics[0][0], "sync");
  state.mode = "recovery";
  assert.deepEqual(await (await request(body)).json(), { mode: "recovery" });
  assert.equal(state.metrics[1][0], "cursor_reset");
});
