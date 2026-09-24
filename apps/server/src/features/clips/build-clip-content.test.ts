import assert from "node:assert/strict";
import { test } from "vitest";

import { installDomParser } from "@zilobase/html-to-page";
import { buildClipContent } from "./build-clip-content";

installDomParser();

test("buildClipContent converts html and prepends a bookmark", () => {
  const document = buildClipContent({
    workspaceId: "workspace-1",
    title: "Article",
    sourceUrl: "https://example.com/post",
    captureMode: "article",
    html: "<h1>Hello</h1><p>Body</p>",
    metadata: { description: "Desc" },
  });

  assert.equal(document.content[0]?.type, "bookmarkBlock");
  assert.equal(document.content[0]?.attrs?.href, "https://example.com/post");
  assert.ok(document.content.some((node) => node.type === "heading"));
});

test("buildClipContent drops javascript urls from submitted json", () => {
  const document = buildClipContent({
    workspaceId: "workspace-1",
    title: "Unsafe",
    sourceUrl: "https://example.com/post",
    captureMode: "article",
    content: {
      type: "doc",
      content: [
        {
          type: "imageBlock",
          attrs: { src: "javascript:alert(1)" },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "ok" }],
        },
      ],
    },
  });

  assert.equal(
    document.content.some((node) => node.type === "imageBlock"),
    false,
  );
  assert.ok(document.content.some((node) => node.type === "paragraph"));
});
