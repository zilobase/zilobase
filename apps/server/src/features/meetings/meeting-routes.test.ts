import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../shared/types";

const mocks = vi.hoisted(() => ({
  claimRecorder: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  enqueueJob: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  releaseRecorder: vi.fn(),
  recordConsent: vi.fn(),
  transition: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../api-keys", () => ({
  rejectMismatchedApiKeyWorkspace: () => null,
}));
vi.mock("./meeting-service", () => ({
  claimMeetingRecorder: mocks.claimRecorder,
  createMeeting: mocks.create,
  deleteMeeting: mocks.delete,
  getMeetingForUser: mocks.get,
  listMeetingsForUser: mocks.list,
  releaseMeetingRecorder: mocks.releaseRecorder,
  recordMeetingConsent: mocks.recordConsent,
  transitionMeeting: mocks.transition,
  updateMeeting: mocks.update,
}));
vi.mock("../../ai/ai-jobs", () => ({
  enqueueAiJob: mocks.enqueueJob,
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

const env = {
  BETTER_AUTH_SECRET: "meeting-routes-test-secret",
  MEETING_BLOCK_ENABLED: "true",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.create.mockResolvedValue({ id: "meeting-1", status: "idle" });
  mocks.list.mockResolvedValue([
    { emoji: "📅", id: "meeting-1", status: "idle", title: "Weekly review" },
  ]);
  mocks.claimRecorder.mockResolvedValue({
    leaseExpiresAt: new Date("2026-08-18T00:00:30.000Z"),
    leaseId: "10000000-0000-4000-8000-000000000001",
    meeting: {
      id: "meeting-1",
      status: "idle",
      workspaceId: "workspace-1",
    },
  });
  mocks.get.mockResolvedValue({
    id: "meeting-1",
    status: "idle",
    transcriptRevision: 2,
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
    workspaceId: "workspace-1",
  });
  mocks.recordConsent.mockResolvedValue({ id: "consent-1", mode: "confirmed" });
  mocks.enqueueJob.mockResolvedValue({
    error: null,
    id: "job-1",
    progress: 0,
    status: "queued",
    type: "meeting-summary",
  });
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

test("meeting list requires a workspace and returns accessible meetings", async () => {
  const missingWorkspace = await appFor().request("/meetings", {}, env);
  assert.equal(missingWorkspace.status, 400);

  const response = await appFor().request(
    "/meetings?workspaceId=workspace-1",
    {},
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.list.mock.calls[0]?.[0], {
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  assert.deepEqual(await response.json(), {
    meetings: [
      { emoji: "📅", id: "meeting-1", status: "idle", title: "Weekly review" },
    ],
  });
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
      body: JSON.stringify({
        durationMs: 42_000,
        leaseId: "10000000-0000-4000-8000-000000000001",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.transition.mock.calls[0]?.[0], {
    action: "stop",
    durationMs: 42_000,
    env,
    leaseId: "10000000-0000-4000-8000-000000000001",
    meetingId: "meeting-1",
    userId: "user-1",
  });
});

test("recorder claim returns a scoped native audio ticket", async () => {
  const response = await appFor().request(
    "/meetings/meeting-1/recorder/claim",
    { method: "POST" },
    env,
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.leaseId, "10000000-0000-4000-8000-000000000001");
  assert.equal(typeof payload.token, "string");
  assert.equal(
    payload.websocketUrl,
    "ws://localhost/meeting-audio?meeting=meeting-1",
  );
});

test("summary generation is scoped to the authenticated editor", async () => {
  const response = await appFor().request(
    "/meetings/meeting-1/summary",
    { method: "POST" },
    env,
  );
  assert.equal(response.status, 202);
  assert.deepEqual(mocks.enqueueJob.mock.calls[0]?.[0], {
    dedupeKey: "meeting-1:2:2026-08-18T00:00:00.000Z",
    env,
    input: { meetingId: "meeting-1" },
    type: "meeting-summary",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
});

test("consent acknowledgement is audited before recorder claim", async () => {
  const response = await appFor().request(
    "/meetings/meeting-1/consent",
    {
      body: JSON.stringify({ mode: "confirmed" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    env,
  );
  assert.equal(response.status, 201);
  assert.deepEqual(mocks.recordConsent.mock.calls[0]?.[0], {
    meetingId: "meeting-1",
    mode: "confirmed",
    userId: "user-1",
  });
});
