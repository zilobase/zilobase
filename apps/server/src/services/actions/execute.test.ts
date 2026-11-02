import { expect, test } from "vitest";
import {
  databaseCommandBuilders,
  type DatabaseBootstrapResponse,
  type DatabaseCommandRequest,
} from "@zilobase/features/runtime";
import type { ServerOperationContext } from "../operations/context";
import { executeWorkspaceAction, personalScopes, type ActionPrincipal } from "./execute";
import { deterministicActionId, memoryReceiptStore } from "./receipts";

const now = "2026-09-08T00:00:00.000Z";
const context = {} as ServerOperationContext;
const principal: ActionPrincipal = {
  kind: "user",
  userId: "user-1",
  workspaceId: "org",
  scopes: personalScopes,
};
const property = (id: string, type: string, name: string, config: unknown = {}) => ({
  createdAt: now,
  dataSourceId: "source",
  id: `column-${id}`,
  position: 0,
  property: { config, createdAt: now, id, name, type, updatedAt: now, workspaceId: "org" },
  propertyId: id,
  updatedAt: now,
  visible: true,
  width: null,
});
const bootstrap = {
  database: {
    accessLevel: "edit",
    config: {},
    createdAt: now,
    deletedAt: null,
    id: "host",
    name: "Tasks",
    pageId: "page",
    updatedAt: now,
    version: 1,
    workspaceId: "org",
  },
  dataSources: [
    {
      config: {},
      configVersion: 1,
      createdAt: now,
      id: "source",
      linkedAt: null,
      name: "Tasks",
      parentDatabaseId: "host",
      position: 0,
      updatedAt: now,
      version: 1,
      workspaceId: "org",
    },
  ],
  properties: [property("due", "date", "Due")],
  views: [
    {
      config: {},
      createdAt: now,
      databaseId: "host",
      dataSourceId: "source",
      id: "view-1",
      name: "Table",
      position: 0,
      type: "table",
      updatedAt: now,
    },
  ],
} as unknown as DatabaseBootstrapResponse;

function harness(access = "edit") {
  const sent: Array<{
    databaseId?: string;
    dataSourceId?: string | null;
    request: DatabaseCommandRequest;
  }> = [];
  const receipts = memoryReceiptStore();
  const run = (name: string, input: unknown, callId = "call-1", scopes = principal.scopes) =>
    executeWorkspaceAction({
      context,
      principal: { ...principal, scopes },
      invocationId: "run-1",
      callId,
      name,
      input,
      receipts,
      readBootstrap: async () =>
        ({ ...bootstrap, database: { ...bootstrap.database, accessLevel: access } }) as never,
      executeCommand: async (_, command) => {
        sent.push(command as (typeof sent)[number]);
        const request = command.request as DatabaseCommandRequest;
        const type = request.command.type;
        return {
          commandId: request.commandId,
          event: null,
          result:
            type === "property.create"
              ? property("status", "status", "Status")
              : { id: `result-${sent.length}`, config: {} },
          sourceVersions: {},
        } as never;
      },
    });
  return { run, sent, receipts };
}

test("actions issue the same command bodies as the UI with deterministic IDs", async () => {
  const { run, sent } = harness();
  const outcome = await run("databases.add_view", { databaseId: "host", type: "kanban" });
  expect(outcome.status).toBe("completed");
  expect(sent.map(({ request }) => request.command.type)).toEqual([
    "property.create",
    "view.create",
  ]);
  expect(sent[0]!.request.command).toEqual(
    databaseCommandBuilders.buildPropertyCreate(
      { hostDatabaseId: "host", dataSourceId: "source" },
      bootstrap.properties,
      {
        config: (sent[0]!.request.command as { config: unknown }).config,
        name: "Status",
        type: "status",
      },
    ).command,
  );
  expect(sent[0]).toMatchObject({ databaseId: "host", dataSourceId: "source" });
  expect(sent[0]!.request.commandId).toBe(await deterministicActionId("run-1", "call-1", "0"));
  expect(
    outcome.changes.map(({ commandType, inverse }) => [commandType, inverse?.command.type]),
  ).toEqual([
    ["property.create", "property.archive"],
    ["view.create", "view.delete"],
  ]);
});

test("redelivered calls replay stored receipts instead of writing again", async () => {
  const { run, sent, receipts } = harness();
  await run("databases.add_rows", { databaseId: "host", rows: [{ title: "A" }, { title: "B" }] });
  expect(sent).toHaveLength(2);
  const outcome = await run("databases.add_rows", {
    databaseId: "host",
    rows: [{ title: "A" }, { title: "B" }],
  });
  expect(outcome.status).toBe("completed");
  expect(sent).toHaveLength(2);
  // A crash after the first request was stored resends it byte-identically.
  for (const [key, receipt] of receipts.entries)
    if (key.endsWith(":1")) receipts.entries.set(key, { ...receipt, status: "pending" });
  await run("databases.add_rows", { databaseId: "host", rows: [{ title: "A" }, { title: "B" }] });
  expect(sent).toHaveLength(3);
  expect(sent[2]!.request).toEqual(sent[1]!.request);
});

test("scopes, read-only access and invalid input are rejected before writing", async () => {
  const { run, sent } = harness("view");
  expect(
    await run("databases.add_property", { databaseId: "host", name: "X", type: "text" }),
  ).toMatchObject({
    status: "rejected",
    reason: "not_editable",
  });
  expect(
    await run("databases.add_property", { databaseId: "host", name: "X", type: "text" }, "c2", [
      "databases.read",
    ]),
  ).toMatchObject({ status: "rejected", reason: "insufficient_scope" });
  expect(await run("databases.add_property", { databaseId: "host" })).toMatchObject({
    status: "rejected",
    reason: "invalid_input",
  });
  expect(await run("databases.describe", { databaseId: "host" })).toMatchObject({
    reason: "unknown_action",
  });
  expect(sent).toHaveLength(0);
});

test("agent principals are reserved", async () => {
  const outcome = await executeWorkspaceAction({
    context,
    principal: {
      kind: "agent",
      agentId: "a",
      ownerUserId: "u",
      workspaceId: "org",
      scopes: personalScopes,
    },
    invocationId: "run",
    callId: "call",
    name: "databases.add_rows",
    input: {},
    receipts: memoryReceiptStore(),
  });
  expect(outcome).toMatchObject({ status: "rejected", reason: "agent_principal_unsupported" });
});
