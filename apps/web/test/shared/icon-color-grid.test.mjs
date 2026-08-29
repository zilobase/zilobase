export function register({ readSource, assert, test }) {
  test("icon color choices use full-size previews", async () => {
    const source = await readSource("/src/components/ui/icon-color-grid.tsx")

    assert.match(source, /flex size-7 items-center justify-center/)
    assert.match(source, /size-6 shrink-0 text-current/)
    assert.match(source, /Math\.min\(previewSize, 24\)/)
  })
}
