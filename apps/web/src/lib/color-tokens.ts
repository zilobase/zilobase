export type ColorTokenId =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red"

type PaletteEntry = {
  name: string
  textClass: string
  backgroundClass: string
  swatchClass: string
}

// Values live in design-tokens.css; this file only maps editor concepts to utilities.
export const PALETTE: Record<ColorTokenId, PaletteEntry> = {
  gray: {
    name: "Gray",
    textClass: "text-editor-gray",
    backgroundClass: "bg-editor-gray-surface",
    swatchClass: "bg-editor-gray",
  },
  brown: {
    name: "Brown",
    textClass: "text-editor-brown",
    backgroundClass: "bg-editor-brown-surface",
    swatchClass: "bg-editor-brown",
  },
  orange: {
    name: "Orange",
    textClass: "text-editor-orange",
    backgroundClass: "bg-editor-orange-surface",
    swatchClass: "bg-editor-orange",
  },
  yellow: {
    name: "Yellow",
    textClass: "text-editor-yellow",
    backgroundClass: "bg-editor-yellow-surface",
    swatchClass: "bg-editor-yellow",
  },
  green: {
    name: "Green",
    textClass: "text-editor-green",
    backgroundClass: "bg-editor-green-surface",
    swatchClass: "bg-editor-green",
  },
  blue: {
    name: "Blue",
    textClass: "text-editor-blue",
    backgroundClass: "bg-editor-blue-surface",
    swatchClass: "bg-editor-blue",
  },
  purple: {
    name: "Purple",
    textClass: "text-editor-purple",
    backgroundClass: "bg-editor-purple-surface",
    swatchClass: "bg-editor-purple",
  },
  pink: {
    name: "Pink",
    textClass: "text-editor-pink",
    backgroundClass: "bg-editor-pink-surface",
    swatchClass: "bg-editor-pink",
  },
  red: {
    name: "Red",
    textClass: "text-editor-red",
    backgroundClass: "bg-editor-red-surface",
    swatchClass: "bg-editor-red",
  },
}

const isPaletteColor = (value: string): value is ColorTokenId => value in PALETTE
const SOLID_FG = "text-editor-color-foreground"

export type ColorToken = {
  name: string
  value: string | null
  textClass: string
  backgroundClass: string
  swatchClass: string
  dotClass: string
  solidClass: string
}

export const colorTokens: ColorToken[] = [
  {
    name: "Default",
    value: null,
    textClass: "text-foreground",
    backgroundClass: "bg-background",
    swatchClass: "bg-background",
    dotClass: "text-muted-foreground",
    solidClass: "bg-muted text-muted-foreground",
  },
  ...(Object.entries(PALETTE) as [ColorTokenId, PaletteEntry][]).map(([id, entry]) => ({
    name: entry.name,
    value: id,
    textClass: entry.textClass,
    backgroundClass: entry.backgroundClass,
    swatchClass: entry.swatchClass,
    dotClass: SOLID_FG,
    solidClass: `${entry.backgroundClass} ${SOLID_FG}`,
  })),
]

export const cyclingColorTokens = colorTokens.filter((token) => token.value)

export const collaboratorColorIds = [
  "blue",
  "purple",
  "pink",
  "orange",
  "green",
  "yellow",
  "red",
  "brown",
] as const satisfies readonly ColorTokenId[]

export const iconColorOptions = colorTokens.map((token) => ({
  name: token.name,
  value: token.value ?? "default",
  textClass: token.textClass,
  backgroundClass: token.backgroundClass,
  solidClass: token.solidClass,
}))

export function getPaletteColor(color?: string | null) {
  if (!color || color === "default" || !isPaletteColor(color)) {
    return null
  }

  return `var(--editor-${color})`
}

export function getColorToken(color?: string | null) {
  if (!color || color === "default") {
    return colorTokens[0]
  }

  const normalizedColor = color.toLowerCase()

  return (
    colorTokens.find(
      (token) =>
        token.value === normalizedColor ||
        token.name.toLowerCase() === normalizedColor,
    ) ?? colorTokens[0]
  )
}

export function getColorTokenValue(color?: string | null) {
  return getColorToken(color).value ?? "default"
}

export function getIconSolidClassName(colorValue?: string | null) {
  return getColorToken(colorValue === "default" ? null : colorValue).solidClass
}

export function getIconTextClassName(colorValue?: string | null) {
  return getColorToken(colorValue === "default" ? null : colorValue).textClass
}

export function isPaletteColorActive(
  stored: string | null | undefined,
  tokenValue: string | null,
) {
  if (!tokenValue) {
    return !stored
  }

  if (!stored) {
    return false
  }

  const expected = getPaletteColor(tokenValue)

  return stored === tokenValue || stored === expected
}

export function getColorTokenBadgeClassName(color?: string | null) {
  const token = getColorToken(color)
  const textClass = token.value ? token.dotClass : "text-foreground"

  return `database-select-badge ${textClass} ${token.backgroundClass}`
}

export function getColorTokenDotClassName(color?: string | null) {
  return `database-select-badge-dot ${getColorToken(color).dotClass}`
}

export function colorWithAlpha(color?: string | null, alpha = 1) {
  const normalizedColor = color?.toLowerCase()

  if (
    !normalizedColor ||
    !isPaletteColor(normalizedColor) ||
    Math.round(alpha * 100) !== 18
  ) {
    return null
  }

  return `color-mix(in oklab, var(--editor-${normalizedColor}) 18%, transparent)`
}
