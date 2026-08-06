export function register({ assert, loadModule, test }) {
  test("getPaletteColor resolves palette ids only", async () => {
    const { getPaletteColor } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(getPaletteColor(null), null)
    assert.equal(
      getPaletteColor("pink"),
      "var(--editor-pink)",
    )
    assert.equal(getPaletteColor("var(--event-pink)"), null)
    assert.equal(getPaletteColor("#ff00ff"), null)
  })

  test("isPaletteColorActive matches token ids and palette CSS", async () => {
    const { getPaletteColor, isPaletteColorActive } =
      await loadModule("/src/lib/color-tokens.ts")

    assert.equal(isPaletteColorActive(null, null), true)
    assert.equal(isPaletteColorActive("pink", "pink"), true)
    assert.equal(isPaletteColorActive(getPaletteColor("pink"), "pink"), true)
    assert.equal(isPaletteColorActive("blue", "pink"), false)
  })

  test("yellow consumes semantic editor tokens", async () => {
    const { colorTokens } = await loadModule("/src/lib/color-tokens.ts")
    const yellowToken = colorTokens.find((token) => token.value === "yellow")

    assert.equal(yellowToken?.textClass, "text-editor-yellow")
    assert.equal(yellowToken?.backgroundClass, "bg-editor-yellow-solid")
    assert.equal(
      yellowToken?.solidClass,
      "bg-editor-yellow-solid text-editor-color-foreground",
    )
  })

  test("colorWithAlpha tints palette colors", async () => {
    const { colorWithAlpha } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(
      colorWithAlpha("pink", 0.18),
      "color-mix(in oklab, var(--editor-pink) 18%, transparent)",
    )
    assert.equal(colorWithAlpha("var(--event-pink)", 0.18), null)
  })

  test("getColorTokenBadgeClassName uses solid foreground on pills", async () => {
    const { getColorTokenBadgeClassName } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(
      getColorTokenBadgeClassName("blue"),
      "database-select-badge text-editor-color-foreground bg-editor-blue-solid",
    )
    assert.equal(
      getColorTokenBadgeClassName("default"),
      "database-select-badge text-foreground bg-background",
    )
  })
}
