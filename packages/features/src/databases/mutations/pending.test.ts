import assert from "node:assert/strict";
import test from "node:test";

import {
  beginPending,
  clearPendingStateForTests,
  endPending,
  getPendingState,
} from "./pending";

test("per-target pendingCount tracks independently", () => {
  clearPendingStateForTests();
  try {
    const target = { hostDatabaseId: "database-1" };
    const other = { hostDatabaseId: "database-2" };
    beginPending([target]);
    assert.equal(getPendingState(target).pendingCount, 1);
    assert.equal(getPendingState(target).isPending, true);
    assert.equal(getPendingState(other).pendingCount, 0);
    endPending([target]);
    assert.equal(getPendingState(target).isPending, false);
  } finally {
    clearPendingStateForTests();
  }
});

test("error sticks until same target succeeds", () => {
  clearPendingStateForTests();
  try {
    const target = { hostDatabaseId: "database-1", rowId: "row-1" };
    const unrelated = { hostDatabaseId: "database-1", rowId: "row-2" };
    beginPending([target]);
    endPending([target], new Error("failed"));
    assert.match(getPendingState(target).error?.message ?? "", /failed/);
    // Unrelated success does not clear
    beginPending([unrelated]);
    endPending([unrelated]);
    assert.match(getPendingState(target).error?.message ?? "", /failed/);
    // Same target next start clears error
    beginPending([target]);
    assert.equal(getPendingState(target).error, null);
    endPending([target]);
    assert.equal(getPendingState(target).error, null);
  } finally {
    clearPendingStateForTests();
  }
});
