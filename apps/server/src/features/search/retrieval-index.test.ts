import assert from "node:assert/strict";
import { test } from "vitest";

import { reciprocalRankFuse } from "./retrieval-index";

test("reciprocal rank fusion deduplicates sources and rewards agreement", () => {
  const shared = {
    excerpt: "Shared",
    score: 0,
    sourceId: "page-1",
    sourceType: "page" as const,
  };
  const merged = reciprocalRankFuse([
    [shared, { ...shared, sourceId: "page-2" }],
    [{ ...shared, sourceId: "page-3" }, shared],
  ], 3);
  assert.equal(merged.length, 3);
  assert.equal(merged[0]?.sourceId, "page-1");
});
