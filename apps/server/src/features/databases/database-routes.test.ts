import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../shared/types";

const mocks = vi.hoisted(() => ({
  cell: vi.fn(),
  createProperty: vi.fn(),
  createDatabase: vi.fn(),
  databasePayload: vi.fn(),
  deleteDatabase: vi.fn(),
  duplicateProperty: vi.fn(),
  restoreDatabase: vi.fn(),
  template: vi.fn(),
  updateDatabase: vi.fn(),
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

import { databaseRoutes } from "./database-routes";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";

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

function appWithUser() {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    c.set("authMethod", "session");
    c.set("apiKey", null);
    await next();
  });
  app.route("/databases", databaseRoutes);
  return app;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
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
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(body.mutationId, "mutation-1");
  assert.equal(body.version, 2);
  assert.deepEqual(mocks.cell.mock.calls[0]?.[0], {
    databaseId: "database-1",
    env: undefined,
    pagePropertyId: "property-1",
    rowId: "row-1",
    userId: "user-1",
    value: "Done",
  });
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
