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

test("plain bullets under a to-do heading become unchecked task items", () => {
  const result = markdownToPageContent([
    "## To-Do List",
    "",
    "- Book flights",
    "- Reserve hotel",
    "",
    "## Notes",
    "",
    "- Keep this as a normal bullet",
  ].join("\n"));

  assert.equal(result.content?.[1]?.type, "taskList");
  assert.deepEqual(result.content?.[1]?.content?.map((item) => item.attrs), [
    { checked: false },
    { checked: false },
  ]);
  assert.equal(result.content?.[3]?.type, "bulletList");
});

test("agent page markdown preserves basic inline formatting", () => {
  const result = markdownToPageContent(
    "**Destination:** Paris with *flexible dates* and `EUR` pricing",
  );

  assert.deepEqual(result.content?.[0]?.content, [
    { marks: [{ type: "bold" }], text: "Destination:", type: "text" },
    { text: " Paris with ", type: "text" },
    { marks: [{ type: "italic" }], text: "flexible dates", type: "text" },
    { text: " and ", type: "text" },
    { marks: [{ type: "code" }], text: "EUR", type: "text" },
    { text: " pricing", type: "text" },
  ]);
});
