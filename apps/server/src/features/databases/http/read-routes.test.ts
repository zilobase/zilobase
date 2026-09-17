import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from   "../../../shared/types";
import { responseJson } from   "../../../test-support/response";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  accessLevel: vi.fn(),
  createTicket: vi.fn(),
  getRecord: vi.fn(),
  membership: vi.fn(),
  payload: vi.fn(),
  published: vi.fn(),
  realtimeExpiration: vi.fn(),
  verifyTicket: vi.fn(),
}));

vi.mock(  "../../access", () => ({
  canAccessDatabaseRecord: mocks.access,
  getEffectiveDatabaseAccessForRecord: mocks.accessLevel,
  getMembership: mocks.membership,
  getWorkspaceRealtimeAccessExpiration: mocks.realtimeExpiration,
  isDatabasePublishedInWorkspace: mocks.published,
}));
vi.mock(  "../../../shared/security/database-realtime-ticket", () => ({
  createDatabaseRealtimeTicket: mocks.createTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX: "zilobase-auth.",
  DATABASE_REALTIME_PROTOCOL: "zilobase.database.v2",
  verifyDatabaseRealtimeTicket: mocks.verifyTicket,
}));
vi.mock(  "../../../infrastructure/runtime/runtime-adapter", () => ({
  getDatabaseRealtimeWebSocketUrl: () => "ws://localhost/realtime",
}));
vi.mock(  "../../../infrastructure/database", () => {
  const emptyQuery = () => {
    const query = {
      from() { return query; },
      innerJoin() { return query; },
      limit() { return Promise.resolve([]); },
      orderBy() { return Promise.resolve([]); },
      then(resolve: (value: unknown[]) => unknown) {
        return Promise.resolve([]).then(resolve);
      },
      where() { return query; },
    };
    return query;
  };
  const db = {
    select: emptyQuery,
    transaction: async (read: (transaction: unknown) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { accessMode: "read only", isolationLevel: "repeatable read" });
      return read(db);
    },
  };
  return { db, runWithDb: (_transaction: unknown, read: () => Promise<unknown>) => read() };
});
vi.mock( "../access/database-access", async (original) => ({
  ...(await original<typeof import( "../access/database-access")>()),
  getDatabaseRecord: mocks.getRecord,
}));
vi.mock( "../core/payload", () => ({
  getDatabaseExportPayload: mocks.payload,
}));

import { databaseReadRoutes } from    "./read-routes";

const record = {
  config: {},
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  deletedAt: null,
  id: "database-1",
  name: "Database",
  pageId: "page-1",
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
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

test("database bootstrap route returns 404 and protects private databases", async () => {
  mocks.getRecord.mockResolvedValueOnce(undefined);
  const missing = await databaseReadRoutes.request("/missing/bootstrap");
  assert.equal(missing.status, 404);

  const privateResponse = await databaseReadRoutes.request("/database-1/bootstrap");
  assert.equal(privateResponse.status, 401);
  assert.deepEqual(await privateResponse.json(), { error: "Unauthorized" });
});

test("database bootstrap route serves schema-only entities", async () => {
  mocks.published.mockResolvedValue(true);
  const published = await databaseReadRoutes.request("/database-1/bootstrap");
  assert.equal(published.status, 200);
  assert.equal((await responseJson<{ database: { accessLevel: null } }>(published)).database.accessLevel, null);

  const response = await sessionApp().request("/database-1/bootstrap");
  assert.equal(response.status, 200);
  assert.equal((await responseJson<{ database: { accessLevel: string } }>(response)).database.accessLevel, "full");
  assert.equal(mocks.payload.mock.calls.length, 0);
});

test("database export route performs an explicit complete source read", async () => {
  mocks.payload.mockResolvedValue({
    activeDataSource: { id: "source-1" },
    database: { id: "database-1" },
    rows: [{ id: "row-1" }],
  });
  const response = await sessionApp().request(
    "/database-1/export?dataSourceId=source-1",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (await responseJson<{ rows: Array<{ id: string }> }>(response)).rows,
    [{ id: "row-1" }],
  );
  assert.deepEqual(mocks.payload.mock.calls[0]?.[3], {
    dataSourceId: "source-1",
  });
});

test("database read route authorizes deleted records through membership", async () => {
  mocks.getRecord.mockResolvedValue({ ...record, deletedAt: new Date() });
  const response = await sessionApp().request("/database-1/bootstrap?includeDeleted=1");
  assert.equal(response.status, 200);
  assert.equal((await responseJson<{ database: { accessLevel: null } }>(response)).database.accessLevel, null);
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
  const body = await responseJson<{
    databaseId: string;
    websocketProtocols: string[];
    websocketUrl: string;
  }>(response);
  assert.equal(response.status, 200);
  assert.equal(body.databaseId, "database-1");
  assert.equal(body.websocketUrl, "ws://localhost/realtime?database=database-1");
  assert.deepEqual(body.websocketProtocols, [
    "zilobase.database.v2",
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


test("OAuth database workspace binding retains the existing ACL", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    c.set("authMethod", "oauth");
    c.set("session", { activeWorkspaceId: record.workspaceId } as never);
    await next();
  });
  app.route("/", databaseReadRoutes);
  mocks.access.mockResolvedValue(false);
  assert.equal((await app.request("/database-1/bootstrap")).status, 403);
  assert.equal(mocks.payload.mock.calls.length, 0);
  mocks.access.mockResolvedValue(true);
  assert.equal((await app.request("/database-1/bootstrap")).status, 200);
});
