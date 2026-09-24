import { expect, test } from "vitest";
import {
  isEffectivelyEmptyPageContent,
  prosemirrorToMarkdown,
  restoreStructuralBlocksInMarkdownContent,
} from "../index";

test("empty text is empty, but structural blocks keep a document nonempty", () => {
  expect(
    isEffectivelyEmptyPageContent(
      JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "  " }] }],
      }),
    ),
  ).toBe(true);
  expect(isEffectivelyEmptyPageContent({ type: "doc", content: [{ type: "databaseBlock" }] })).toBe(
    false,
  );
  expect(isEffectivelyEmptyPageContent("not JSON")).toBe(false);
});

for (const [type, key, label] of [
  ["databaseBlock", "databaseId", "Database"],
  ["meetingBlock", "meetingId", "Meeting"],
]) {
  test(`${type} retains its identity through markdown markers`, () => {
    const id = "bf51b30e-1234-5678-9abc-def012345678";
    const marker = prosemirrorToMarkdown({ type, attrs: { [key!]: id } });
    expect(marker).toBe(`[${label} (${id})]`);
    const restored = restoreStructuralBlocksInMarkdownContent([
      {
        type: "paragraph",
        attrs: {} as Record<string, unknown>,
        content: [{ type: "text", text: marker }],
      },
    ]);
    expect(restored[0]?.type).toBe(type);
    expect(restored[0]?.attrs[key!]).toBe(id);
  });
}
