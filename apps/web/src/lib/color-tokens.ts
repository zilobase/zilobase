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
}

// Values live in design-tokens.css; this file only maps editor concepts to utilities.
export const PALETTE: Record<ColorTokenId, PaletteEntry> = {
  gray: {
    name: "Gray",
    textClass: "text-editor-gray",
    backgroundClass: "bg-editor-gray-solid",
  },
  brown: {
    name: "Brown",
    textClass: "text-editor-brown",
    backgroundClass: "bg-editor-brown-solid",
  },
  orange: {
    name: "Orange",
    textClass: "text-editor-orange",
    backgroundClass: "bg-editor-orange-solid",
  },
  yellow: {
    name: "Yellow",
    textClass: "text-editor-yellow",
    backgroundClass: "bg-editor-yellow-solid",
  },
  green: {
    name: "Green",
    textClass: "text-editor-green",
    backgroundClass: "bg-editor-green-solid",
  },
  blue: {
    name: "Blue",
    textClass: "text-editor-blue",
    backgroundClass: "bg-editor-blue-solid",
  },
  purple: {
    name: "Purple",
    textClass: "text-editor-purple",
    backgroundClass: "bg-editor-purple-solid",
  },
  pink: {
    name: "Pink",
    textClass: "text-editor-pink",
    backgroundClass: "bg-editor-pink-solid",
  },
  red: {
    name: "Red",
    textClass: "text-editor-red",
    backgroundClass: "bg-editor-red-solid",
  },
}

const SOLID_FG = "text-editor-color-foreground"

const isPaletteColor = (value: string): value is ColorTokenId => value in PALETTE

export type ColorToken = {
  name: string
  value: string | null
  textClass: string
  backgroundClass: string
  dotClass: string
  solidClass: string
}

export const colorTokens: ColorToken[] = [
  {
    name: "Default",
    value: null,
    textClass: "text-foreground",
    backgroundClass: "bg-background",
    dotClass: "text-muted-foreground",
    solidClass: "bg-muted text-muted-foreground",
  },
  ...(Object.entries(PALETTE) as [ColorTokenId, PaletteEntry][]).map(([id, entry]) => ({
    name: entry.name,
    value: id,
    textClass: entry.textClass,
    backgroundClass: entry.backgroundClass,
    dotClass: SOLID_FG,
    solidClass: `${entry.backgroundClass} ${SOLID_FG}`,
  })),
]

export const cyclingColorTokens = colorTokens.filter((token) => token.value)

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
  const textClass = token.value ? SOLID_FG : "text-foreground"

  return `database-select-badge ${textClass} ${token.backgroundClass}`
}

export function getColorTokenDotClassName(color?: string | null) {
  return `database-select-badge-dot ${getColorToken(color).dotClass}`
}

export function colorWithAlpha(color?: string | null, alpha = 1) {
  const source = getPaletteColor(color)

  if (!source) {
    return null
  }

  return `color-mix(in oklab, ${source} ${Math.round(alpha * 100)}%, transparent)`
}
