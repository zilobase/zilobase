import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";
import type { AppBindings } from "../../../shared/types";
const state = vi.hoisted(() => ({
  allowed: true,
  inputs: [] as Record<string, unknown>[],
}));
vi.mock("../route-support", async (original) => ({
  ...(await original<typeof import("../route-support")>()),
  requireWorkspaceMailBinding: async () =>
    state.allowed
      ? {
          bindingId: "binding",
          userId: "user",
          connection: { id: "connection" },
        }
      : new Response(null, { status: 403 }),
}));
vi.mock("./mail-query", async (original) => ({
  ...(await original<typeof import("./mail-query")>()),
  queryIndexedMail: async (input: Record<string, unknown>) => {
    state.inputs.push(input);
    return { threads: [] };
  },
  queryIndexedMailGroups: async (input: Record<string, unknown>) => {
    state.inputs.push(input);
    return { groups: [] };
  },
}));
import { mailQueryRoutes } from "./routes";
const app = new Hono<AppBindings>().route("/", mailQueryRoutes);
const request = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  state.allowed = true;
  state.inputs = [];
});
test("mail query binding authorization precedes input validation", async () => {
  state.allowed = false;
  for (const path of ["/query", "/query/groups"])
    assert.equal((await request(path, null)).status, 403);
  assert.deepEqual(state.inputs, []);
});
test("mail query validation preserves shared and query-specific restrictions", async () => {
  for (const path of ["/query", "/query/groups"]) {
    for (const body of [
      null,
      {},
      { routeId: "" },
      { routeId: "x".repeat(201) },
      { routeId: "inbox", filter: null },
      { routeId: "inbox", filter: false },
      { routeId: "inbox", search: 1 },
      { routeId: "inbox", search: "x".repeat(501) },
    ])
      assert.equal((await request(path, body)).status, 400);
  }
  for (const patch of [
    { cursor: null },
    { cursor: 3 },
    { groupKey: false },
    { groupKey: "x".repeat(501) },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: "1" },
  ])
    assert.equal((await request("/query", { routeId: "inbox", ...patch })).status, 400);
  assert.deepEqual(state.inputs, []);
});
test("mail query transport keeps omitted fields distinct from empty strings", async () => {
  assert.equal((await request("/query", { routeId: "inbox" })).status, 200);
  assert.deepEqual(Object.keys(state.inputs[0]).sort(), [
    "bindingId",
    "env",
    "gmailAccountId",
    "routeId",
  ]);
  assert.equal(
    (
      await request("/query", {
        routeId: "inbox",
        cursor: "",
        search: "",
        groupKey: "",
        limit: 1,
      })
    ).status,
    200,
  );
  assert.equal(state.inputs[1].cursor, "");
  assert.equal(state.inputs[1].search, "");
  assert.equal(state.inputs[1].groupKey, "");
  assert.equal(state.inputs[1].limit, 1);
  assert.equal(
    (await request("/query/groups", { routeId: "inbox", cursor: 3, limit: 0 })).status,
    200,
  );
  assert.equal("limit" in state.inputs[2], false);
  assert.equal((await request("/query", { routeId: "inbox", filter: [] })).status, 200);
});
