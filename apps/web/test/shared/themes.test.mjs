const removedThemeIds = [
  "rose",
  "forest",
  "ocean",
  "lilac",
  "dusk",
  "ember",
]

export function register({ readSource, assert, loadModule, test }) {
  test("appearance modes are independent from Default and Notion", async () => {
    const {
      appearanceModes,
      getThemeColorScheme,
      isThemeFamilyId,
      selectableThemeIds,
      themeFamilies,
    } = await loadModule("/src/shared/lib/themes.ts")

    assert.deepEqual(appearanceModes.map((mode) => mode.value), ["light", "dark", "system"])
    assert.deepEqual(selectableThemeIds, ["light", "dark"])
    assert.deepEqual(
      themeFamilies.map((theme) => theme.value),
      ["default", "warm", "midnight", "notion"],
    )
    assert.equal(getThemeColorScheme("light"), "light")
    assert.equal(getThemeColorScheme("dark"), "dark")
    assert.equal(getThemeColorScheme("system"), null)
    assert.equal(isThemeFamilyId("notion"), true)

    for (const id of removedThemeIds) assert.equal(isThemeFamilyId(id), false)
  })

  test("removed stored families normalize to Default and are synchronized", async () => {
    const provider = await readSource("/src/shared/providers/theme-family-provider.tsx")
    const document = await readSource("/index.html")

    assert.match(provider, /if \(isThemeFamilyId\(storedFamily\)\) return storedFamily\s+return "default"/)
    assert.match(provider, /dataset\.themeFamily = themeFamily/)
    assert.match(provider, /localStorage\.setItem\(THEME_FAMILY_STORAGE_KEY, themeFamily\)/)
    assert.match(document, /const families = \["default", "warm", "midnight", "notion"\]/)
    assert.match(document, /dataset\.themeFamily = resolvedFamily/)
    for (const id of removedThemeIds) assert.doesNotMatch(document, new RegExp(`"${id}"`))
  })

  test("theme families expose their specified light and dark core palettes", async () => {
    const css = await readSource("/src/shared/styles/color-tokens.css")
    const defaultLight = declarations(readRule(css, ".light"))
    const defaultDark = merge(defaultLight, declarations(readRule(css, ".dark")))
    const notionLight = merge(
      defaultLight,
      declarations(readRule(css, '.light[data-theme-family="notion"]')),
    )
    const notionDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="notion"]')),
    )
    const warmLight = merge(
      defaultLight,
      declarations(readRule(css, '.light[data-theme-family="warm"]')),
    )
    const warmDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="warm"]')),
    )
    const midnightLight = merge(
      defaultLight,
      declarations(readRule(css, '.light[data-theme-family="midnight"]')),
    )
    const midnightDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="midnight"]')),
    )

    assertTokens(defaultLight, {
      "--zb-color-surface-background-canvas": "#ffffff",
      "--zb-color-surface-background-card": "#ffffff",
      "--zb-color-surface-background-overlay": "#ffffff",
      "--zb-color-surface-background-navigation": "#f7f7f8",
      "--zb-color-surface-background-subtle": "#fafafa",
      "--zb-color-surface-background-muted": "#f4f4f5",
      "--zb-color-content-text-primary": "#18181b",
      "--zb-color-content-text-secondary": "#5f5f68",
      "--zb-color-border-stroke-default": "#e4e4e7",
      "--zb-color-control-background-default": "#ffffff",
      "--zb-color-control-border-default": "var(--zb-color-border-stroke-default)",
      "--zb-color-action-background-neutral-hover": "#f0f0f2",
      "--zb-color-action-background-neutral-pressed": "#e4e4e7",
    })
    assertTokens(defaultDark, {
      "--zb-color-surface-background-canvas": "#111113",
      "--zb-color-surface-background-card": "#18181b",
      "--zb-color-surface-background-overlay": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-navigation": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-subtle": "#151517",
      "--zb-color-surface-background-muted": "#1f1f23",
      "--zb-color-content-text-primary": "#f4f4f5",
      "--zb-color-content-text-secondary": "#a1a1aa",
      "--zb-color-border-stroke-default": "#2c2c31",
      "--zb-color-control-background-default": "#1f1f23",
      "--zb-color-control-border-default": "var(--zb-color-border-stroke-default)",
      "--zb-color-action-background-neutral-hover": "#25252a",
      "--zb-color-action-background-neutral-pressed": "#303036",
    })
    assertTokens(notionLight, {
      "--zb-color-surface-background-canvas": "#ffffff",
      "--zb-color-surface-background-card": "#ffffff",
      "--zb-color-surface-background-overlay": "#ffffff",
      "--zb-color-surface-background-navigation": "#f9f8f7",
      "--zb-color-surface-background-subtle": "#f4f3f3",
      "--zb-color-surface-background-muted": "#f0efed",
      "--zb-color-content-text-primary": "#2c2c2b",
      "--zb-color-content-text-secondary": "#5f5e59",
      "--zb-color-border-stroke-default": "#e6e5e3",
      "--zb-color-control-background-default": "#ffffff",
      "--zb-color-control-border-default": "var(--zb-color-border-stroke-default)",
      "--zb-color-action-background-neutral-hover": "#efefee",
      "--zb-color-action-background-neutral-pressed": "#dfdfde",
    })
    assertTokens(notionDark, {
      "--zb-color-surface-background-canvas": "#191919",
      "--zb-color-surface-background-card": "#202020",
      "--zb-color-surface-background-overlay": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-navigation": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-subtle": "#262626",
      "--zb-color-surface-background-muted": "#383836",
      "--zb-color-content-text-primary": "#f0efed",
      "--zb-color-content-text-secondary": "#bcbab6",
      "--zb-color-border-stroke-default": "#383836",
      "--zb-color-control-background-default": "#202020",
      "--zb-color-control-border-default": "var(--zb-color-border-stroke-default)",
      "--zb-color-action-background-neutral-hover": "#2c2c2c",
      "--zb-color-action-background-neutral-pressed": "#252525",
    })
    assertTokens(warmLight, {
      "--zb-color-surface-background-canvas": "#fbf8f1",
      "--zb-color-surface-background-card": "#fffdf8",
      "--zb-color-surface-background-overlay": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-navigation": "#f6f0e7",
      "--zb-color-content-text-primary": "#2f2923",
      "--zb-color-content-text-secondary": "#77695b",
      "--zb-color-action-background-primary": "#5f4938",
    })
    assertTokens(warmDark, {
      "--zb-color-surface-background-canvas": "#1c1713",
      "--zb-color-surface-background-card": "#241e19",
      "--zb-color-surface-background-overlay": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-navigation": "var(--zb-color-surface-background-card)",
      "--zb-color-content-text-primary": "#f4ede5",
      "--zb-color-content-text-secondary": "#a89686",
      "--zb-color-action-background-primary": "#dcc1a6",
    })
    assertTokens(midnightLight, {
      "--zb-color-surface-background-canvas": "#f6f8ff",
      "--zb-color-surface-background-card": "#ffffff",
      "--zb-color-surface-background-overlay": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-navigation": "#edf2fc",
      "--zb-color-content-text-primary": "#1a2340",
      "--zb-color-content-text-secondary": "#5c6a8a",
      "--zb-color-action-background-primary": "#334e8a",
    })
    assertTokens(midnightDark, {
      "--zb-color-surface-background-canvas": "#0b1020",
      "--zb-color-surface-background-card": "#0f1526",
      "--zb-color-surface-background-overlay": "var(--zb-color-surface-background-card)",
      "--zb-color-surface-background-navigation": "var(--zb-color-surface-background-card)",
      "--zb-color-content-text-primary": "#eef2ff",
      "--zb-color-content-text-secondary": "#8390ad",
      "--zb-color-action-background-primary": "#dbe7ff",
    })
  })

  test("dark themes keep raised chrome and overlays on one surface tier", async () => {
    const css = await readSource("/src/shared/styles/color-tokens.css")
    const defaultLight = declarations(readRule(css, ".light"))
    const defaultDark = merge(defaultLight, declarations(readRule(css, ".dark")))
    const notionDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="notion"]')),
    )
    const warmDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="warm"]')),
    )
    const midnightDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="midnight"]')),
    )

    for (const [name, palette] of Object.entries({
      defaultDark,
      warmDark,
      midnightDark,
      notionDark,
    })) {
      const card = resolve(palette, "--zb-color-surface-background-card")
      assert.equal(
        resolve(palette, "--zb-color-surface-background-overlay"),
        card,
        `${name} overlays should match cards`,
      )
      assert.equal(
        resolve(palette, "--zb-color-surface-background-navigation"),
        card,
        `${name} navigation should match cards`,
      )
    }
  })

  test("theme-color synchronization reacts to appearance and family", async () => {
    const source = await readSource("/src/app/providers/app-providers.tsx")

    assert.match(source, /const \{ themeFamily \} = useThemeFamily\(\)/)
    assert.match(source, /dataset\.themeFamily = themeFamily/)
    assert.match(source, /meta\?\.setAttribute\("content", getComputedStyle\(document\.body\)\.backgroundColor\)/)
    assert.match(source, /\[resolvedTheme, themeFamily\]/)
  })

  test("all four palettes provide accessible content and action pairs", async () => {
    const css = await readSource("/src/shared/styles/color-tokens.css")
    const defaultLight = declarations(readRule(css, ".light"))
    const defaultDark = merge(defaultLight, declarations(readRule(css, ".dark")))
    const notionLight = merge(
      defaultLight,
      declarations(readRule(css, '.light[data-theme-family="notion"]')),
    )
    const notionDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="notion"]')),
    )
    const warmLight = merge(
      defaultLight,
      declarations(readRule(css, '.light[data-theme-family="warm"]')),
    )
    const warmDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="warm"]')),
    )
    const midnightLight = merge(
      defaultLight,
      declarations(readRule(css, '.light[data-theme-family="midnight"]')),
    )
    const midnightDark = merge(
      defaultDark,
      declarations(readRule(css, '.dark[data-theme-family="midnight"]')),
    )

    for (const [name, palette] of Object.entries({
      defaultLight,
      defaultDark,
      warmLight,
      warmDark,
      midnightLight,
      midnightDark,
      notionLight,
      notionDark,
    })) {
      for (const surface of ["canvas", "card", "overlay", "navigation", "muted"]) {
        assertContrast(
          palette,
          "--zb-color-content-text-primary",
          `--zb-color-surface-background-${surface}`,
          4.5,
          `${name} primary/${surface}`,
        )
        assertContrast(
          palette,
          "--zb-color-content-text-secondary",
          `--zb-color-surface-background-${surface}`,
          4.5,
          `${name} secondary/${surface}`,
        )
      }

      assertContrast(
        palette,
        "--zb-color-action-text-on-primary",
        "--zb-color-action-background-primary",
        4.5,
        `${name} primary action`,
      )
      assertContrast(
        palette,
        "--zb-color-action-text-link",
        "--zb-color-surface-background-canvas",
        4.5,
        `${name} link`,
      )
      assertContrast(
        palette,
        "--zb-color-action-ring-focus",
        "--zb-color-surface-background-canvas",
        3,
        `${name} focus ring`,
      )

      for (const feedback of ["success", "warning", "error"]) {
        assertContrast(
          palette,
          `--zb-color-feedback-text-${feedback}`,
          `--zb-color-feedback-background-${feedback}-subtle`,
          4.5,
          `${name} ${feedback} feedback`,
        )
      }
    }
  })
}

function readRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const rule = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1]
  if (!rule) throw new Error(`Missing ${selector}`)
  return rule
}

function declarations(rule) {
  return new Map(
    [...rule.matchAll(/(--zb-color-[a-z0-9-]+):\s*(#[0-9a-f]{6}|var\([^)]+\));/gi)].map(
      ([, name, value]) => [name, value],
    ),
  )
}

function merge(base, overrides) {
  return new Map([...base, ...overrides])
}

function resolve(palette, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Token cycle at ${name}`)
  seen.add(name)
  const value = palette.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  const reference = value.match(/^var\((--[^)]+)\)$/)?.[1]
  return reference ? resolve(palette, reference, seen) : value
}

function assertContrast(palette, foreground, background, minimum, message) {
  const ratio = contrast(resolve(palette, foreground), resolve(palette, background))
  if (ratio < minimum) throw new Error(`${message} is ${ratio.toFixed(2)}:1; expected ${minimum}:1`)
}

function assertTokens(palette, expected) {
  for (const [name, value] of Object.entries(expected)) {
    if (palette.get(name) !== value) {
      throw new Error(`${name} is ${palette.get(name)}; expected ${value}`)
    }
  }
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
