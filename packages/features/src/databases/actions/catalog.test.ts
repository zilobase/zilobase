import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { isPlanRejection, runPlan, type PlanOps } from "../../actions/plan";
import { exposedActions } from "../../actions/types";
import { workspaceActions } from "../../actions/registry";
import type { DatabasePropertyEntity, DatabaseViewEntity } from "../core/entities";
import type { DatabaseViewData } from "../views/source-state";
import { databaseWriteActions, type DatabaseActionState } from "./catalog";
import { databaseCommandActionPolicies } from "./policies";

const now = "2026-09-08T00:00:00.000Z";
const property = (id: string, type: string, name: string, config: unknown = {}) =>
  ({
    createdAt: now,
    dataSourceId: "source",
    id: `column-${id}`,
    position: 0,
    property: { config, createdAt: now, id, name, type, updatedAt: now, workspaceId: "org" },
    propertyId: id,
    updatedAt: now,
    visible: true,
    width: null,
  }) as DatabasePropertyEntity;
const status = property("status", "status", "Status", {
  options: [
    { id: "todo", name: "Todo" },
    { id: "done", name: "Done" },
  ],
});
const due = property("due", "date", "Due");
const table = {
  config: {},
  databaseId: "host",
  dataSourceId: "source",
  id: "view-1",
  name: "Table",
  type: "table",
} as DatabaseViewEntity;

function state(overrides: Partial<DatabaseActionState> = {}): DatabaseActionState {
  const properties = [status, due];
  return {
    workspaceId: "org",
    dataSourceId: "source",
    hostDatabaseId: "host",
    editable: true,
    activeView: table,
    activeDatabaseFilters: [],
    activeDatabaseSorts: [],
    properties,
    items: [],
    isKanbanView: false,
    kanbanGroupProperty: null,
    viewData: {
      activeDataSource: { id: "source", name: "Tasks", config: {} },
      bootstrap: { database: { id: "host", config: {} }, properties, views: [table] },
      dataSourceId: "source",
    } as unknown as DatabaseViewData,
    ...overrides,
  };
}

function action(name: string) {
  const found = databaseWriteActions.find((candidate) => candidate.name === name);
  if (!found) throw new Error(name);
  return found as unknown as {
    input: z.ZodType;
    plan: (
      state: unknown,
      input: unknown,
    ) => ReturnType<(typeof databaseWriteActions)[number]["plan"]>;
  };
}

async function record(
  name: string,
  input: unknown,
  current = state(),
): Promise<Array<{ op: string; input: unknown }>> {
  const parsed = action(name).input.parse(input);
  const plan = action(name).plan(current, parsed);
  if (isPlanRejection(plan)) throw new Error(plan.message ?? plan.rejected);
  const calls: Array<{ op: string; input: unknown }> = [];
  const ops = new Proxy({} as PlanOps as never, {
    get: (_, op: string) => async (stepInput: unknown) => {
      calls.push({ op, input: stepInput });
      return op === "addProperty"
        ? property("created", "status", "Status")
        : op === "createDatabase"
          ? { database: { id: "db-1" }, activeDataSource: { id: "src-1", config: {} } }
          : { id: "x" };
    },
  });
  const run = await runPlan(plan, ops, { sequential: true });
  assert.equal(run.status, "completed");
  return calls;
}

test("every exposed database command is reachable from an action", () => {
  const covered = new Set(databaseWriteActions.flatMap((candidate) => candidate.covers));
  for (const [command, policy] of Object.entries(databaseCommandActionPolicies))
    if (policy.exposure === "action") assert.ok(covered.has(command), `${command} has no action`);
  for (const command of covered)
    assert.ok(command in databaseCommandActionPolicies, `${command} is not a database command`);
});

test("action inputs generate JSON schemas and destructive actions stay hidden", () => {
  for (const candidate of workspaceActions) z.toJSONSchema(candidate.input as z.ZodType);
  const exposed = exposedActions(workspaceActions, ["A", "B"]).map(({ name }) => name);
  assert.ok(exposed.includes("databases.add_view"));
  assert.ok(!exposed.includes("databases.archive_rows"));
  assert.equal(new Set(workspaceActions.map(({ name }) => name)).size, workspaceActions.length);
});

test("board views reuse the UI planner, creating the Status group when missing", async () => {
  assert.deepEqual(
    (await record("databases.add_view", { databaseId: "host", type: "kanban", name: "Board" })).map(
      ({ op, input }) => [op, (input as { name?: string; type?: string }).name],
    ),
    [["addDatabaseView", "Board"]],
  );
  const calls = await record(
    "databases.add_view",
    { databaseId: "host", type: "kanban" },
    state({ properties: [due], viewData: undefined }),
  );
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["addProperty", "addDatabaseView"],
  );
});

test("row values resolve names, options and dates like the cell editors", async () => {
  const calls = await record("databases.add_rows", {
    databaseId: "host",
    rows: [
      {
        title: "Ship",
        values: { status: "done", Due: { start: "2026-09-01", end: "2026-09-03" } },
      },
    ],
  });
  assert.deepEqual(calls, [
    {
      op: "addRow",
      input: {
        databaseId: "source",
        hostDatabaseId: "host",
        title: "Ship",
        initialValues: [
          { propertyId: "status", value: "Done" },
          { propertyId: "due", value: { start: "2026-09-01", end: "2026-09-03" } },
        ],
      },
    },
  ]);
  const rejected = action("databases.add_rows").plan(
    state(),
    action("databases.add_rows").input.parse({
      databaseId: "host",
      rows: [{ values: { Status: "Blocked" } }],
    }),
  );
  assert.ok(isPlanRejection(rejected));
  assert.match(rejected.message ?? "", /not an option of Status.*Todo, Done/);
});

test("view configuration composes filters, sorts and grouping through planners", async () => {
  const calls = await record("databases.configure_view", {
    databaseId: "host",
    viewId: "view-1",
    filters: [{ property: "Status", operator: "is", values: ["Done"] }],
    sorts: [{ property: "Due", direction: "descending" }],
    groupBy: "Status",
  });
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["updateDatabaseView", "updateDatabaseView", "updateDatabaseView"],
  );
  assert.ok(
    isPlanRejection(
      action("databases.configure_view").plan(
        state({ editable: false }),
        action("databases.configure_view").input.parse({ databaseId: "host", viewId: "view-1" }),
      ),
    ),
  );
});

test("databases are created with typed properties and rows in one template step", async () => {
  const calls = await record(
    "databases.create",
    {
      name: "Bugs",
      parentPageId: "page-1",
      properties: [{ name: "Severity", type: "select", config: { options: [{ name: "High" }] } }],
      rows: [{ title: "Crash", values: { Severity: "high" } }],
    },
    state(),
  );
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["createDatabase", "applyDataSourceTemplate"],
  );
  assert.deepEqual(calls[0]!.input, {
    workspaceId: "org",
    name: "Bugs",
    pageId: "page-1",
    standalone: false,
  });
  const apply = calls[1]!.input as { databaseId: string; rows: unknown };
  assert.equal(apply.databaseId, "src-1");
  assert.deepEqual(apply.rows, [
    { title: "Crash", values: [{ propertyName: "Severity", value: "High" }] },
  ]);
});

test("invalid formulas are rejected before any command is sent", () => {
  const plan = action("databases.add_property").plan(
    state(),
    action("databases.add_property").input.parse({
      databaseId: "host",
      name: "Score",
      type: "formula",
      config: { formula: 'prop("Due" +' },
    }),
  );
  assert.ok(isPlanRejection(plan));
  assert.match(plan.message ?? "", /Invalid formula/);
});
