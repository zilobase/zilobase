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

// Values live in color-tokens.css; this file maps persisted IDs to shared utilities.
export const PALETTE: Record<ColorTokenId, PaletteEntry> = {
  gray: {
    name: "Gray",
    textClass: "text-palette-gray",
    backgroundClass: "bg-palette-gray-subtle",
    swatchClass: "bg-palette-gray",
  },
  brown: {
    name: "Brown",
    textClass: "text-palette-brown",
    backgroundClass: "bg-palette-brown-subtle",
    swatchClass: "bg-palette-brown",
  },
  orange: {
    name: "Orange",
    textClass: "text-palette-orange",
    backgroundClass: "bg-palette-orange-subtle",
    swatchClass: "bg-palette-orange",
  },
  yellow: {
    name: "Yellow",
    textClass: "text-palette-yellow",
    backgroundClass: "bg-palette-yellow-subtle",
    swatchClass: "bg-palette-yellow",
  },
  green: {
    name: "Green",
    textClass: "text-palette-green",
    backgroundClass: "bg-palette-green-subtle",
    swatchClass: "bg-palette-green",
  },
  blue: {
    name: "Blue",
    textClass: "text-palette-blue",
    backgroundClass: "bg-palette-blue-subtle",
    swatchClass: "bg-palette-blue",
  },
  purple: {
    name: "Purple",
    textClass: "text-palette-purple",
    backgroundClass: "bg-palette-purple-subtle",
    swatchClass: "bg-palette-purple",
  },
  pink: {
    name: "Pink",
    textClass: "text-palette-pink",
    backgroundClass: "bg-palette-pink-subtle",
    swatchClass: "bg-palette-pink",
  },
  red: {
    name: "Red",
    textClass: "text-palette-red",
    backgroundClass: "bg-palette-red-subtle",
    swatchClass: "bg-palette-red",
  },
}

const isPaletteColor = (value: string): value is ColorTokenId => value in PALETTE
const SOLID_FG = "text-palette-on-subtle"

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
    textClass: "text-content-primary",
    backgroundClass: "bg-surface-canvas",
    swatchClass: "bg-surface-canvas",
    dotClass: "text-content-secondary",
    solidClass: "bg-surface-muted text-content-secondary",
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

  return `var(--zb-color-palette-text-${color})`
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
  const textClass = token.value ? token.dotClass : "text-content-primary"

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

  return `var(--zb-color-palette-background-${normalizedColor}-subtle)`
}
