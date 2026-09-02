import assert from "node:assert/strict";
import { test } from "vitest";

import {
  DATABASE_AUTOMATION_EVENT_WINDOW_MS,
  databaseAutomationFactLockKeys,
  databaseAutomationValuesEqual,
  mergeDatabaseAutomationEventWindowState,
  type DatabaseAutomationEventWindowState,
  type DatabaseAutomationMutationFact,
} from "./event-capture";

test("event windows are fixed at three seconds and lock rows deterministically", () => {
  assert.equal(DATABASE_AUTOMATION_EVENT_WINDOW_MS, 3_000);
  assert.deepEqual(
    databaseAutomationFactLockKeys([
      { dataSourceId: "source-b", rowId: "row-1" },
      { dataSourceId: "source-a", rowId: "row-2" },
      { dataSourceId: "source-b", rowId: "row-1" },
    ]),
    ["source-a\u0000row-2", "source-b\u0000row-1"],
  );
});

const empty = (): DatabaseAutomationEventWindowState => ({
  actorIds: [],
  afterValues: {},
  beforeValues: {},
  changedPropertyIds: [],
  origins: [],
  rowAdded: false,
  triggerActorId: null,
});

const fact = (
  overrides: Partial<DatabaseAutomationMutationFact> = {},
): DatabaseAutomationMutationFact => ({
  actorId: "user-1",
  changedValues: [{ after: "after", before: "before", propertyId: "name" }],
  dataSourceId: "source-1",
  origin: "user",
  pageId: "page-1",
  rowId: "row-1",
  ...overrides,
});

test("semantic equality preserves false and zero while normalizing sets", () => {
  assert.equal(databaseAutomationValuesEqual(false, 0), false);
  assert.equal(databaseAutomationValuesEqual(null, 0), false);
  assert.equal(databaseAutomationValuesEqual(["one", "two"], ["two", "one"]), true);
  assert.equal(databaseAutomationValuesEqual({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
});

test("same-value writes and suppressed origins do not contribute", () => {
  assert.equal(
    mergeDatabaseAutomationEventWindowState(
      empty(),
      fact({ changedValues: [{ after: 0, before: 0, propertyId: "number" }] }),
    ).changed,
    false,
  );
  assert.equal(
    mergeDatabaseAutomationEventWindowState(empty(), fact({ origin: "automation" })).changed,
    false,
  );
  assert.equal(
    mergeDatabaseAutomationEventWindowState(empty(), fact({ origin: "system" })).changed,
    false,
  );
});

test("a window keeps first-before/final-after and cancels a revert", () => {
  const first = mergeDatabaseAutomationEventWindowState(
    empty(),
    fact({ changedValues: [{ after: "B", before: "A", propertyId: "status" }] }),
  ).state;
  const reverted = mergeDatabaseAutomationEventWindowState(
    first,
    fact({
      actorId: "user-2",
      changedValues: [{ after: "A", before: "B", propertyId: "status" }],
    }),
  ).state;

  assert.deepEqual(reverted.changedPropertyIds, []);
  assert.deepEqual(reverted.beforeValues, {});
  assert.deepEqual(reverted.afterValues, {});
  assert.deepEqual(reverted.actorIds, ["user-1", "user-2"]);
  assert.equal(reverted.triggerActorId, "user-2");
});

test("page-added windows retain initial values and contributing origins", () => {
  const state = mergeDatabaseAutomationEventWindowState(
    empty(),
    fact({
      changedValues: [
        { after: "New page", before: null, propertyId: "name" },
        { after: false, before: null, propertyId: "done" },
      ],
      origin: "import",
      rowAdded: true,
    }),
  ).state;

  assert.equal(state.rowAdded, true);
  assert.deepEqual(state.changedPropertyIds, ["done", "name"]);
  assert.deepEqual(state.origins, ["import"]);
  assert.equal(state.afterValues.done, false);
});
