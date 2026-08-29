const paletteIds = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
]

export function register({ readSource, assert, loadModule, test }) {
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
    assert.equal(yellowToken?.backgroundClass, "bg-editor-yellow-surface")
    assert.equal(yellowToken?.swatchClass, "bg-editor-yellow")
    assert.equal(
      yellowToken?.solidClass,
      "bg-editor-yellow-surface text-editor-color-foreground",
    )
  })

  test("collaborator colors reuse the editor palette", async () => {
    const { collaboratorColorIds } = await loadModule("/src/lib/color-tokens.ts")

    assert.deepEqual([...collaboratorColorIds], [
      "blue",
      "purple",
      "pink",
      "orange",
      "green",
      "yellow",
      "red",
      "brown",
    ])
  })

  test("icons use palette accents or contrast-safe palette surfaces", async () => {
    const { getIconSolidClassName, getIconTextClassName } = await loadModule(
      "/src/lib/color-tokens.ts",
    )

    assert.equal(getIconTextClassName("blue"), "text-editor-blue")
    assert.equal(
      getIconSolidClassName("blue"),
      "bg-editor-blue-surface text-editor-color-foreground",
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

  test("getColorTokenBadgeClassName uses contrast foreground on pills", async () => {
    const { getColorTokenBadgeClassName } = await loadModule("/src/lib/color-tokens.ts")

    assert.equal(
      getColorTokenBadgeClassName("blue"),
      "database-select-badge text-editor-color-foreground bg-editor-blue-surface",
    )
    assert.equal(
      getColorTokenBadgeClassName("default"),
      "database-select-badge text-foreground bg-background",
    )
  })

  test("Notion-style tag pairs meet WCAG text contrast targets", async () => {
    const css = await readSource("/src/styles/design-tokens.css")
    const themes = [
      readRule(css, ".light"),
      readRule(css, ".dark"),
    ]

    for (const rule of themes) {
      const foreground = readHexToken(rule, "editor-color-foreground")

      for (const id of paletteIds) {
        const surface = readHexToken(rule, `editor-${id}-surface`)

        assert.ok(
          contrast(hexToRgb(foreground), hexToRgb(surface)) >= 4.5,
          `${id} tag text must reach 4.5:1`,
        )
      }
    }
  })
}

function readRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const rule = css.match(
    new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1]

  if (!rule) throw new Error(`Missing ${selector} design-token rule`)
  return rule
}

function readHexToken(rule, token) {
  const value = rule.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`, "i"))?.[1]

  if (!value) throw new Error(`Missing hexadecimal --${token} token`)
  return value
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

function luminance(channels) {
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  )

  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function hexToRgb(hex) {
  return hex
    .match(/[0-9a-f]{2}/gi)
    .map((channel) => Number.parseInt(channel, 16) / 255)
}
