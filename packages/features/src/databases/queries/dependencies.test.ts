import assert from "node:assert/strict";
import { test } from "node:test";
import { dependentFields } from "./dependencies";
import type { DatabasePropertyEntity } from "../core/entities";

function property(id: string, name: string, type = "number", formula = ""): DatabasePropertyEntity {
  const stamp = "2026-10-05T00:00:00.000Z";
  return {
    id: `binding-${id}`,
    propertyId: id,
    dataSourceId: "source",
    position: 0,
    visible: true,
    width: null,
    createdAt: stamp,
    updatedAt: stamp,
    property: {
      id,
      workspaceId: "workspace",
      name,
      type,
      config: { formula },
      createdAt: stamp,
      updatedAt: stamp,
    },
  };
}

test("formula dependency closure follows title aliases and transitive references", () => {
  const properties = [
    property("amount", "Amount"),
    property("double", "Double", "formula", 'prop("Amount") * 2'),
    property("total", "Total", "formula", 'prop("Double") + 1'),
    property("title", "Label", "formula", 'prop("Title")'),
    property("unrelated", "Constant", "formula", "1 + 2"),
  ];
  const fields = dependentFields(properties, new Set(["binding-amount"]));
  assert.ok(fields.has("total"));
  assert.ok(fields.has("binding-double"));
  assert.equal(fields.has("title"), false);
  assert.equal(fields.has("unrelated"), false);
  assert.ok(dependentFields(properties, new Set(["name"])).has("title"));
});

test("dynamic references and definition renames recover dependent computed results conservatively", () => {
  const properties = [
    property("amount", "Amount"),
    property("dynamic", "Dynamic", "formula", 'prop(if(true, "Amount", "Other"))'),
    property("constant", "Constant", "formula", "1"),
  ];
  assert.ok(dependentFields(properties, new Set(["amount"])).has("dynamic"));
  assert.equal(dependentFields(properties, new Set(["amount"])).has("constant"), false);
  assert.ok(dependentFields(properties, new Set(["amount"]), true).has("constant"));
});
