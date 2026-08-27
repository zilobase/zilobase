import assert from "node:assert/strict";
import { test } from "vitest";

import {
  hashPageContentMarkdown,
  isPageContentVersionCurrent,
} from "./page-content-version";

test("accepts timestamp-only page version changes when content is unchanged", async () => {
  const markdown = "# Trip\n\n## Accommodation\nTBD";

  assert.equal(await isPageContentVersionCurrent({
    currentMarkdown: markdown,
    currentUpdatedAt: "2026-08-27T20:27:56.113Z",
    expectedContentHash: await hashPageContentMarkdown(markdown),
    expectedUpdatedAt: "2026-08-27T20:27:50.265Z",
  }), true);
});

test("rejects stale page versions when the content changed", async () => {
  assert.equal(await isPageContentVersionCurrent({
    currentMarkdown: "# Trip\n\nUser changed this",
    currentUpdatedAt: "2026-08-27T20:27:56.113Z",
    expectedContentHash: await hashPageContentMarkdown("# Trip\n\nOriginal"),
    expectedUpdatedAt: "2026-08-27T20:27:50.265Z",
  }), false);
});
