import assert from "node:assert/strict";
import test from "node:test";

import { hasPageBodyContent, isPageBodyEmpty } from "./content-state";

test("page content state ignores empty structural nodes", () => {
  assert.equal(isPageBodyEmpty(null), true);
  assert.equal(isPageBodyEmpty({ type: "doc", content: [] }), true);
  assert.equal(
    isPageBodyEmpty({
      type: "doc",
      content: [{ type: "heading" }, { type: "paragraph" }],
    }),
    true,
  );
  assert.equal(
    hasPageBodyContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "  " }] }],
    }),
    false,
  );
});

test("page content state treats text and atomic blocks as content", () => {
  assert.equal(
    hasPageBodyContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    }),
    true,
  );
  assert.equal(
    hasPageBodyContent({
      type: "doc",
      content: [{ type: "databaseBlock", attrs: { databaseId: "db-1" } }],
    }),
    true,
  );
  assert.equal(hasPageBodyContent(JSON.stringify({ type: "doc", content: [] })), false);
});
