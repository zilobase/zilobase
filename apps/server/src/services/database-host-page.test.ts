import assert from "node:assert/strict";
import test from "node:test";

import { isDatabaseHostPageId } from "./database-mutations";

test("page-less databases do not treat a missing row page as self-nesting", () => {
  assert.equal(isDatabaseHostPageId(null, null), false);
  assert.equal(isDatabaseHostPageId(undefined, null), false);
});

test("embedded databases still reject their real host page", () => {
  assert.equal(isDatabaseHostPageId("host-page", "host-page"), true);
  assert.equal(isDatabaseHostPageId("another-page", "host-page"), false);
});
