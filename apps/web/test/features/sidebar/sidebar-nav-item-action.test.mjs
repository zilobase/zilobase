export function register({ readSource, assert, test }) {
  test("sidebar disclosure controls retain their muted pressed treatment", async () => {
    const source = await readSource("/src/shared/ui/sidebar-nav-item-action.tsx")

    assert.match(source, /text-content-secondary!/)
    assert.match(source, /active:bg-action-neutral-pressed!/)
  })
}
