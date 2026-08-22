import { readFile } from "node:fs/promises"

export function register({ assert, loadModule, test }) {
  test("appearance modes and theme families are independent", async () => {
    const {
      appearanceModes,
      getThemeColorScheme,
      isThemeFamilyId,
      selectableThemeIds,
      themeFamilies,
    } = await loadModule("/src/lib/themes.ts")

    assert.deepEqual(
      appearanceModes.map((mode) => mode.value),
      ["light", "dark", "system"],
    )
    assert.deepEqual(selectableThemeIds, ["light", "dark"])
    assert.deepEqual(
      themeFamilies.map((theme) => theme.value),
      [
        "default",
        "warm",
        "midnight",
        "rose",
        "forest",
        "ocean",
        "lilac",
        "dusk",
        "ember",
        "notion",
      ],
    )
    assert.equal(getThemeColorScheme("light"), "light")
    assert.equal(getThemeColorScheme("dark"), "dark")
    assert.equal(getThemeColorScheme("system"), null)
    assert.equal(getThemeColorScheme(undefined), null)
    assert.equal(getThemeColorScheme("warm"), null)
    assert.equal(isThemeFamilyId("notion"), true)
    assert.equal(isThemeFamilyId("unknown"), false)
  })

  test("every custom theme family supplies light and dark palettes", async () => {
    const { themeFamilies } = await loadModule("/src/lib/themes.ts")
    const css = await readFile(
      new URL("../src/styles/design-tokens.css", import.meta.url),
      "utf8",
    )

    for (const family of themeFamilies) {
      if (family.value === "default") continue

      for (const mode of ["light", "dark"]) {
        const selector = `.${mode}[data-theme="${family.value}"]`
        const rule = readRule(css, selector)

        for (const [foreground, background] of contrastPairs) {
          const ratio = contrast(
            readHexToken(rule, foreground),
            readHexToken(rule, background),
          )

          assert.ok(
            ratio >= 4.5,
            `${selector} ${foreground}/${background} must reach 4.5:1`,
          )
        }
      }
    }
  })
}

const contrastPairs = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["active-foreground", "active"],
]

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

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  )

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
