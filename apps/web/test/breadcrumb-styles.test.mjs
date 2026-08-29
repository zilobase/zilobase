import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("breadcrumbs consistently use medium font weight", async () => {
    const source = await readFile(
      new URL("../src/components/ui/breadcrumb.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /breadcrumb-list[\s\S]*font-medium|font-medium[\s\S]*breadcrumb-list/)
    assert.match(source, /className=\{cn\("font-medium text-foreground"/)
    assert.doesNotMatch(source, /font-normal/)
  })
}
