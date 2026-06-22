import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const restoreModulePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/workspace-context/src/restore-structural-blocks-from-markdown.ts",
)

const DATABASE_ID = "bf51b30e-1234-5678-9abc-def012345678"

export function register({ assert, loadModule, test }) {
  test("isStructuralBlockMarkerLine recognizes database markers", async () => {
    const {
      isStructuralBlockMarkerLine,
    } = await loadModule(restoreModulePath)

    assert.equal(isStructuralBlockMarkerLine("[Database]"), true)
    assert.equal(
      isStructuralBlockMarkerLine(`[Database (${DATABASE_ID})]`),
      true,
    )
    assert.equal(isStructuralBlockMarkerLine("Regular paragraph"), false)
  })

  test("preprocessStructuralBlockMarkdown converts markers to structural HTML", async () => {
    const {
      preprocessStructuralBlockMarkdown,
    } = await loadModule(restoreModulePath)
    const markdown = `# Title\n\n[Database (${DATABASE_ID})]\n\nHello`
    const processed = preprocessStructuralBlockMarkdown(markdown)

    assert.match(
      processed,
      new RegExp(
        `<div data-type="databaseBlock" data-database-id="${DATABASE_ID}"></div>`,
      ),
    )
    assert.match(processed, /# Title/)
    assert.match(processed, /Hello/)
  })

  test("restoreStructuralBlocksInMarkdownContent restores database blocks", async () => {
    const {
      restoreStructuralBlocksInMarkdownContent,
    } = await loadModule(restoreModulePath)
    const content = [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `[Database (${DATABASE_ID})]`,
          },
        ],
      },
    ]

    const restored = restoreStructuralBlocksInMarkdownContent(content)

    assert.equal(restored.length, 1)
    assert.equal(restored[0].type, "databaseBlock")
    assert.equal(restored[0].attrs.databaseId, DATABASE_ID)
    assert.equal(restored[0].attrs.showTitle, true)
  })

  test("restoreStructuralBlocksInMarkdownContent restores link-style video blocks", async () => {
    const {
      restoreStructuralBlocksInMarkdownContent,
    } = await loadModule(restoreModulePath)
    const content = [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Video",
            marks: [{ type: "link", attrs: { href: "https://example.com/v.mp4" } }],
          },
        ],
      },
    ]

    const restored = restoreStructuralBlocksInMarkdownContent(content)

    assert.equal(restored[0].type, "videoBlock")
    assert.equal(restored[0].attrs.src, "https://example.com/v.mp4")
  })

  test("restoreStructuralBlocksInMarkdownContent restores file blocks", async () => {
    const {
      restoreStructuralBlocksInMarkdownContent,
    } = await loadModule(restoreModulePath)
    const content = [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "[File: Notes.pdf](https://example.com/notes.pdf)",
          },
        ],
      },
    ]

    const restored = restoreStructuralBlocksInMarkdownContent(content)

    assert.equal(restored[0].type, "fileBlock")
    assert.equal(restored[0].attrs.title, "Notes.pdf")
    assert.equal(restored[0].attrs.href, "https://example.com/notes.pdf")
  })
}