import { expect, test } from "vitest";

import { installDomParser } from "./dom-test-setup";
import { assembleClipDocument } from "./assemble-clip-document";
import { extractClipMetadata } from "./extract-clip-metadata";
import { htmlToPageContent } from "./html-to-page-content";
import { sanitizeHtml } from "./sanitize-html";
import { sanitizePageContent } from "./sanitize-page-content";

installDomParser();

test("htmlToPageContent converts headings, lists, code, and tables", () => {
  const document = htmlToPageContent(`
    <h1>Title</h1>
    <p>Hello <strong>world</strong></p>
    <ul><li>One</li><li>Two</li></ul>
    <pre><code>const x = 1</code></pre>
    <table><tr><th>Name</th></tr><tr><td>Ada</td></tr></table>
  `);

  const types = document.content.map((node) => node.type);
  expect(types).toEqual(["heading", "paragraph", "bulletList", "codeBlock", "table"]);
  expect(document.content[0]?.attrs?.level).toBe(1);
});

test("htmlToPageContent keeps images and youtube embeds", () => {
  const document = htmlToPageContent(`
    <p>Photo</p>
    <img src="https://cdn.example.com/photo.png" alt="Photo">
    <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video"></iframe>
  `);

  const types = document.content.map((node) => node.type);
  expect(types).toContain("imageBlock");
  expect(types).toContain("embedBlock");
  const image = document.content.find((node) => node.type === "imageBlock");
  expect(image?.attrs?.src).toBe("https://cdn.example.com/photo.png");
});

test("sanitizeHtml drops scripts, javascript urls, and unknown iframes", () => {
  const html = sanitizeHtml(`
    <p>Safe</p>
    <script>alert(1)</script>
    <a href="javascript:alert(1)">Click</a>
    <img src="javascript:alert(1)">
    <iframe src="https://evil.example/embed"></iframe>
    <iframe src="https://www.youtube.com/embed/ok"></iframe>
  `);

  expect(html).toContain("Safe");
  expect(html).not.toContain("script");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("evil.example");
  expect(html).toContain("youtube.com/embed/ok");
});

test("sanitizePageContent drops unknown nodes and javascript links", () => {
  const sanitized = sanitizePageContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "bad",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
      { type: "imageBlock", attrs: { src: "javascript:alert(1)" } },
      {
        type: "askAiBlock",
        content: [{ type: "paragraph", content: [{ type: "text", text: "keep" }] }],
      },
    ],
  });

  expect(sanitized.content.some((node) => node.type === "imageBlock")).toBe(false);
  expect(sanitized.content.some((node) => node.type === "askAiBlock")).toBe(false);
  const text = sanitized.content[0];
  expect(text?.content?.[0]?.marks?.some((mark) => mark.type === "link")).toBeFalsy();
});

test("empty html becomes an empty paragraph document", () => {
  const document = htmlToPageContent("   ");
  expect(document).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
});

test("assembleClipDocument prepends a bookmark and optional note", () => {
  const document = assembleClipDocument({
    sourceUrl: "https://example.com/article",
    title: "Article",
    description: "Desc",
    favicon: "https://example.com/favicon.ico",
    image: "https://example.com/og.png",
    note: "Read later",
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }],
    },
  });

  expect(document.content[0]?.type).toBe("bookmarkBlock");
  expect(document.content[0]?.attrs?.href).toBe("https://example.com/article");
  expect(document.content[1]?.type).toBe("blockquote");
  expect(document.content[2]?.type).toBe("paragraph");
});

test("extractClipMetadata reads open graph and json-ld", () => {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html>
    <html>
      <head>
        <title>Fallback</title>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Desc">
        <meta property="og:image" content="https://example.com/og.png">
        <meta property="og:site_name" content="Example">
        <link rel="canonical" href="https://example.com/canonical">
        <link rel="icon" href="/favicon.ico">
        <script type="application/ld+json">{"@type":"Article","author":{"name":"Ada"},"datePublished":"2024-01-01"}</script>
      </head>
      <body><p>one two three</p></body>
    </html>`,
    "text/html",
  );

  const metadata = extractClipMetadata(parsed, "https://example.com/article");
  expect(metadata.title).toBe("OG Title");
  expect(metadata.description).toBe("OG Desc");
  expect(metadata.canonicalUrl).toBe("https://example.com/canonical");
  expect(metadata.image).toBe("https://example.com/og.png");
  expect(metadata.favicon).toBe("https://example.com/favicon.ico");
  expect(metadata.author).toBe("Ada");
  expect(metadata.published).toBe("2024-01-01");
  expect(metadata.schemaType).toBe("Article");
  expect(metadata.site).toBe("Example");
  expect(metadata.domain).toBe("example.com");
  expect(metadata.wordCount).toBeGreaterThan(0);
});

test("metadata keeps precedence and reads nested JSON-LD after malformed scripts", () => {
  const document = new DOMParser().parseFromString(
    `<html><head>
    <title>Fallback</title><meta property="og:title" content="Preferred">
    <script type="application/ld+json">invalid</script>
    <script type="application/ld+json">{"@graph":[{"author":{"name":"Ada"},"datePublished":"2026-09-01"}]}</script>
  </head><body>Body text</body></html>`,
    "text/html",
  );
  expect(extractClipMetadata(document, "https://example.com/post")).toMatchObject({
    title: "Preferred",
    author: "Ada",
    published: "2026-09-01",
    domain: "example.com",
  });
});

test("bookmark sanitization preserves safe links and removes unsafe auxiliary URLs", () => {
  const document = sanitizePageContent({
    type: "doc",
    content: [
      {
        type: "bookmarkBlock",
        attrs: {
          href: "https://example.com",
          favicon: "javascript:alert(1)",
          image: "javascript:alert(2)",
        },
      },
      { type: "bookmarkBlock", attrs: { href: "javascript:alert(3)" } },
      { type: "videoBlock", attrs: { src: "javascript:alert(4)" } },
    ],
  });
  expect(document.content).toEqual([
    { type: "bookmarkBlock", attrs: { href: "https://example.com", favicon: null, image: null } },
  ]);
});
