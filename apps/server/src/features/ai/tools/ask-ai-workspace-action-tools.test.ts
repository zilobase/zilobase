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

test("workspace patch updates accept legacy afterMarkdown replacements", () => {
  const result = resolveWorkspacePageUpdateMarkdown(
    "# Trip\n\n## Accommodation\n\nTBD\n\n## Budget\n\n$2,000",
    {
      afterMarkdown: "## Accommodation\n\n- Hotel Le Meurice",
      editMode: "patch",
      searchText: "## Accommodation\n\nTBD",
    },
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.match(result.afterMarkdown, /Hotel Le Meurice/);
  assert.match(result.afterMarkdown, /## Budget/);
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
      afterMarkdown: "- [ ] Book flights\n- [ ] Reserve hotel\n- [ ] Pack essentials",
      editMode: "patch",
      searchText: "- Book flights",
    },
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.afterMarkdown.match(/Reserve hotel/g)?.length, 1);
  assert.match(result.afterMarkdown, /- \[ \] Book flights/);
  assert.match(result.afterMarkdown, /## Budget/);
});
