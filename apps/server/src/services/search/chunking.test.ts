import { describe, expect, it } from "vitest";
import { byteLength, chunkPageMarkdown, searchSafeText, splitSearchText } from "./chunking";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (content: unknown[]) => ({ type: "doc", content });
describe("search Markdown chunking", () => {
  it("packs small blocks and preserves their original ranges", () => {
    const chunks = chunkPageMarkdown("Guide", doc([paragraph("first"), paragraph("second")]));
    expect(chunks.map((x) => x.kind)).toEqual(["title", "body"]);
    expect(chunks[1].markdown).toBe("first\n\nsecond");
    expect(chunks[1].metadata.blocks?.map((x) => x.blockIndex)).toEqual([0, 1]);
    expect(chunkPageMarkdown("Guide", doc([paragraph("first"), paragraph("second")]))).toEqual(
      chunks,
    );
  });
  it("covers every Unicode code point with bounded overlap", () => {
    const text = "🙂漢字é ".repeat(1400);
    const chunks = splitSearchText(text);
    expect(chunks.length).toBeGreaterThan(2);
    let covered = 0;
    for (const chunk of chunks) {
      expect(chunk.start).toBeLessThanOrEqual(covered);
      expect(chunk.end).toBeGreaterThan(covered);
      expect(chunk.text).toBe(text.slice(chunk.start, chunk.end));
      expect(byteLength(chunk.text)).toBeLessThanOrEqual(2400);
      expect(chunk.text).not.toMatch(/[\uD800-\uDBFF]$/);
      covered = chunk.end;
    }
    expect(covered).toBe(text.length);
  });
  it("keeps headings and database references without expanding sources", () => {
    const chunks = chunkPageMarkdown(
      "Guide",
      doc([
        {
          type: "heading",
          attrs: { level: 1, id: "heading" },
          content: [{ type: "text", text: "Setup" }],
        },
        paragraph("Install"),
        { type: "databaseBlock", attrs: { databaseId: "db-1" } },
      ]),
    );
    expect(chunks[1].metadata.headingPath).toEqual(["Setup"]);
    expect(chunks[1].metadata.blockId).toBe("heading");
    expect(chunks[1].markdown).toContain("Database (db-1)");
  });
  it("splits oversized code into balanced fenced chunks", () => {
    const code = "const value = `example`;\n".repeat(400);
    const chunks = chunkPageMarkdown(
      "Code",
      doc([
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: code }] },
      ]),
    ).filter((x) => x.kind === "body");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.markdown).toMatch(/^```ts\n/);
      expect(chunk.markdown).toMatch(/\n```$/);
      expect(chunk.byteCount).toBeLessThanOrEqual(4096);
    }
    expect(chunks.at(-1)?.metadata.end).toBe(code.length);
  });
  it("retains tables, tabs, columns, callouts and file labels", () => {
    const content = doc([
      {
        type: "tabsBlock",
        content: [{ type: "tabPanel", attrs: { title: "Tab" }, content: [paragraph("Nested")] }],
      },
      { type: "callout", content: [paragraph("Notice")] },
      { type: "fileBlock", attrs: { title: "Report", href: "https://example.test/file" } },
    ]);
    const text = chunkPageMarkdown("", content)
      .map((x) => x.markdown)
      .join("\n");
    expect(text).toContain("Tab");
    expect(text).toContain("Nested");
    expect(text).toContain(":::callout\nNotice\n:::");
    expect(text).toContain("File: Report");
  });
  it("strips binary payloads and signed URL credentials", () => {
    const text = searchSafeText(
      "![img](data:image/png;base64,AAAA) [file](https://example.test/a?X-Amz-Signature=secret&expires=1)",
    );
    expect(text).not.toContain("AAAA");
    expect(text).not.toContain("secret");
    expect(text).toContain("https://example.test/a");
  });
  it("handles empty pages and long titles without silently dropping title text", () => {
    expect(chunkPageMarkdown("", null)).toEqual([]);
    const title = "x".repeat(6000);
    const chunks = chunkPageMarkdown(title, null);
    expect(chunks.at(-1)?.markdown.endsWith("x")).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((x) => x.byteCount <= 4096)).toBe(true);
  });
});
