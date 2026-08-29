import assert from "node:assert/strict";
import { test } from "vitest";

import { truncateText } from "./ask-ai-utils";

test("truncateText preserves missing and short values", () => {
  assert.equal(truncateText(undefined, 5), undefined);
  assert.equal(truncateText("short", 5), "short");
  assert.equal(truncateText("", 5), "");
});

test("truncateText appends an ellipsis after the requested prefix", () => {
  assert.equal(truncateText("long value", 4), "long...");
  assert.equal(truncateText("value", 0), "...");
});
