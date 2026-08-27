import assert from "node:assert/strict";
import { test } from "vitest";

import {
  extractContentText,
  normalizeSearchQuery,
} from "./service";

test("workspace search query normalization is stable", () => {
  assert.equal(normalizeSearchQuery("  Launch   Plan  "), "launch plan");
});

test("workspace search extracts nested ProseMirror text", () => {
  assert.equal(
    extractContentText({
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Roadmap" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Ship the agent" }],
        },
      ],
    }),
    "Roadmap Ship the agent",
  );
});
