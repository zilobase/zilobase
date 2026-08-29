import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const sourceExtensions = new Set([".css", ".html", ".ts", ".tsx"])
const colorUtilities =
  "accent|bg|border|caret|decoration|divide|fill|from|outline|placeholder|ring|shadow|stroke|text|to|via"
const tailwindPalette =
  "amber|black|blue|cyan|emerald|fuchsia|gray|green|indigo|lime|neutral|orange|pink|purple|red|rose|sky|slate|stone|teal|violet|white|yellow|zinc"
const rawColor = /#[0-9a-f]{3,8}(?![0-9a-f])|\b(?:color-mix|hsla?|lab|lch|oklab|oklch|rgba?)\(/gi
const paletteUtility = new RegExp(
  `(?<![a-z0-9-])(?:${colorUtilities})-(?:${tailwindPalette})(?:-[0-9]{2,3})?(?:/[0-9]{1,3})?\\b`,
  "g",
)
const opacityColorUtility = new RegExp(
  `(?<![a-z0-9-])(?:${colorUtilities})-[a-z][a-z0-9-]*/[0-9]{1,3}\\b`,
  "g",
)
const systemColor = /\[(?:Canvas|CanvasText|Highlight|HighlightText)\]/g
const literalExceptions = new Set([
  "src/shared/components/google-icon.tsx",
  "src/features/editor/extensions/embed-block.tsx",
  "src/shared/styles/typeset.css",
])
const legacyVariables = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "sidebar",
  "sidebar-item-foreground",
  "accent",
  "accent-foreground",
  "active",
  "active-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "action-primary-foreground",
  "selection-focus-ring",
  "editor-selection-overlay",
  "database-selection-row",
  "timeline-grid-border",
  "timeline-bar-background",
  "timeline-bar-foreground",
  "media-canvas",
  "data-label-foreground",
]
const legacyVariablePattern = new RegExp(
  `--(?:${legacyVariables.join("|")}|status-[a-z-]+|editor-(?:gray|brown|orange|yellow|green|blue|purple|pink|red)(?:-surface)?)(?=\\s*[:,)])`,
  "g",
)
const legacyUtilityPattern = new RegExp(
  `(?<![a-z0-9-])(?:${colorUtilities})-(?:background|foreground|card(?:-foreground)?|popover(?:-foreground)?|primary(?:-foreground|-subtle)?|secondary(?:-foreground|-hover)?|muted(?:-foreground)?|sidebar(?:-item-foreground|-control-hover)?|accent(?:-foreground)?|active(?:-foreground)?|destructive(?:-foreground)?|input|status-[a-z-]+|editor-[a-z-]+)\\b`,
  "g",
)

export function register({ appPath, assert, test }) {
  test("literal color exceptions are documented with an owner and reason", async () => {
    const exceptions = JSON.parse(
      await readFile(
        join(appPath("."), "src/shared/styles/color-exceptions.json"),
        "utf8",
      ),
    )
    const documentedWebSourceFiles = new Set(
      exceptions
        .filter(({ path }) => path.startsWith("apps/web/src/"))
        .map(({ path }) => path.replace("apps/web/", "")),
    )

    assert.deepEqual(documentedWebSourceFiles, literalExceptions)
    assert.ok(
      exceptions.every(({ owner, path, reason }) => owner && path && reason),
      "Every literal exception must document its path, owner, and reason",
    )
  })

  test("UI colors resolve through the canonical application contract", async () => {
    const appDir = appPath(".")
    const files = [join(appDir, "index.html"), ...(await sourceFiles(join(appDir, "src")))]
    const violations = []

    for (const file of files) {
      const relativeFile = relative(appDir, file)
      if (relativeFile === "src/shared/styles/color-tokens.css") continue
      const source = await readFile(file, "utf8")

      for (const [lineIndex, line] of source.split("\n").entries()) {
        for (const pattern of [rawColor, paletteUtility, opacityColorUtility, systemColor]) {
          pattern.lastIndex = 0
          for (const match of line.matchAll(pattern)) {
            if (pattern === rawColor && literalExceptions.has(relativeFile)) continue
            violations.push(`${relativeFile}:${lineIndex + 1} ${match[0]}`)
          }
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found colors outside color-tokens.css or the documented asset allowlist:\n${violations.join("\n")}`,
    )
  })

  test("legacy variables and utilities cannot be reintroduced", async () => {
    const appDir = appPath(".")
    const files = [join(appDir, "index.html"), ...(await sourceFiles(join(appDir, "src")))]
    const violations = []

    for (const file of files) {
      const source = await readFile(file, "utf8")
      const relativeFile = relative(appDir, file)
      for (const pattern of [legacyVariablePattern, legacyUtilityPattern]) {
        pattern.lastIndex = 0
        for (const match of source.matchAll(pattern)) {
          violations.push(`${relativeFile} ${match[0]}`)
        }
      }
    }

    assert.deepEqual(violations, [], `Found retired color API:\n${violations.join("\n")}`)
  })

  test("every public alias points to one declared canonical token", async () => {
    const css = await readFile(
      join(appPath("."), "src/shared/styles/color-tokens.css"),
      "utf8",
    )
    const canonical = new Set(
      [...css.matchAll(/(--zb-color-[a-z0-9-]+):/g)].map((match) => match[1]),
    )
    const themeBlock = css.slice(css.indexOf("@theme inline"))
    const aliases = [...themeBlock.matchAll(/(--color-[a-z0-9-]+):\s*var\((--zb-color-[a-z0-9-]+)\);/g)]
    const publicDeclarations = [
      ...themeBlock.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g),
    ]
    const aliasNames = aliases.map((match) => match[1])

    assert.ok(aliases.length > 0)
    assert.equal(new Set(aliasNames).size, aliasNames.length, "Aliases must be unique")
    assert.deepEqual(
      aliases.filter((match) => !canonical.has(match[2])).map((match) => match[0]),
      [],
      "Aliases must not reference undefined canonical tokens",
    )
    assert.deepEqual(
      publicDeclarations
        .filter((match) => !/^var\(--zb-color-[a-z0-9-]+\)$/.test(match[2]))
        .map((match) => match[0]),
      [],
      "Public aliases must be a direct one-to-one mapping",
    )
  })

  test("canonical references are defined and acyclic", async () => {
    const css = await readFile(
      join(appPath("."), "src/shared/styles/color-tokens.css"),
      "utf8",
    )
    const declarations = new Map(
      [...css.matchAll(/(--zb-color-[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [
        match[1],
        match[2],
      ]),
    )

    for (const [name, value] of declarations) {
      for (const reference of value.matchAll(/var\((--zb-color-[a-z0-9-]+)\)/g)) {
        assert.ok(declarations.has(reference[1]), `${name} references missing ${reference[1]}`)
      }
      visit(name, declarations, new Set())
    }
  })
}

function visit(name, declarations, active) {
  if (active.has(name)) throw new Error(`Color token cycle at ${name}`)
  active.add(name)
  const value = declarations.get(name) ?? ""
  for (const reference of value.matchAll(/var\((--zb-color-[a-z0-9-]+)\)/g)) {
    visit(reference[1], declarations, new Set(active))
  }
}

async function sourceFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)))
    else if (sourceExtensions.has(extname(entry.name))) files.push(file)
  }
  return files
}
