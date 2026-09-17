import assert from "node:assert/strict";
import { test } from "vitest";

import {
  getDuplicatePropertyName,
  getPropertyNameKey,
  mergeSelectOptionsForValue,
  normalizeValueForPropertyType,
  shouldInsertUnmatchedSourceProperty,
} from "./import";

test("property import naming normalizes keys and copy suffixes", () => {
  assert.equal(getPropertyNameKey(" Status "), "status");
  assert.equal(getDuplicatePropertyName(" ", new Set()), "Property copy");
  assert.equal(
    getDuplicatePropertyName(
      "Status",
      new Set(["Status copy", "Status copy 2"]),
    ),
    "Status copy 3",
  );
});

test("match mode never inserts unmatched source properties", () => {
  assert.equal(shouldInsertUnmatchedSourceProperty("match"), false);
  assert.equal(shouldInsertUnmatchedSourceProperty("duplicate"), true);
});

test("normalizeValueForPropertyType maps select-compatible shapes", () => {
  assert.deepEqual(normalizeValueForPropertyType("multi_select", "One"), [
    "One",
  ]);
  assert.equal(normalizeValueForPropertyType("select", ["One", "Two"]), "One");
  assert.equal(normalizeValueForPropertyType("status", []), null);
  assert.equal(normalizeValueForPropertyType("text", "One"), "One");
});

test("normalizeValueForPropertyType skips incompatible select shapes", () => {
  assert.equal(normalizeValueForPropertyType("select", 42), null);
  assert.equal(normalizeValueForPropertyType("status", true), null);
  assert.equal(normalizeValueForPropertyType("multi_select", 42), null);
  assert.equal(normalizeValueForPropertyType("multi_select", ["One", 2]), null);
  assert.equal(normalizeValueForPropertyType("select", [2, "Two"]), "Two");
});

test("mergeSelectOptionsForValue ignores non-select and empty values", () => {
  const config = { precision: 2 };

  assert.deepEqual(mergeSelectOptionsForValue("number", config, 2), {
    changed: false,
    config,
  });
  assert.deepEqual(mergeSelectOptionsForValue("select", config, null), {
    changed: false,
    config,
  });
});

test("mergeSelectOptionsForValue preserves existing option names", () => {
  const config = { options: [{ id: "done", name: "Done" }] };

  assert.deepEqual(mergeSelectOptionsForValue("select", config, " done "), {
    changed: false,
    config,
  });
});

test("mergeSelectOptionsForValue adds unique IDs and deduplicates names", () => {
  const result = mergeSelectOptionsForValue(
    "multi_select",
    { options: [{ id: "blocked", name: "Existing" }] },
    ["Blocked", "Blocked", "Ready"],
  );

  assert.equal(result.changed, true);
  assert.deepEqual((result.config as { options: unknown[] }).options, [
    { color: "gray", id: "blocked", name: "Existing" },
    { color: "brown", id: "blocked-2", name: "Blocked" },
    { color: "orange", id: "ready", name: "Ready" },
  ]);
});

test("mergeSelectOptionsForValue seeds status defaults", () => {
  const result = mergeSelectOptionsForValue("status", null, "Waiting");
  const options = (result.config as { options: Array<{ name: string }> })
    .options;

  assert.equal(result.changed, true);
  assert.equal(
    options.some(({ name }) => name === "Not started"),
    true,
  );
  assert.equal(
    options.some(({ name }) => name === "Waiting"),
    true,
  );
});
