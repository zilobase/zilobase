import { expect, test } from "vitest";
import { parsePageDocument } from "../document/parse-page-document";
import { markdownToPageDocument } from "./markdown-to-page-document";
import { prosemirrorToMarkdown } from "./prosemirror-to-markdown";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const text = (value: string, ...marks: string[]) => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: object[]) => ({ type: "paragraph", content });

const everyBlock = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Project brief")] },
    { type: "heading", attrs: { level: 3 }, content: [text("Goals")] },
    paragraph(
      text("Plain "),
      text("bold", "bold"),
      text(" "),
      text("italic", "italic"),
      text(" "),
      text("gone", "strike"),
      text(" "),
      text("code", "code"),
      text(" "),
      text("under", "underline"),
      text(" "),
      {
        type: "text",
        text: "link",
        marks: [{ type: "link", attrs: { href: "https://zilobase.com" } }],
      },
      { type: "hardBreak" },
      text("second line"),
    ),
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [paragraph(text("One"))] },
        {
          type: "listItem",
          content: [
            paragraph(text("Two")),
            {
              type: "bulletList",
              content: [{ type: "listItem", content: [paragraph(text("Nested"))] }],
            },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        { type: "listItem", content: [paragraph(text("First"))] },
        { type: "listItem", content: [paragraph(text("Second"))] },
      ],
    },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [paragraph(text("Done"))] },
        { type: "taskItem", attrs: { checked: false }, content: [paragraph(text("Todo"))] },
      ],
    },
    { type: "blockquote", content: [paragraph(text("Quoted"))] },
    { type: "callout", attrs: { icon: "⚠️" }, content: [paragraph(text("Careful"))] },
    {
      type: "details",
      content: [
        { type: "detailsSummary", content: [text("More")] },
        { type: "detailsContent", content: [paragraph(text("Hidden"))] },
      ],
    },
    {
      type: "tabsBlock",
      content: [
        { type: "tabPanel", attrs: { title: "Web" }, content: [paragraph(text("Web tab"))] },
        { type: "tabPanel", attrs: { title: "Mobile" }, content: [paragraph(text("Mobile tab"))] },
      ],
    },
    {
      type: "columnBlock",
      content: [
        { type: "column", content: [paragraph(text("Left"))] },
        { type: "column", content: [paragraph(text("Right"))] },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [text("const a = 1;\nconst b = `x`;")],
    },
    { type: "blockMath", attrs: { latex: "e = mc^2" } },
    { type: "tableOfContentsBlock" },
    { type: "horizontalRule" },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [paragraph(text("Name"))] },
            { type: "tableHeader", content: [paragraph(text("Owner"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [paragraph(text("API"))] },
            { type: "tableCell", content: [paragraph(text("Ana", "bold"))] },
          ],
        },
      ],
    },
    { type: "imageBlock", attrs: { src: "https://example.com/a.png", alt: "Diagram" } },
    { type: "videoBlock", attrs: { src: "https://example.com/v.mp4" } },
    { type: "fileBlock", attrs: { href: "https://example.com/spec.pdf", title: "spec.pdf" } },
    {
      type: "embedBlock",
      attrs: { src: "https://www.youtube.com/watch?v=x", title: "Demo", provider: "youtube" },
    },
    { type: "bookmarkBlock", attrs: { href: "https://zilobase.com", title: "Zilobase" } },
    { type: "pageBlock", attrs: { pageId: id(1) } },
    { type: "databaseBlock", attrs: { databaseId: id(2), showTitle: true } },
    { type: "paragraph" },
    { type: "meetingBlock", attrs: { meetingId: id(3) } },
  ],
};

test("every supported block and mark round-trips through ZFM", () => {
  const markdown = prosemirrorToMarkdown(everyBlock);
  const document = markdownToPageDocument(markdown);
  expect(() => parsePageDocument(document)).not.toThrow();
  expect(prosemirrorToMarkdown(document)).toBe(markdown);
  const types = (document.content ?? []).map((node) => node.type);
  expect(types).toEqual(
    everyBlock.content
      .map((node) => node.type)
      // Empty paragraphs are not written, but database blocks add their trailing one back.
      .filter((type, index, all) => !(type === "paragraph" && all[index - 1] === "databaseBlock"))
      .flatMap((type) => (type === "databaseBlock" ? [type, "paragraph"] : [type])),
  );
});

const fixture = (type: string) =>
  everyBlock.content.find((node) => node.type === type)! as { attrs?: unknown; content?: unknown };

test("inline marks and structural attributes survive parsing", () => {
  const document = markdownToPageDocument(prosemirrorToMarkdown(everyBlock));
  const find = (type: string) => document.content!.find((node) => node.type === type)!;
  expect(find("paragraph").content).toEqual(fixture("paragraph").content);
  expect(find("callout").attrs).toEqual({ icon: "⚠️" });
  expect(find("tabsBlock").content!.map((tab) => tab.attrs?.title)).toEqual(["Web", "Mobile"]);
  expect(find("embedBlock").attrs).toEqual(fixture("embedBlock").attrs);
  expect(find("bookmarkBlock").attrs).toEqual({ href: "https://zilobase.com", title: "Zilobase" });
  expect(find("taskList").content!.map((item) => item.attrs?.checked)).toEqual([true, false]);
  expect(find("codeBlock")).toEqual(fixture("codeBlock"));
  expect(find("databaseBlock").attrs).toEqual({ databaseId: id(2), showTitle: true });
});

test("model-written Markdown resolves new subpages and inline databases", () => {
  const created: string[] = [];
  const document = markdownToPageDocument(
    [
      "# Launch plan",
      "Ship **v2** by _Friday_.",
      "",
      "[Database: Launch tasks]",
      "",
      "[Page: Risks]",
      "",
      ":::callout 🚀",
      "- Owner: Ana",
      "- Status: on track",
      ":::",
      "",
      "Price is $5 and_snake_case stays plain.",
    ].join("\n"),
    {
      database: (title) => (created.push(`database:${title}`), id(4)),
      page: (title) => (created.push(`page:${title}`), id(5)),
    },
  );
  expect(created).toEqual(["database:Launch tasks", "page:Risks"]);
  expect(document.content!.map((node) => node.type)).toEqual([
    "heading",
    "paragraph",
    "databaseBlock",
    "paragraph",
    "pageBlock",
    "callout",
    "paragraph",
  ]);
  expect(document.content![1]!.content).toEqual([
    text("Ship "),
    text("v2", "bold"),
    text(" by "),
    text("Friday", "italic"),
    text("."),
  ]);
  expect(document.content![5]!.content![0]!.type).toBe("bulletList");
  expect(document.content![6]!.content).toEqual([text("Price is $5 and_snake_case stays plain.")]);
});

test("unresolved references stay readable text and empty input is an empty page", () => {
  expect(markdownToPageDocument("[Page: Missing]").content).toEqual([
    paragraph(text("[Page: Missing]")),
  ]);
  expect(markdownToPageDocument("").content).toEqual([{ type: "paragraph" }]);
  expect(markdownToPageDocument("##### Deep").content![0]!.attrs).toEqual({ level: 4 });
});
