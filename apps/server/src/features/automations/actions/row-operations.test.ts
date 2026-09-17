import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as unknown[],
  events: [] as string[],
  commitInput: null as unknown,
  prepared: null as unknown,
}));
vi.mock("../../../infrastructure/database", () => {
  const query = () => {
    const rows = state.rows.shift() ?? [];
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: async () => rows,
    };
    return chain;
  };
  const tx = {
    select: query,
    update: () => ({
      set: (value: unknown) => ({
        where: async () => {
          state.writes.push(value);
          state.events.push("write");
        },
      }),
    }),
    insert: () => ({
      values: (value: unknown) => ({
        onConflictDoUpdate: async () => {
          state.writes.push(value);
          state.events.push("write");
        },
      }),
    }),
  };
  return { db: tx };
});
vi.mock("../../databases/access/data-source-access", () => ({
  requireDataSourceAccess: async () => {
    state.events.push("authorize");
    return { id: "source" };
  },
}));
vi.mock("../../databases/core/commit", async () => {
  const { db } = await import("../../../infrastructure/database");
  return {
    commitDataSourceMutation: async (
      input: unknown,
      run: (tx: unknown) => unknown,
    ) => {
      state.commitInput = input;
      state.prepared = await run(db);
      return { id: "commit" };
    },
  };
});
vi.mock("../../databases/commands/record-entity", () => ({
  getDatabaseRecordEntity: async () => ({
    id: "row",
    page: {
      name: (state.writes.find((value) =>
        value && typeof value === "object" && "name" in value
      ) as { name?: string } | undefined)?.name ?? "Before",
    },
    valuesByPropertyId: { amount: { value: 3 } },
  }),
}));
vi.mock("../triggers/event-capture", () => ({
  lockDatabaseAutomationFactRows: async () => {
    state.events.push("lock");
  },
}));
import { applyDatabaseAutomationRowOperations } from "./internal-mutations";
const input = {
  actorId: "actor",
  dataSourceId: "source",
  rows: [{ pageId: "page", rowId: "row" }],
  runId: "run",
};
beforeEach(() => {
  state.rows = [];
  state.writes = [];
  state.events = [];
  state.commitInput = null;
});
function prepared() {
  return state.prepared as {
    automationFacts: Array<{
      changedValues: unknown[];
      automationRunId: string;
    }>;
    changes: {
      records: Array<{
        page?: { name: string };
        valuesByPropertyId: Record<string, { value: unknown }>;
      }>;
    };
  };
}
test("automation row operations retain first-before and final-after facts inside the commit", async () => {
  state.rows.push(
    [{ id: "amount", type: "number", config: {} }],
    [{ id: "row", pageId: "page" }],
    [{ id: "page", name: "Before" }],
    [{ pageId: "page", propertyId: "amount", value: 1 }],
  );
  const result = await applyDatabaseAutomationRowOperations({
    ...input,
    operations: [
      { propertyId: "name", mode: "clear" },
      { propertyId: "name", mode: "set", value: " After " },
      { propertyId: "amount", mode: "set", value: 2 },
      { propertyId: "amount", mode: "set", value: 3 },
    ],
  });
  assert.equal(result.editedRows, 1);
  assert.deepEqual(state.events.slice(0, 2), ["authorize", "lock"]);
  assert.deepEqual(prepared().automationFacts[0].changedValues, [
    { propertyId: "name", before: "Before", after: "After" },
    { propertyId: "amount", before: 1, after: 3 },
  ]);
  assert.equal(prepared().automationFacts[0].automationRunId, "run");
  assert.equal(prepared().changes.records[0].page?.name, "After");
  assert.equal(
    prepared().changes.records[0].valuesByPropertyId.amount?.value,
    3,
  );
  assert.deepEqual((state.commitInput as { areas: string[] }).areas, ["records"]);
});
test("automation row operations reject unavailable properties and rows before writes", async () => {
  await assert.rejects(
    applyDatabaseAutomationRowOperations({
      ...input,
      rows: Array.from({ length: 1001 }, () => input.rows[0]),
      operations: [],
    }),
    /at most 1,000/,
  );
  assert.deepEqual(state.events, []);
  state.rows.push([]);
  await assert.rejects(
    applyDatabaseAutomationRowOperations({
      ...input,
      operations: [{ propertyId: "missing", mode: "clear" }],
    }),
    /property was not found/,
  );
  state.rows.push([], []);
  await assert.rejects(
    applyDatabaseAutomationRowOperations({
      ...input,
      operations: [{ propertyId: "name", mode: "clear" }],
    }),
    /target row was unavailable/,
  );
  assert.deepEqual(state.writes, []);
});
test("title-only automation writes preserve the Untitled default and record changes", async () => {
  state.rows.push(
    [{ id: "row", pageId: "page" }],
    [{ id: "page", name: "Before" }],
  );
  const result = await applyDatabaseAutomationRowOperations({
    ...input,
    operations: [{ propertyId: "name", mode: "set", value: "  " }],
  });
  assert.equal(prepared().changes.records[0].page?.name, "Untitled");
  assert.deepEqual((state.commitInput as { areas: string[] }).areas, ["records"]);
});
