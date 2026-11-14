import { expect, test } from "vitest";
import {
  isEffectivelyEmptyPageContent,
  isStructuralBlockMarkerLine,
  preprocessStructuralBlockMarkdown,
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

test("TeX equations retain their source in page markdown", () => {
  const latex = String.raw`\frac{a}{b} = \sqrt{c}`;
  expect(
    prosemirrorToMarkdown({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "An equation:" }] },
        { type: "blockMath", attrs: { latex } },
      ],
    }),
  ).toBe(`An equation:\n\n$$\n${latex}\n$$`);
  expect(isEffectivelyEmptyPageContent({ type: "doc", content: [{ type: "blockMath" }] })).toBe(
    false,
  );
});

test("table of contents placement survives page markdown conversion", () => {
  const node = { type: "tableOfContentsBlock" };
  const marker = prosemirrorToMarkdown(node);
  expect(marker).toBe("[Table of contents]");
  expect(isStructuralBlockMarkerLine(marker)).toBe(true);
  expect(preprocessStructuralBlockMarkdown(marker)).toBe(
    '<div data-type="tableOfContentsBlock"></div>',
  );
  expect(
    restoreStructuralBlocksInMarkdownContent([
      { type: "paragraph", content: [{ type: "text", text: marker }] },
    ]),
  ).toEqual([node]);
  expect(isEffectivelyEmptyPageContent({ type: "doc", content: [node] })).toBe(false);
});

test("code fences, multiline tables, callouts and unsupported blocks retain content", () => {
  const result = prosemirrorToMarkdown({
    type: "doc",
    content: [
      { type: "codeBlock", content: [{ type: "text", text: "```\ncode" }] },
      {
        type: "callout",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Remember" }] }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "one" }] },
                  { type: "paragraph", content: [{ type: "text", text: "two" }] },
                ],
              },
            ],
          },
        ],
      },
      { type: "futureBlock" },
    ],
  });
  expect(result).toContain("````\n```\ncode\n````");
  expect(result).toContain(":::callout\nRemember\n:::");
  expect(result).toContain("one<br><br>two");
  expect(result).toContain("[Unsupported block: futureBlock]");
});
