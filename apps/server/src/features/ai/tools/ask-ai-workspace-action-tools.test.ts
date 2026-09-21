import assert from "node:assert/strict";
import { test } from "vitest";

import {
  resolveWorkspacePageUpdateMarkdown,
  workspacePageUpdateSchema,
} from "./ask-ai-workspace-action-tools";

test("workspace page updates default a missing display summary", () => {
  const result = workspacePageUpdateSchema.safeParse({
    afterMarkdown: "Updated body",
    editMode: "full",
    expectedContentHash: "a".repeat(64),
    expectedUpdatedAt: "2026-08-27T20:13:43.306Z",
    pageId: "page-1",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.summary, "Updated page content.");
});

test("workspace task patches replace the complete task section from one-item anchors", () => {
  const result = resolveWorkspacePageUpdateMarkdown(
    [
      "# Trip",
      "",
      "## To-Do List",
      "",
      "- Book flights",
      "- Reserve hotel",
      "- Pack essentials",
      "",
      "## Budget",
      "",
      "$2,000",
    ].join("\n"),
    {
      editMode: "patch",
      replaceText: "- [ ] Book flights\n- [ ] Reserve hotel\n- [ ] Pack essentials",
      searchText: "- Book flights",
    },
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.afterMarkdown.match(/Reserve hotel/g)?.length, 1);
  assert.match(result.afterMarkdown, /- \[ \] Book flights/);
  assert.match(result.afterMarkdown, /## Budget/);
});
