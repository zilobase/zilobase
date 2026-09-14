import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../shared/types";
import { responseJson } from "../../test-support/response";

const mocks = vi.hoisted(() => ({
  databaseRecord: vi.fn(),
  sourceRecord: vi.fn(),
  cell: vi.fn(),
  createProperty: vi.fn(),
  createDatabase: vi.fn(),
  databasePayload: vi.fn(),
  bootstrap: vi.fn(),
  recordWindow: vi.fn(),
  canAccessDatabase: vi.fn(),
  effectiveDatabaseAccess: vi.fn(),
  publishedDatabase: vi.fn(),
  membership: vi.fn(),
  mutationFeed: vi.fn(),
  deleteDatabase: vi.fn(),
  duplicateProperty: vi.fn(),
  restoreDatabase: vi.fn(),
  template: vi.fn(),
  updateDatabase: vi.fn(),
}));
vi.mock("../access", async (original) => ({
  ...(await original<typeof import("../access")>()),
  canAccessDatabaseRecord: mocks.canAccessDatabase,
  getEffectiveDatabaseAccessForRecord: mocks.effectiveDatabaseAccess,
  getMembership: mocks.membership,
  isDatabasePublishedInWorkspace: mocks.publishedDatabase,
}));

vi.mock("./access/database-access", async (original) => ({
  ...(await original<typeof import("./access/database-access")>()),
  getDatabaseRecord: mocks.databaseRecord,
}));
vi.mock("./access/data-source-access", async (original) => ({
  ...(await original<typeof import("./access/data-source-access")>()),
  getDataSourceRecord: mocks.sourceRecord,
}));
vi.mock("./properties/cell-service", () => ({
  setDatabaseCellValueService: mocks.cell,
}));
vi.mock("./properties/service", () => ({
  createDatabasePropertyService: mocks.createProperty,
  updateDatabasePropertyService: vi.fn(),
}));
vi.mock("./properties/duplication-service", () => ({
  duplicateDatabasePropertyService: mocks.duplicateProperty,
}));
vi.mock("./templates/service", () => ({
  applyDatabaseTemplateService: mocks.template,
}));
vi.mock("./core/payload", () => ({
  getDatabasePayload: mocks.databasePayload,
  getDatabaseSchemaPayload: vi.fn(),
}));
vi.mock("./core/service", () => ({
  createDatabaseService: mocks.createDatabase,
  deleteDatabaseService: mocks.deleteDatabase,
  restoreDatabaseService: mocks.restoreDatabase,
  updateDatabaseService: mocks.updateDatabase,
}));
vi.mock("./read/service", async (original) => ({
  ...(await original<typeof import("./read/service")>()),
  getDatabaseBootstrapService: mocks.bootstrap,
  getDatabaseRecordWindowService: mocks.recordWindow,
}));
vi.mock("./history/service", async (original) => ({
  ...(await original<typeof import("./history/service")>()),
  getDatabaseMutationFeed: mocks.mutationFeed,
}));

import { databaseRoutes } from "./database-routes";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { attachHttpRouteErrorHandler } from "../../shared/http/route-error";

const user = {
  email: "user@example.com",
  id: "user-1",
  image: null,
  name: "User",
};
const commit = {
  actorId: "user-1",
  changed: ["rows", "values"] as const,
  committedAt: "2026-08-03T00:00:00.000Z",
  databaseId: "database-1",
  delta: { values: [{ pageId: "page-1", propertyId: "property-1", value: "Done" }] },
  mutationId: "mutation-1",
  version: 2,
};

function appWithUser(authMethod: "apiKey" | "session" = "session") {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    c.set("authMethod", authMethod);
    c.set("apiKey", null);
    await next();
  });
  app.route("/databases", databaseRoutes);
  attachHttpRouteErrorHandler(app);
  return app;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.canAccessDatabase.mockResolvedValue(true);
  mocks.effectiveDatabaseAccess.mockResolvedValue("edit");
  mocks.membership.mockResolvedValue({ id: "membership-1" });
  mocks.publishedDatabase.mockResolvedValue(false);
});

test("v2 bootstrap route returns metadata without invoking the legacy payload", async () => {
  const record = {
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  };
  const bootstrap = {
    database: { id: "database-1" },
    dataSources: [],
    properties: [],
    views: [],
  };
  mocks.databaseRecord.mockResolvedValue(record);
  mocks.bootstrap.mockResolvedValue(bootstrap);

  const response = await appWithUser().request(
    "/databases/database-1/bootstrap?viewId=view-1",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), bootstrap);
  assert.deepEqual(mocks.bootstrap.mock.calls[0]?.[0], {
    accessLevel: "edit",
    databaseId: "database-1",
    existingRecord: record,
    includeDeleted: false,
    userId: "user-1",
    viewId: "view-1",
  });
  assert.equal(mocks.databasePayload.mock.calls.length, 0);
});

test("v2 record route forwards exact windows and deleted scope", async () => {
  const record = {
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  };
  const window = {
    databaseVersion: 1,
    dataSourceVersion: 1,
    hasMore: false,
    offset: 25,
    records: [],
    snapshot: "next",
    totalCount: 25,
  };
  mocks.databaseRecord.mockResolvedValue(record);
  mocks.recordWindow.mockResolvedValue(window);

  const response = await appWithUser().request(
    "/databases/database-1/data-sources/source-1/records" +
      "?viewId=view-1&offset=25&limit=25&snapshot=current&includeDeleted=1",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), window);
  assert.deepEqual(mocks.recordWindow.mock.calls[0]?.[0], {
    databaseId: "database-1",
    dataSourceId: "source-1",
    existingRecord: record,
    includeDeleted: true,
    limit: 25,
    offset: 25,
    snapshot: "current",
    userId: "user-1",
    viewId: "view-1",
  });
});

test("v2 record route exposes stale-window and source/view conflicts", async () => {
  const { DatabaseWindowStaleError } = await import("./read/service");
  mocks.databaseRecord.mockResolvedValue({
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.recordWindow.mockRejectedValueOnce(
    new DatabaseWindowStaleError("fresh-snapshot"),
  );
  const stale = await appWithUser().request(
    "/databases/database-1/data-sources/source-1/records?limit=50&snapshot=old",
  );
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), {
    code: "WINDOW_STALE",
    currentSnapshot: "fresh-snapshot",
    error: "The database record window is stale",
  });

  mocks.recordWindow.mockRejectedValueOnce(
    new ServiceMutationError("Database view not found", 404),
  );
  const mismatch = await appWithUser().request(
    "/databases/database-1/data-sources/source-1/records?viewId=foreign-view",
  );
  assert.equal(mismatch.status, 404);
});

test("v2 reads support published databases and reject invalid limits", async () => {
  const record = {
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  };
  mocks.databaseRecord.mockResolvedValue(record);
  mocks.canAccessDatabase.mockResolvedValue(false);
  mocks.publishedDatabase.mockResolvedValue(true);
  mocks.bootstrap.mockResolvedValue({
    database: { accessLevel: null, id: "database-1" },
    dataSources: [],
    properties: [],
    views: [],
  });

  const publicApp = new Hono<AppBindings>();
  publicApp.route("/databases", databaseRoutes);
  attachHttpRouteErrorHandler(publicApp);
  assert.equal(
    (await publicApp.request("/databases/database-1/bootstrap")).status,
    200,
  );

  const invalid = await appWithUser().request(
    "/databases/database-1/data-sources/source-1/records?limit=51",
  );
  assert.equal(invalid.status, 400);
  assert.equal(mocks.recordWindow.mock.calls.length, 0);
});

test("mutation catch-up validates and forwards the version window", async () => {
  mocks.databaseRecord.mockResolvedValue({
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.mutationFeed.mockResolvedValue({
    events: [],
    hasMore: false,
    latestVersion: 8,
    resetRequired: false,
  });
  const response = await appWithUser().request(
    "/databases/database-1/mutations?afterVersion=6&limit=2",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.mutationFeed.mock.calls[0]?.[0], {
    afterVersion: 6,
    databaseId: "database-1",
    limit: 2,
  });

  const invalid = await appWithUser().request(
    "/databases/database-1/mutations?afterVersion=-1",
  );
  assert.equal(invalid.status, 400);
  assert.equal(mocks.mutationFeed.mock.calls.length, 1);
});

test("database mutation routes require authentication", async () => {
  const response = await databaseRoutes.request("/database-1/properties", {
    body: JSON.stringify({ name: "Status", type: "status" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 401);
});

test("embedded database creation preserves an omitted teamspace for parent inheritance", async () => {
  mocks.createDatabase.mockResolvedValue({
    databaseId: "database-1",
    name: "New database",
    parentPlacement: null,
  });
  mocks.databasePayload.mockResolvedValue({
    database: {
      id: "database-1",
      pageId: "page-1",
      teamspaceId: "teamspace-1",
      workspaceId: "workspace-1",
    },
    views: [],
  });

  const response = await appWithUser().request("/databases", {
    body: JSON.stringify({
      name: "New database",
      pageId: "page-1",
      workspaceId: "workspace-1",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(mocks.createDatabase.mock.calls[0]?.[0], {
    env: undefined,
    name: "New database",
    pageId: "page-1",
    standalone: false,
    teamspaceId: undefined,
    userId: "user-1",
    workspaceId: "workspace-1",
  });
});

test("database property route validates input before calling services", async () => {
  const response = await appWithUser().request("/databases/database-1/properties", {
    body: JSON.stringify({ name: 7, position: -1, type: "text" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 400);
  assert.equal(mocks.createProperty.mock.calls.length, 0);
});

test("database routes map service errors to HTTP responses", async () => {
  mocks.createProperty.mockRejectedValue(
    new ServiceMutationError("Database not found", 404),
  );
  const response = await appWithUser().request("/databases/missing/properties", {
    body: JSON.stringify({ name: "Status", type: "status" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Database not found" });
});

test("cell route returns the service commit response", async () => {
  mocks.cell.mockResolvedValue({ commit });
  const response = await appWithUser().request(
    "/databases/database-1/rows/row-1/properties/property-1",
    {
      body: JSON.stringify({ value: "Done" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    },
  );
  const body = await responseJson<{ mutationId: string; version: number }>(response);
  assert.equal(response.status, 200);
  assert.equal(body.mutationId, "mutation-1");
  assert.equal(body.version, 2);
  assert.deepEqual(mocks.cell.mock.calls[0]?.[0], {
    databaseId: "database-1",
    env: undefined,
    origin: "user",
    pagePropertyId: "property-1",
    rowId: "row-1",
    userId: "user-1",
    value: "Done",
  });
});

test("API-key row mutations carry the api origin", async () => {
  mocks.cell.mockResolvedValue({ commit });
  const response = await appWithUser("apiKey").request(
    "/databases/database-1/rows/row-1/properties/property-1",
    {
      body: JSON.stringify({ value: "Done" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    },
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.cell.mock.calls[0]?.[0].origin, "api");
});

test("duplicate and row routes reject malformed bodies", async () => {
  const duplicate = await appWithUser().request(
    "/databases/database-1/properties/property-1/duplicate",
    {
      body: JSON.stringify({ includeValues: "yes" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert.equal(duplicate.status, 400);

  const row = await appWithUser().request("/databases/database-1/rows", {
    body: JSON.stringify({ position: -1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(row.status, 400);
  assert.equal(mocks.duplicateProperty.mock.calls.length, 0);
});

test("database template route validates and applies the whole template once", async () => {
  const invalid = await appWithUser().request(
    "/databases/database-1/apply-template",
    {
      body: JSON.stringify({ name: "Tasks", properties: [], rows: [{}] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert.equal(invalid.status, 400);
  assert.equal(mocks.template.mock.calls.length, 0);

  const payload = {
    database: { id: "database-1", name: "Tasks" },
    properties: [],
    rows: [],
    values: [],
    views: [],
  };
  mocks.template.mockResolvedValue({ commit, payload });

  const template = {
    config: { emoji: "✅", setupDismissed: true },
    name: "Tasks",
    properties: [{ config: null, name: "Status", type: "status" }],
    rows: [
      {
        content: { type: "doc" },
        metadata: { emoji: "📌" },
        title: "Plan launch",
        values: [{ propertyName: "Status", value: "In progress" }],
      },
    ],
  };
  const response = await appWithUser().request(
    "/databases/database-1/apply-template",
    {
      body: JSON.stringify(template),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
  assert.deepEqual(mocks.template.mock.calls[0]?.[0], {
    ...template,
    databaseId: "database-1",
    env: undefined,
    userId: "user-1",
  });
});


test("OAuth database routes bind database and data-source IDs to the granted workspace", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    c.set("authMethod", "oauth");
    c.set("session", { activeWorkspaceId: "granted" } as never);
    c.set("oauthScopes", ["databases.read", "databases.write"]);
    await next();
  });
  app.route("/databases", databaseRoutes);
  mocks.databaseRecord.mockResolvedValue({ workspaceId: "other" });
  mocks.sourceRecord.mockResolvedValue({ workspaceId: "other" });
  for (const [method, path] of [
    ["GET", "/databases/database-1"],
    ["GET", "/databases/database-1/published"],
    ["DELETE", "/databases/database-1"],
    ["PATCH", "/databases/data-sources/source-1"],
    ["POST", "/databases/source-1/properties"],
    ["POST", "/databases/source-1/rows"],
    ["POST", "/databases/source-1/apply-template"],
    ["GET", "/databases/database-1/automations"],
  ]) {
    assert.equal((await app.request(path!, { method })).status, 403, path);
  }
  assert.equal(mocks.cell.mock.calls.length, 0);
  assert.equal(mocks.deleteDatabase.mock.calls.length, 0);
  assert.equal((await app.request("/databases", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: "other" }),
  })).status, 403);
  mocks.sourceRecord.mockResolvedValue({ workspaceId: "granted" });
  mocks.cell.mockResolvedValue({ commit });
  assert.equal((await app.request("/databases/source-1/rows/row-1/properties/property-1", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "Done" }),
  })).status, 200);
  assert.equal(mocks.cell.mock.calls.length, 1);
});
