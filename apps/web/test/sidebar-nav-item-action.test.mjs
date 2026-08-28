import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("sidebar disclosure controls retain their muted pressed treatment", async () => {
    const source = await readFile(
      new URL("../src/components/sidebar-nav-item-action.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /text-muted-foreground!/)
    assert.match(source, /active:bg-sidebar-control-hover!/)
  })
}
