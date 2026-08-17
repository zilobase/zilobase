import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  transition: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../api-keys", () => ({
  rejectMismatchedApiKeyWorkspace: () => null,
}));
vi.mock("./meeting-service", () => ({
  createMeeting: mocks.create,
  deleteMeeting: mocks.delete,
  getMeetingForUser: mocks.get,
  transitionMeeting: mocks.transition,
  updateMeeting: mocks.update,
}));

import { meetingRoutes } from "./meeting-routes";

const user = { id: "user-1" };

function appFor(authenticated = true) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", authenticated ? (user as never) : null);
    c.set("session", null);
    c.set("authMethod", authenticated ? "session" : null);
    c.set("apiKey", null);
    c.set("editionExtension", null);
    c.set("requestId", "request-1");
    c.set("serverTimings", []);
    await next();
  });
  app.route("/meetings", meetingRoutes);
  return app;
}

const env = { MEETING_BLOCK_ENABLED: "true" };

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.create.mockResolvedValue({ id: "meeting-1", status: "idle" });
  mocks.get.mockResolvedValue({ id: "meeting-1", status: "idle" });
  mocks.transition.mockResolvedValue({ id: "meeting-1", status: "recording" });
});

test("meeting routes are unavailable until the feature is enabled", async () => {
  const response = await appFor().request("/meetings/meeting-1", {}, {});
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Meeting blocks are not enabled" });
});

test("meeting routes require authentication", async () => {
  const response = await appFor(false).request("/meetings/meeting-1", {}, env);
  assert.equal(response.status, 401);
});

test("meeting creation validates and forwards a scoped payload", async () => {
  const invalid = await appFor().request(
    "/meetings",
    {
      body: JSON.stringify({ workspaceId: "workspace-1" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    env,
  );
  assert.equal(invalid.status, 400);

  const response = await appFor().request(
    "/meetings",
    {
      body: JSON.stringify({
        pageId: "page-1",
        title: "Weekly review",
        workspaceId: "workspace-1",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    env,
  );
  assert.equal(response.status, 201);
  assert.deepEqual(mocks.create.mock.calls[0]?.[0], {
    pageId: "page-1",
    title: "Weekly review",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
});

test("meeting lifecycle endpoints use the validated action", async () => {
  const response = await appFor().request(
    "/meetings/meeting-1/stop",
    {
      body: JSON.stringify({ durationMs: 42_000 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.transition.mock.calls[0]?.[0], {
    action: "stop",
    durationMs: 42_000,
    meetingId: "meeting-1",
    userId: "user-1",
  });
});
