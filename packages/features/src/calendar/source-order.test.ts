import { test } from "node:test";
import assert from "node:assert/strict";
import { orderCalendarSources, moveCalendarSource } from "./source-order";

test("new and removed sources preserve saved ordering", () => {
  assert.deepEqual(
    orderCalendarSources(["a", "new", "b"], ["removed", "b", "a"], (id) => id),
    ["b", "a", "new"],
  );
  assert.deepEqual(
    orderCalendarSources(["b", "a"], [], (id) => id),
    orderCalendarSources(["a", "b"], [], (id) => id),
  );
});
test("moving within an account preserves other accounts and handles edges", () => {
  const saved = ["other/b", "other/a", "self/b", "self/a"];
  assert.deepEqual(moveCalendarSource(saved, ["self/a", "self/b"], "self/a", -1), [
    "other/b",
    "other/a",
    "self/a",
    "self/b",
  ]);
  assert.deepEqual(moveCalendarSource(saved, ["self/a", "self/b"], "self/b", -1), saved);
  assert.deepEqual(moveCalendarSource(saved, ["self/a", "self/b"], "missing", 1), saved);
});
