import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";

import type { AppBindings } from "../../../shared/types";
import { attachHttpRouteErrorHandler } from "../../../shared/http/route-error";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDatabase: vi.fn(),
  requireDatabase: vi.fn(),
  requireSource: vi.fn(),
  requireSourceView: vi.fn(),
  canEditPage: vi.fn(),
}));

vi.mock("../../access", async (original) => ({
  ...(await original<typeof import("../../access")>()),
  canAccessPageInWorkspace: mocks.canEditPage,
}));

vi.mock("../access/database-access", () => ({
  getDatabaseRecord: mocks.getDatabase,
  requireDatabaseEditAccess: mocks.requireDatabase,
}));
vi.mock("../access/data-source-access", () => ({
  requireDataSourceAccess: mocks.requireSourceView,
  requireDataSourceEditAccess: mocks.requireSource,
}));
vi.mock("../commands/framework", async (original) => ({
  ...(await original<typeof import("../commands/framework")>()),
  executeDatabaseCommand: mocks.execute,
}));

import { databaseCommandRoutes } from "./command-routes";
import { CommandIdReusedError, RowMoveConflictError } from "../commands/framework";

const user = {
  email: "user@example.com",
  id: "user-1",
  image: null,
  name: "User",
};

function appWithUser(authenticated = true) {
  const app = new Hono<AppBindings>();
  if (authenticated) {
    app.use("*", async (c, next) => {
      c.set("user", user as never);
      c.set("authMethod", "session");
      c.set("apiKey", null);
      await next();
    });
  }
  app.route("/databases", databaseCommandRoutes);
  attachHttpRouteErrorHandler(app);
  return app;
}

const acknowledgement = {
  commandId: "command-1",
  event: {
    actorId: "user-1",
    areas: ["databases"],
    changes: {},
    commandId: "command-1",
    committedAt: "2026-09-14T00:00:00.000Z",
    databaseId: "database-1",
    dataSourceId: null,
    eventId: "event-1",
    protocolVersion: 2,
    type: "database.mutation",
    version: 1,
  },
  sourceVersions: {},
  result: null,
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.execute.mockResolvedValue(acknowledgement);
  mocks.requireDatabase.mockResolvedValue({ id: "database-1" });
  mocks.requireSource.mockResolvedValue({ id: "source-1", workspaceId: "workspace" });
  mocks.canEditPage.mockResolvedValue(true);
  mocks.requireSourceView.mockResolvedValue({ id: "source-1" });
});

test("host commands validate their union and forward actor and host scope", async () => {
  const body = {
    command: { patch: { name: "Renamed" }, type: "database.update" },
    commandId: "command-1",
    protocolVersion: 2,
  };
  const response = await appWithUser().request("/databases/database-1/commands", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), acknowledgement);
  assert.deepEqual(mocks.execute.mock.calls[0]?.[0], {
    actorId: "user-1",
    env: undefined,
    request: body,
    scope: { databaseId: "database-1", dataSourceId: null },
  });
  assert.deepEqual(mocks.requireDatabase.mock.calls[0], ["database-1", "user-1"]);
});

test("source commands require both host and source edit access", async () => {
  const body = {
    command: { propertyId: "property-1", rowId: "row-1", type: "cell.set", value: "Done" },
    commandId: "command-2",
    protocolVersion: 2,
  };
  const response = await appWithUser().request(
    "/databases/database-1/data-sources/source-1/commands",
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(mocks.requireSource.mock.calls[0], ["source-1", "user-1"]);
  assert.equal(mocks.execute.mock.calls[0]?.[0].scope.dataSourceId, "source-1");
});

test("link commands require view access to the source", async () => {
  const response = await appWithUser().request("/databases/database-1/commands", {
    body: JSON.stringify({
      command: {
        afterId: null,
        beforeId: null,
        dataSourceId: "source-2",
        type: "dataSource.link",
      },
      commandId: "command-link",
      protocolVersion: 2,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.requireSourceView.mock.calls[0], ["source-2", "user-1", "view"]);
});

test("route scope rejects the other command union and unauthenticated writes", async () => {
  const sourceCommand = {
    command: { propertyId: "property-1", rowId: "row-1", type: "cell.set", value: "Done" },
    commandId: "command-2",
    protocolVersion: 2,
  };
  const invalid = await appWithUser().request("/databases/database-1/commands", {
    body: JSON.stringify(sourceCommand),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(invalid.status, 400);
  assert.equal(mocks.execute.mock.calls.length, 0);

  const unauthorized = await appWithUser(false).request("/databases/database-1/commands", {
    body: JSON.stringify(sourceCommand),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);
});

test("command ID reuse returns the typed conflict body", async () => {
  mocks.execute.mockRejectedValue(new CommandIdReusedError("command-1"));
  const response = await appWithUser().request("/databases/database-1/commands", {
    body: JSON.stringify({
      command: { patch: { name: "Renamed" }, type: "database.update" },
      commandId: "command-1",
      protocolVersion: 2,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    code: "COMMAND_ID_REUSED",
    commandId: "command-1",
    error: "The command ID has already been used for another request",
  });
});

test("row move conflicts expose the rejected row ID", async () => {
  mocks.execute.mockRejectedValue(new RowMoveConflictError("row-1"));
  const response = await appWithUser().request(
    "/databases/database-1/data-sources/source-1/commands",
    {
      body: JSON.stringify({
        command: {
          placement: { afterRowId: "row-b", beforeRowId: "row-a" },
          rowId: "row-1",
          type: "row.change",
        },
        commandId: "command-move",
        protocolVersion: 2,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    code: "ROW_MOVE_CONFLICT",
    error: "The row move anchors conflict with the current ordering",
    rowId: "row-1",
  });
});

const transferRequest = {
  commandId: "transfer",
  protocolVersion: 2,
  command: {
    type: "row.place",
    pageId: "page-1",
    parentRowId: null,
    afterRowId: null,
    beforeRowId: null,
    source: {
      databaseId: "origin-host",
      dataSourceId: "origin-source",
      rowId: "origin-row",
      propertyMode: "match",
    },
  },
};
function postTransfer() {
  return appWithUser().request("/databases/database-1/data-sources/source-1/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(transferRequest),
  });
}
test("transfers authorize both hosts and sources plus the existing page", async () => {
  const response = await postTransfer();
  assert.equal(response.status, 200);
  assert.deepEqual(mocks.requireDatabase.mock.calls, [
    ["database-1", "user-1"],
    ["origin-host", "user-1"],
  ]);
  assert.deepEqual(mocks.requireSource.mock.calls, [
    ["source-1", "user-1"],
    ["origin-source", "user-1"],
  ]);
  assert.deepEqual(mocks.canEditPage.mock.calls, [["page-1", "workspace", "user-1", "edit"]]);
  assert.equal(mocks.execute.mock.calls.length, 1);
});
test("transfers reject cross-workspace sources before entering the transaction", async () => {
  mocks.requireSource
    .mockResolvedValueOnce({ workspaceId: "workspace" })
    .mockResolvedValueOnce({ workspaceId: "other" });
  assert.equal((await postTransfer()).status, 403);
  assert.equal(mocks.execute.mock.calls.length, 0);
});
test("placing an existing page requires page edit permission", async () => {
  mocks.canEditPage.mockResolvedValue(false);
  assert.equal((await postTransfer()).status, 403);
  assert.equal(mocks.execute.mock.calls.length, 0);
});
