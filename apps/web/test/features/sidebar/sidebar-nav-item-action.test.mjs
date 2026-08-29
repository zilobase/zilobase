export function register({ readSource, assert, test }) {
  test("sidebar disclosure controls retain their muted pressed treatment", async () => {
    const source = await readSource("/src/components/sidebar-nav-item-action.tsx")

    assert.match(source, /text-muted-foreground!/)
    assert.match(source, /active:bg-sidebar-control-hover!/)
  })
}
