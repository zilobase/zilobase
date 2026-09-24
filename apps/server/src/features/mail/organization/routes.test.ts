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
          workspaceId: "workspace",
          connection: { id: "account" },
        }
      : new Response(null, { status: 403 }),
}));
vi.mock("./mail-views", async (original) => ({
  ...(await original<typeof import("./mail-views")>()),
  createMailView: async (input: Record<string, unknown>) => {
    state.inputs.push(input);
    return { id: "created" };
  },
  updateMailView: async (input: Record<string, unknown>) => {
    state.inputs.push(input);
    return { id: "updated" };
  },
}));
import { mailOrganizationRoutes } from "./routes";
const app = new Hono<AppBindings>().route("/", mailOrganizationRoutes);
const request = (method: string, body: unknown) =>
  app.request(method === "POST" ? "/views" : "/views/view", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  state.allowed = true;
  state.inputs = [];
});
test("mail view writes authorize before validating their optional fields", async () => {
  for (const method of ["POST", "PATCH"]) {
    state.allowed = false;
    assert.equal((await request(method, null)).status, 403);
    state.allowed = true;
    for (const body of [null, { name: 7 }, { icon: 7 }, { config: null }, { config: false }])
      assert.equal((await request(method, body)).status, 400);
  }
  assert.equal((await request("POST", { templateId: "unknown" })).status, 400);
  assert.deepEqual(state.inputs, []);
});
test("mail view writes preserve omitted values and explicit icon removal", async () => {
  for (const method of ["POST", "PATCH"]) {
    const response = await request(method, {
      name: "Name",
      icon: null,
      config: {},
    });
    assert.equal(response.status, method === "POST" ? 201 : 200);
    const input = state.inputs.at(-1)!;
    assert.deepEqual(input.value, { name: "Name", icon: null, config: {} });
    assert.equal(input.bindingId, "binding");
    assert.equal(input.workspaceId, "workspace");
    assert.equal(input.userId, "user");
    if (method === "PATCH") assert.equal(input.viewId, "view");
    assert.equal((await request(method, {})).status, method === "POST" ? 201 : 200);
    assert.deepEqual(state.inputs.at(-1)!.value, {});
  }
});
