import { expect, test } from "vitest";
import { markdownToPageDocument } from "../markdown/markdown-to-page-document";
import { prosemirrorToMarkdown } from "../markdown/prosemirror-to-markdown";
import { planPageEdits } from "./page-edits";

const page = markdownToPageDocument(
  [
    "# Plan",
    "Intro with **bold** text.",
    "## Goals",
    "- Ship v2",
    "## Risks",
    "Scope creep.",
    "### Minor",
    "Typos.",
    "## Notes",
    "Done.",
  ].join("\n\n"),
);
const apply = (edits: Parameters<typeof planPageEdits>[1]) => {
  const plan = planPageEdits(page, edits);
  if ("error" in plan) throw new Error(plan.error);
  return { plan, markdown: prosemirrorToMarkdown({ type: "doc", content: plan.blocks }) };
};

test("sections are replaced up to the next heading of the same level, keeping the heading", () => {
  const { plan, markdown } = apply([
    { type: "replace_section", heading: "risks", markdown: "- Vendor delay\n- Hiring" },
  ]);
  expect(plan.splices).toEqual([
    { index: 5, deleteCount: 3, nodes: [expect.objectContaining({ type: "bulletList" })] },
  ]);
  expect(markdown).toContain("## Risks\n\n- Vendor delay\n- Hiring\n\n## Notes");
  expect(markdown).not.toContain("Typos");
});

test("inserts, appends and block replacements resolve against the evolving page", () => {
  const { markdown } = apply([
    { type: "insert_after", anchor: "Goals", markdown: "Measured quarterly." },
    { type: "replace_block", anchor: "Scope creep", markdown: "Scope is fixed." },
    { type: "append", markdown: "## Owners\n\nAna" },
    { type: "prepend", markdown: "Draft" },
  ]);
  expect(markdown.split("\n\n").slice(0, 2)).toEqual(["Draft", "# Plan"]);
  expect(markdown).toContain("## Goals\n\nMeasured quarterly.\n\n- Ship v2");
  expect(markdown).toContain("## Risks\n\nScope is fixed.");
  expect(markdown.endsWith("## Owners\n\nAna")).toBe(true);
});

test("text replacements keep formatting and report missing text", () => {
  const { markdown } = apply([
    { type: "replace_text", find: "Intro with", replace: "Overview with" },
  ]);
  expect(markdown).toContain("Overview with **bold** text.");
  expect(planPageEdits(page, [{ type: "replace_text", find: "absent", replace: "x" }])).toEqual({
    error: '"absent" was not found in a single text run of the page.',
  });
});

test("ambiguous, missing and non-heading anchors are rejected", () => {
  expect(planPageEdits(page, [{ type: "replace_block", anchor: "0", markdown: "x" }])).toEqual({
    error: '"0" looks like a block number; anchor edits with the block\'s text, such as a heading.',
  });
  expect(planPageEdits(page, [{ type: "insert_after", anchor: "0", markdown: "x" }])).toMatchObject(
    {
      splices: [{ index: 1, deleteCount: 0 }],
    },
  );
  for (const anchor of ["block:0", "Block 0", "#0"])
    expect(planPageEdits(page, [{ type: "insert_after", anchor, markdown: "x" }])).toMatchObject({
      splices: [{ index: 1 }],
    });
  expect(
    "error" in planPageEdits(page, [{ type: "insert_after", anchor: "99", markdown: "x" }]),
  ).toBe(true);
  const twice = markdownToPageDocument("Note one\n\nNote two");
  expect(planPageEdits(twice, [{ type: "insert_after", anchor: "Note", markdown: "x" }])).toEqual({
    error: '"Note" matches 2 blocks; quote more of the block\'s text.',
  });
  expect(
    "error" in planPageEdits(page, [{ type: "insert_after", anchor: "Nowhere", markdown: "x" }]),
  ).toBe(true);
  expect(
    planPageEdits(page, [{ type: "replace_section", heading: "Scope creep", markdown: "x" }]),
  ).toEqual({
    error: '"Scope creep" is not a heading.',
  });
});

test("writing into an empty page replaces its placeholder paragraph", () => {
  const plan = planPageEdits({ type: "doc", content: [{ type: "paragraph" }] }, [
    { type: "append", markdown: "Hello" },
  ]);
  expect(plan).toMatchObject({ splices: [{ index: 0, deleteCount: 1 }] });
});
