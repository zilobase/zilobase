import assert from "node:assert/strict";
import { test } from "vitest";

import { markdownToPageContent } from "./markdown-to-page-content";

test("agent page markdown becomes structured editor content", () => {
  assert.deepEqual(markdownToPageContent([
    "# Launch plan",
    "",
    "- [x] Draft",
    "- [ ] Review",
    "",
    "```ts",
    "const ready = true",
    "```",
  ].join("\n")), {
    type: "doc",
    content: [
      {
        attrs: { level: 1 },
        content: [{ text: "Launch plan", type: "text" }],
        type: "heading",
      },
      {
        content: [
          {
            attrs: { checked: true },
            content: [{
              content: [{ text: "Draft", type: "text" }],
              type: "paragraph",
            }],
            type: "taskItem",
          },
          {
            attrs: { checked: false },
            content: [{
              content: [{ text: "Review", type: "text" }],
              type: "paragraph",
            }],
            type: "taskItem",
          },
        ],
        type: "taskList",
      },
      {
        attrs: { language: "ts" },
        content: [{ text: "const ready = true", type: "text" }],
        type: "codeBlock",
      },
    ],
  });
});
