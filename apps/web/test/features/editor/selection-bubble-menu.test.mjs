export function register({ readSource, assert, test }) {
  test("selection toolbar follows the editor while its pane settles", async () => {
    const source = await readSource("/src/features/editor/selection/selection-bubble-menu.tsx")

    assert.match(source, /editor\.on\("selectionUpdate", updatePosition\)/)
    assert.match(source, /new ResizeObserver\(updatePosition\)/)
    assert.match(source, /resizeObserver\.observe\(layoutElement\)/)
    assert.match(source, /resizeObserver\.disconnect\(\)/)
    assert.match(source, /editor\.off\("selectionUpdate", updatePosition\)/)
  })

  test("selection toolbar stays hidden while blocks are dragged", async () => {
    const source = await readSource("/src/features/editor/selection/selection-bubble-menu.tsx")

    assert.match(source, /classList\.contains\("dragging"\)/)
    assert.match(source, /selection instanceof NodeSelection/)
  })
}
