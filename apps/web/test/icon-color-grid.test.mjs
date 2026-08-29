import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("icon color choices use full-size previews", async () => {
    const source = await readFile(
      new URL("../src/components/ui/icon-color-grid.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /flex size-7 items-center justify-center/)
    assert.match(source, /size-6 shrink-0 text-current/)
    assert.match(source, /Math\.min\(previewSize, 24\)/)
  })
}
