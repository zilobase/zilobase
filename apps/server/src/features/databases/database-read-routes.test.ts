import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../types";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  accessLevel: vi.fn(),
  createTicket: vi.fn(),
  getRecord: vi.fn(),
  membership: vi.fn(),
  payload: vi.fn(),
  published: vi.fn(),
  realtimeExpiration: vi.fn(),
  schemaPayload: vi.fn(),
  verifyTicket: vi.fn(),
}));

vi.mock("../../access", () => ({
  canAccessDatabaseRecord: mocks.access,
  getEffectiveDatabaseAccessForRecord: mocks.accessLevel,
  getMembership: mocks.membership,
  getWorkspaceRealtimeAccessExpiration: mocks.realtimeExpiration,
  isDatabasePublishedInWorkspace: mocks.published,
}));
vi.mock("../../database-realtime-ticket", () => ({
  createDatabaseRealtimeTicket: mocks.createTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX: "zilobase-auth.",
  DATABASE_REALTIME_PROTOCOL: "zilobase-realtime-v1",
  verifyDatabaseRealtimeTicket: mocks.verifyTicket,
}));
vi.mock("../../runtime-adapter", () => ({
  getDatabaseRealtimeWebSocketUrl: () => "ws://localhost/realtime",
}));
vi.mock("../../services/database-access", () => ({
  getDatabaseRecord: mocks.getRecord,
}));
vi.mock("../../services/database-payload", () => ({
  getDatabasePayload: mocks.payload,
  getDatabaseSchemaPayload: mocks.schemaPayload,
}));

import { databaseReadRoutes } from "./database-read-routes";

const record = {
  deletedAt: null,
  id: "database-1",
  version: 7,
  workspaceId: "workspace-1",
};
const user = {
  email: "user@example.com",
  id: "user-1",
  image: null,
  name: "User",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getRecord.mockResolvedValue(record);
  mocks.access.mockResolvedValue(true);
  mocks.accessLevel.mockResolvedValue("full");
  mocks.membership.mockResolvedValue({ id: "membership-1" });
  mocks.payload.mockResolvedValue({ database: { id: "database-1" }, rows: [] });
  mocks.schemaPayload.mockResolvedValue({ database: { id: "database-1" } });
  mocks.published.mockResolvedValue(false);
  mocks.realtimeExpiration.mockResolvedValue(null);
  mocks.createTicket.mockResolvedValue({ expiresAt: "2026-08-04T00:00:00.000Z", token: "ticket" });
});

function sessionApp() {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    c.set("authMethod", "session");
    await next();
  });
  app.route("/", databaseReadRoutes);
  return app;
}

test("database read route returns 404 and protects private databases", async () => {
  mocks.getRecord.mockResolvedValueOnce(undefined);
  const missing = await databaseReadRoutes.request("/missing");
  assert.equal(missing.status, 404);

  const privateResponse = await databaseReadRoutes.request("/database-1");
  assert.equal(privateResponse.status, 401);
  assert.deepEqual(await privateResponse.json(), { error: "Unauthorized" });
});

test("database read route serves published and schema-only payloads", async () => {
  mocks.published.mockResolvedValue(true);
  const published = await databaseReadRoutes.request("/database-1");
  assert.equal(published.status, 200);
  assert.equal((await published.json() as any).database.accessLevel, null);

  const response = await sessionApp().request("/database-1?schemaOnly=1");
  assert.equal(response.status, 200);
  assert.equal((await response.json() as any).database.accessLevel, "full");
  assert.equal(mocks.schemaPayload.mock.calls.length, 1);
});

test("database read route authorizes deleted records through membership", async () => {
  mocks.getRecord.mockResolvedValue({ ...record, deletedAt: new Date() });
  const response = await sessionApp().request("/database-1?includeDeleted=1");
  assert.equal(response.status, 200);
  assert.equal((await response.json() as any).database.accessLevel, "none");
  assert.equal(mocks.membership.mock.calls.length, 1);
});

test("realtime ticket route requires a session and database access", async () => {
  const unauthorized = await databaseReadRoutes.request(
    "/database-1/realtime-ticket",
    { method: "POST" },
  );
  assert.equal(unauthorized.status, 401);

  mocks.accessLevel.mockResolvedValue("none");
  const forbidden = await sessionApp().request(
    "/database-1/realtime-ticket",
    { method: "POST" },
  );
  assert.equal(forbidden.status, 403);
});

test("realtime ticket route creates and refreshes scoped tickets", async () => {
  mocks.verifyTicket.mockResolvedValue({
    databaseId: "database-1",
    sessionId: "session-1",
    user: { id: "user-1" },
  });
  const response = await sessionApp().request(
    "/database-1/realtime-ticket",
    {
      body: JSON.stringify({ token: "old-ticket" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(body.databaseId, "database-1");
  assert.equal(body.websocketUrl, "ws://localhost/realtime?database=database-1");
  assert.deepEqual(body.websocketProtocols, [
    "zilobase-realtime-v1",
    "zilobase-auth.ticket",
  ]);
  assert.equal(mocks.createTicket.mock.calls[0]?.[0].sessionId, "session-1");
});

test("published route reports missing and published databases", async () => {
  mocks.getRecord.mockResolvedValueOnce(undefined);
  const missing = await databaseReadRoutes.request("/missing/published");
  assert.equal(missing.status, 404);

  mocks.published.mockResolvedValue(true);
  const response = await databaseReadRoutes.request("/database-1/published");
  assert.deepEqual(await response.json(), { published: true });
});
