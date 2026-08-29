export function register({ assert, loadModule, test }) {
  test("desktop translucency stays within the readable range", async () => {
    const {
      DEFAULT_DESKTOP_TRANSLUCENCY,
      MAX_DESKTOP_TRANSLUCENCY,
      normalizeDesktopTranslucency,
    } = await loadModule("/src/lib/desktop-translucency.ts")

    assert.equal(normalizeDesktopTranslucency(-10), 0)
    assert.equal(normalizeDesktopTranslucency(18.6), 19)
    assert.equal(normalizeDesktopTranslucency(75), MAX_DESKTOP_TRANSLUCENCY)
    assert.equal(
      normalizeDesktopTranslucency("not-a-number"),
      DEFAULT_DESKTOP_TRANSLUCENCY,
    )
  })
}
