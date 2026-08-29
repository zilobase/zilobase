import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const sourceExtensions = new Set([".css", ".html", ".ts", ".tsx"])
const tailwindColorNames = [
  "amber",
  "black",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "lime",
  "neutral",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "slate",
  "stone",
  "teal",
  "violet",
  "white",
  "yellow",
  "zinc",
].join("|")
const colorUtilities =
  "bg|border|decoration|fill|from|outline|ring|stroke|text|to|via"
const opacityModifier = new RegExp(
  `\\b(?:${colorUtilities})-[a-zA-Z][a-zA-Z0-9-]*/[0-9]{1,3}\\b`,
  "g",
)
const builtInPaletteUtility = new RegExp(
  `\\b(?:${colorUtilities})-(?:${tailwindColorNames})(?:-[0-9]{2,3})?(?:/[0-9]{1,3})?\\b`,
  "g",
)
const rawColorLiteral =
  /#[0-9a-fA-F]{3,8}\b|\b(?:color-mix|hsla?|lab|lch|oklab|oklch|rgba?)\(/g
const numberedSemanticColor =
  /\b(?:bg|border|decoration|fill|from|outline|ring|stroke|text|to|via)-(?:accent|backdrop|background|border|destructive|foreground|input|muted|muted-foreground|popover|primary|primary-foreground|ring|scrim|secondary|selection|sidebar-accent|sidebar-foreground|surface-inverse)-[0-9]{1,3}\b/g
const systemColorUtility =
  /\b(?:bg|border|decoration|fill|outline|ring|stroke|text)-\[(?:Canvas|CanvasText|Highlight|HighlightText)\]\b/g
const brandSvgFiles = new Set([
  "src/shared/components/google-icon.tsx",
  "src/features/editor/extensions/embed-block.tsx",
])
const tokenDerivedColorFiles = new Set([
  "src/shared/lib/color-tokens.ts",
  "src/features/editor/extensions/database/views/chart/database-chart-data.ts",
])

export function register({ appPath, assert, test }) {
  test("UI colors use explicit application tokens", async () => {
    const appDir = appPath(".")
    const files = [join(appDir, "index.html"), ...(await sourceFiles(join(appDir, "src")))]
    const violations = []

    for (const file of files) {
      if (relative(appDir, file) === "src/shared/styles/design-tokens.css") continue

      const source = await readFile(file, "utf8")
      const lines = source.split("\n")
      const relativeFile = relative(appDir, file)

      for (const [index, line] of lines.entries()) {
        for (const pattern of [
          opacityModifier,
          builtInPaletteUtility,
          numberedSemanticColor,
          rawColorLiteral,
          systemColorUtility,
        ]) {
          pattern.lastIndex = 0
          for (const match of line.matchAll(pattern)) {
            const isEmbeddedBrandColor =
              pattern === rawColorLiteral &&
              brandSvgFiles.has(relativeFile) &&
              /\b(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/.test(line)
            const isTokenDerivedColor =
              pattern === rawColorLiteral &&
              match[0] === "color-mix(" &&
              tokenDerivedColorFiles.has(relativeFile)

            if (isEmbeddedBrandColor || isTokenDerivedColor) continue

            violations.push(
              `${relativeFile}:${index + 1} ${match[0]}`,
            )
          }
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found colors outside the explicit application token contract:\n${violations.join("\n")}`,
    )
  })

  test("the token vocabulary stays semantic and compact", async () => {
    const appDir = appPath(".")
    const source = await readFile(
      join(appDir, "src/shared/styles/design-tokens.css"),
      "utf8",
    )
    const forbiddenToken =
      /--(?:brand-|theme-preview-|database-collaborator-|primitive-|editor-[a-z]+-(?:swatch|background|variant-[0-9]+)|(?:accent|backdrop|background|border|destructive|foreground|input|muted|muted-foreground|popover|primary|primary-foreground|ring|scrim|secondary|selection|sidebar-accent|sidebar-foreground|surface-inverse)-[0-9]+)\b/g

    assert.deepEqual(
      [...source.matchAll(forbiddenToken)].map((match) => match[0]),
      [],
      "Found duplicated, brand-specific, or numbered opacity tokens",
    )
  })

  test("duplicate role colors are aliases, not extra values", async () => {
    const appDir = appPath(".")
    const source = await readFile(
      join(appDir, "src/shared/styles/design-tokens.css"),
      "utf8",
    )
    const themeSource = source.slice(0, source.indexOf("@theme inline"))
    const retired = [
      "--card-foreground",
      "--popover-foreground",
      "--muted:",
      "--active-foreground",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-accent",
      "--sidebar-border",
      "--sidebar-ring",
      "--control-knob",
      "--collaborator-",
      "--chart-1",
      "--database-selection-accent",
      "--desktop-tab-border",
      "--favicon-foreground",
      "--transparent-color",
    ]
    const found = retired.filter((token) => themeSource.includes(token))

    assert.deepEqual(found, [], "Found retired duplicate color tokens")
    assert.match(source, /--color-muted: var\(--secondary\)/)
    assert.match(source, /--color-card-foreground: var\(--foreground\)/)
    assert.match(source, /--color-active-foreground: var\(--accent-foreground\)/)
    assert.match(source, /--color-sidebar: var\(--sidebar\)/)
    assert.doesNotMatch(source, /--color-sidebar-accent:/)
  })

  test("focus and database selection derive from the primary action color", async () => {
    const appDir = appPath(".")
    const tokens = await readFile(
      join(appDir, "src/shared/styles/design-tokens.css"),
      "utf8",
    )
    const editorStyles = await readFile(
      join(appDir, "src/features/editor/styles.css"),
      "utf8",
    )

    assert.match(tokens, /--ring:\s*var\(--action-primary\)/)
    assert.match(
      tokens,
      /--selection-focus-ring:\s*color-mix\([\s\S]*?var\(--action-primary\)/,
    )
    assert.match(
      editorStyles,
      /--database-selection-color:\s*var\(--action-primary\)/,
    )
  })
}

async function sourceFiles(directory) {
  const files = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)))
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(path)
    }
  }

  return files
}
