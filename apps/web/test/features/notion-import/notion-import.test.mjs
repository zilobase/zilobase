import { parseHTML } from "linkedom"

function installDomParser() {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>")
  globalThis.document = document
  globalThis.window = window
  globalThis.DOMParser = class DOMParser {
    parseFromString(html, type) {
      if (type !== "text/html") {
        throw new Error(`Unsupported DOMParser type: ${type}`)
      }

      return parseHTML(html).document
    }
  }
}

function notionPage({ body, title = "Test Page", emoji = "✅" }) {
  return `<!doctype html>
    <html>
      <head><title>${title}</title></head>
      <body>
        <header>
          <div class="page-header-icon"><span class="icon">${emoji}</span></div>
          <h1>${title}</h1>
        </header>
        <div class="page-body">${body}</div>
      </body>
    </html>`
}

export function register({ assert, loadModule, test }) {
  test("normalizeNotionHtmlBlocks converts basic and advanced Notion blocks", async () => {
    installDomParser()
    const { normalizeNotionHtmlBlocks } = await loadModule("/src/lib/notion-html-blocks.ts")

    const result = normalizeNotionHtmlBlocks(
      notionPage({
        body: `
          <h2>Heading</h2>
          <p>Hello <strong>world</strong></p>
          <ul class="to-do-list">
            <li><span class="checkbox checkbox-on"></span>Done</li>
          </ul>
          <figure class="callout">
            <div><span class="icon">💡</span></div>
            <div><p>Remember this</p></div>
          </figure>
          <ul class="toggle"><li><details><summary>More</summary><p>Hidden</p></details></li></ul>
          <pre><code>const value = 1</code></pre>
          <table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>
          <img src="images/example.png" alt="example.png" />
        `,
        title: "Import Me",
      }),
    )

    const content = JSON.stringify(result.content)

    assert.equal(result.title, "Import Me")
    assert.equal(result.emoji, "✅")
    assert.equal(result.skippedAssets, 1)
    assert.match(result.html, /data-type="taskList"/)
    assert.match(result.html, /<blockquote>/)
    assert.match(result.html, /<details>/)
    assert.match(result.html, /\[Asset skipped: example\.png\]/)
    assert.match(content, /taskList/)
    assert.match(content, /codeBlock/)
    assert.match(content, /table/)
  })

  test("normalizeNotionHtmlBlocks rewrites internal Notion links", async () => {
    installDomParser()
    const { normalizeNotionHtmlBlocks } = await loadModule("/src/lib/notion-html-blocks.ts")
    const pagePathMap = new Map([["Root/Child.html", "page-child"]])

    const result = normalizeNotionHtmlBlocks(
      notionPage({
        body: `<p><a href="./Root/Child.html">Child</a></p>`,
      }),
      { pagePathMap },
    )

    assert.match(result.html, /href="\/p\/page-child"/)
    assert.match(JSON.stringify(result.content), /\/p\/page-child/)
  })

  test("normalizeNotionHtmlBlocks drops exported spacer blocks", async () => {
    installDomParser()
    const { normalizeNotionHtmlBlocks } = await loadModule("/src/lib/notion-html-blocks.ts")

    const result = normalizeNotionHtmlBlocks(
      notionPage({
        body: `
          <h2>basic blocks</h2>
          <p></p>
          <p>plain text:</p>
          <div></div>
          <p>styled text:</p>
        `,
      }),
    )

    assert.deepEqual(
      result.content.content.map((block) => block.type),
      ["heading", "paragraph", "paragraph"],
    )
  })

  test("importNotionZipFile creates nested pages then updates content", async () => {
    installDomParser()
    const { strToU8, zipSync } = await import("fflate")
    const { importNotionZipFile } = await loadModule("/src/lib/notion-import.ts")
    const zip = zipSync({
      "Root.html": strToU8(notionPage({
        body: `<p>Root <a href="Root/Child.html">Child</a></p>`,
        title: "Root",
      })),
      "Root/Child.html": strToU8(notionPage({
        body: `<p>Child <a href="../Root.html">Root</a></p>`,
        title: "Child",
        emoji: "📄",
      })),
    })
    const created = []
    const updated = []
    const file = new File([zip], "notion.zip", { type: "application/zip" })

    const result = await importNotionZipFile({
      createPage: async (input) => {
        const page = { ...input, id: `page-${created.length + 1}` }
        created.push(page)
        return page
      },
      file,
      updatePage: async (input) => {
        updated.push(input)
      },
      workspaceId: "workspace-1",
    })

    assert.deepEqual(result.createdPageIds, ["page-1", "page-2"])
    assert.equal(result.entryPageId, "page-1")
    assert.equal(created[0].name, "Root")
    assert.equal(created[1].name, "Child")
    assert.equal(created[1].parentItemId, "page-1")
    assert.equal(created[1].emoji, "📄")
    assert.equal(updated.length, 2)
    assert.match(JSON.stringify(updated[0].content), /\/p\/page-2/)
    assert.match(JSON.stringify(updated[1].content), /\/p\/page-1/)
  })

  test("importNotionZipFile rejects Notion markdown exports", async () => {
    installDomParser()
    const { strToU8, zipSync } = await import("fflate")
    const { importNotionZipFile, NotionImportError } = await loadModule("/src/lib/notion-import.ts")
    const file = new File([zipSync({ "Page.md": strToU8("# Page") })], "notion.zip")

    await assert.rejects(
      () =>
        importNotionZipFile({
          createPage: async () => ({ id: "unused" }),
          file,
          updatePage: async () => {},
          workspaceId: "workspace-1",
        }),
      NotionImportError,
    )
  })
}
