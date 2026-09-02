import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppBindings } from "../../../shared/types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  detail: vi.fn(),
  duplicate: vi.fn(),
  catalog: vi.fn(),
  list: vi.fn(),
  pause: vi.fn(),
  update: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("./service", () => {
  class DatabaseAutomationError extends Error {
    constructor(
      message: string,
      readonly status = 400,
      readonly code = "AUTOMATION_ERROR",
      readonly validation?: unknown,
    ) {
      super(message);
    }
  }
  return {
    createDatabaseAutomation: mocks.create,
    DatabaseAutomationError,
    deleteDatabaseAutomation: mocks.delete,
    duplicateDatabaseAutomation: mocks.duplicate,
    getDatabaseAutomation: mocks.detail,
    getDatabaseAutomationCatalog: mocks.catalog,
    listDatabaseAutomations: mocks.list,
    setDatabaseAutomationPaused: mocks.pause,
    updateDatabaseAutomation: mocks.update,
    validateDatabaseAutomation: mocks.validate,
  };
});

import { databaseAutomationRoutes } from "./routes";

const validDefinition = {
  actions: [{
    id: "action-1",
    operations: [{ mode: "clear", propertyId: "name" }],
    type: "edit_trigger_page",
  }],
  definitionVersion: 1,
  scope: { type: "data_source" },
  timezone: "UTC",
  trigger: {
    clauses: [{ id: "trigger-1", type: "page_added" }],
    kind: "event",
    match: "any",
  },
};

function app(authenticated = true) {
  const application = new Hono<AppBindings>();
  if (authenticated) {
    application.use("*", async (c, next) => {
      c.set("user", { id: "user-1" } as AppBindings["Variables"]["user"]);
      c.set("editionExtension", null);
      await next();
    });
  }
  application.route("/", databaseAutomationRoutes);
  return application;
}

describe("database automation routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication and a source-scoped list query", async () => {
    expect((await app(false).request("/database-1/automations?dataSourceId=source-1")).status).toBe(401);
    expect((await app().request("/database-1/automations")).status).toBe(400);
  });

  it("requires matching creation idempotency keys", async () => {
    const body = JSON.stringify({
      dataSourceId: "source-1",
      definition: validDefinition,
      idempotencyKey: "request-1",
      name: "Automation",
    });
    expect((await app().request("/database-1/automations", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    })).status).toBe(400);
    expect((await app().request("/database-1/automations", {
      body,
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "different",
      },
      method: "POST",
    })).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates idempotently and preserves 201 versus replayed 200", async () => {
    const request = () => app().request("/database-1/automations", {
      body: JSON.stringify({
        dataSourceId: "source-1",
        definition: validDefinition,
        idempotencyKey: "request-1",
        name: "Automation",
      }),
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "request-1",
      },
      method: "POST",
    });
    mocks.create.mockResolvedValueOnce({ automation: { id: "automation-1" }, created: true });
    expect((await request()).status).toBe(201);
    mocks.create.mockResolvedValueOnce({ automation: { id: "automation-1" }, created: false });
    expect((await request()).status).toBe(200);
  });

  it("requires a revision If-Match for edits and forwards its version", async () => {
    const request = (ifMatch?: string) => app().request("/database-1/automations/automation-1", {
      body: JSON.stringify({ definition: validDefinition, name: "Updated" }),
      headers: {
        "content-type": "application/json",
        ...(ifMatch ? { "If-Match": ifMatch } : {}),
      },
      method: "PATCH",
    });
    expect((await request()).status).toBe(428);
    mocks.update.mockResolvedValue({ id: "automation-1", version: 4 });
    expect((await request('W/"3"')).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3 }));
  });

  it("returns field-addressed validation failures without persisting", async () => {
    const response = await app().request("/database-1/automations/validate", {
      body: JSON.stringify({ dataSourceId: "source-1", definition: { nope: true } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.code).toBe("AUTOMATION_INVALID_REQUEST");
    expect(body.validation.valid).toBe(false);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
