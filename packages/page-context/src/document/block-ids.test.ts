import { expect, test } from "vitest";
import { assignBlockIds } from "./block-ids";
import type { PageDocumentNode } from "./page-document";

test("missing block IDs are assigned to identified blocks only, keeping existing IDs", () => {
  let next = 0;
  const nodes = assignBlockIds<PageDocumentNode>(
    [
      { type: "paragraph", attrs: { blockId: "keep" }, content: [{ type: "text", text: "a" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    ],
    () => `id-${next++}`,
  );
  expect(nodes[0]!.attrs).toEqual({ blockId: "keep" });
  expect(nodes[1]!.attrs).toEqual({ blockId: "id-0" });
  expect(nodes[1]!.content![0]!.attrs).toBeUndefined();
  expect(nodes[1]!.content![0]!.content![0]!.attrs).toEqual({ blockId: "id-1" });
});
