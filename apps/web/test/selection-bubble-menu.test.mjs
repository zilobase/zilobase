import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("selection toolbar follows the editor while its pane settles", async () => {
    const source = await readFile(
      new URL(
        "../src/editor/components/editor/selection-bubble-menu.tsx",
        import.meta.url,
      ),
      "utf8",
    )

    assert.match(source, /editor\.on\("selectionUpdate", updatePosition\)/)
    assert.match(source, /new ResizeObserver\(updatePosition\)/)
    assert.match(source, /resizeObserver\.observe\(layoutElement\)/)
    assert.match(source, /resizeObserver\.disconnect\(\)/)
    assert.match(source, /editor\.off\("selectionUpdate", updatePosition\)/)
  })
}
