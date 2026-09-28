import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyConfigurationChanges,
  configurationChangesSchema,
  diffConfiguration,
} from "./configuration";

test("configuration intentions preserve independently changed fields and explicit removals", () => {
  const original = { filters: ["old"], timeline: { zoom: 1, labels: true }, sorts: ["name"] };
  const first = diffConfiguration(original, { ...original, filters: ["new"] });
  const second = diffConfiguration(original, {
    ...original,
    timeline: { zoom: 2, labels: true },
    sorts: undefined,
  });
  const projected = applyConfigurationChanges(applyConfigurationChanges(original, first), second);
  assert.deepEqual(projected, { filters: ["new"], timeline: { zoom: 2, labels: true } });
  assert.deepEqual(original.sorts, ["name"]);
  assert.deepEqual(applyConfigurationChanges(original, second).filters, ["old"]);
});

test("configuration boundary rejects prototype keys, unbounded paths and non-JSON values", () => {
  for (const path of [["__proto__", "polluted"], ["constructor"], [], Array(13).fill("key")])
    assert.equal(
      configurationChangesSchema.safeParse([{ operation: "set", path, value: true }]).success,
      false,
    );
  assert.equal(
    configurationChangesSchema.safeParse([{ operation: "set", path: ["x"], value: undefined }])
      .success,
    false,
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("drafts omit optional fields without sending undefined JSON or spurious removals", () => {
  const changes = diffConfiguration(
    { optional: undefined },
    {
      optional: undefined,
      summaries: { page: { name: "Task", metadata: undefined } },
    },
  );
  assert.deepEqual(changes, [
    { operation: "set", path: ["summaries"], value: { page: { name: "Task" } } },
  ]);
});
