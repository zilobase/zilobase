import assert from "node:assert/strict";
import { test } from "vitest";

import { hasAccess, maxAccess, normalizeAccessLevel } from "./access-level";

test("access levels normalize and compare by privilege", () => {
  assert.equal(normalizeAccessLevel("comment"), "comment");
  assert.equal(normalizeAccessLevel("owner"), null);
  assert.equal(hasAccess("edit", "comment"), true);
  assert.equal(hasAccess("view", "edit"), false);
  assert.equal(maxAccess("comment", "full"), "full");
});
