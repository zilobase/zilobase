export function register({ assert, loadModule, test }) {
  test("getPaletteColor resolves palette ids only", async () => {
    const { getPaletteColor } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(getPaletteColor(null), null)
    assert.equal(
      getPaletteColor("pink"),
      "light-dark(var(--color-pink-500), var(--color-pink-700))",
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

  test("yellow is yellow-500 in both themes", async () => {
    const { colorTokens } = await loadModule("/src/lib/color-tokens.ts")
    const yellowToken = colorTokens.find((token) => token.value === "yellow")

    assert.equal(yellowToken?.textClass, "text-yellow-500 dark:text-yellow-500")
    assert.equal(yellowToken?.backgroundClass, "bg-yellow-500 dark:bg-yellow-500")
    assert.equal(
      yellowToken?.solidClass,
      "bg-yellow-500 dark:bg-yellow-500 text-white dark:text-foreground",
    )
  })

  test("colorWithAlpha tints palette colors", async () => {
    const { colorWithAlpha } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(
      colorWithAlpha("pink", 0.18),
      "color-mix(in oklab, light-dark(var(--color-pink-500), var(--color-pink-700)) 18%, transparent)",
    )
    assert.equal(colorWithAlpha("var(--event-pink)", 0.18), null)
  })

  test("getColorTokenBadgeClassName uses solid foreground on pills", async () => {
    const { getColorTokenBadgeClassName } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(
      getColorTokenBadgeClassName("blue"),
      "database-select-badge text-white dark:text-foreground bg-sky-500 dark:bg-sky-700",
    )
    assert.equal(
      getColorTokenBadgeClassName("default"),
      "database-select-badge text-foreground bg-background",
    )
  })
}