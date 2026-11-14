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
  expect(result).toContain("> Remember");
  expect(result).toContain("one<br><br>two");
  expect(result).toContain("[Unsupported block: futureBlock]");
});

for (const start of [0, 4, 9]) {
  test(`ordered lists preserve start ${start} and align continuation blocks`, () => {
    const paragraph = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const markdown = prosemirrorToMarkdown({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start },
          content: [
            {
              type: "listItem",
              content: [paragraph("Install"), paragraph("Keep the existing configuration.")],
            },
            {
              type: "listItem",
              content: [
                paragraph("Run"),
                {
                  type: "bulletList",
                  content: [{ type: "listItem", content: [paragraph("Check output")] }],
                },
              ],
            },
          ],
        },
      ],
    });
    const firstPadding = " ".repeat(String(start).length + 2);
    const secondPadding = " ".repeat(String(start + 1).length + 2);
    expect(markdown).toBe(
      `${start}. Install\n${firstPadding}\n${firstPadding}Keep the existing configuration.\n` +
        `${start + 1}. Run\n${secondPadding}\n${secondPadding}- Check output`,
    );
  });
}

test("default ordered lists retain numbering and align item ten continuation", () => {
  const content = Array.from({ length: 10 }, (_, index) => ({
    type: "listItem",
    content: [
      { type: "paragraph", content: [{ type: "text", text: `Step ${index + 1}` }] },
      { type: "paragraph", content: [{ type: "text", text: "Details" }] },
    ],
  }));
  const absentStart = prosemirrorToMarkdown({ type: "orderedList", content });
  const explicitStart = prosemirrorToMarkdown({
    type: "orderedList",
    attrs: { start: 1 },
    content,
  });
  expect(absentStart).toBe(explicitStart);
  expect(absentStart).toContain("9. Step 9\n   \n   Details\n10. Step 10\n    \n    Details");
});

test("ordered list numbering is local to each nested list", () => {
  expect(
    prosemirrorToMarkdown({
      type: "orderedList",
      attrs: { start: 10 },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Outer" }] },
            {
              type: "orderedList",
              attrs: { start: 3 },
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Inner" }] }],
                },
              ],
            },
          ],
        },
      ],
    }),
  ).toBe("10. Outer\n    \n    3. Inner");
});
