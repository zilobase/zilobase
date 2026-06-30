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
  light: string
  dark: string
  textClass: string
  backgroundClass: string
}

// ponytail: one palette, one file — edit colors here only
export const PALETTE: Record<ColorTokenId, PaletteEntry> = {
  gray: {
    name: "Gray",
    light: "zinc-500",
    dark: "zinc-600",
    textClass: "text-zinc-500 dark:text-zinc-600",
    backgroundClass: "bg-zinc-500 dark:bg-zinc-600",
  },
  brown: {
    name: "Brown",
    light: "stone-500",
    dark: "stone-600",
    textClass: "text-stone-500 dark:text-stone-600",
    backgroundClass: "bg-stone-500 dark:bg-stone-600",
  },
  orange: {
    name: "Orange",
    light: "orange-500",
    dark: "orange-700",
    textClass: "text-orange-500 dark:text-orange-700",
    backgroundClass: "bg-orange-500 dark:bg-orange-700",
  },
  yellow: {
    name: "Yellow",
    light: "yellow-500",
    dark: "yellow-500",
    textClass: "text-yellow-500 dark:text-yellow-500",
    backgroundClass: "bg-yellow-500 dark:bg-yellow-500",
  },
  green: {
    name: "Green",
    light: "emerald-500",
    dark: "emerald-700",
    textClass: "text-emerald-500 dark:text-emerald-700",
    backgroundClass: "bg-emerald-500 dark:bg-emerald-700",
  },
  blue: {
    name: "Blue",
    light: "sky-500",
    dark: "sky-700",
    textClass: "text-sky-500 dark:text-sky-700",
    backgroundClass: "bg-sky-500 dark:bg-sky-700",
  },
  purple: {
    name: "Purple",
    light: "violet-500",
    dark: "violet-700",
    textClass: "text-violet-500 dark:text-violet-700",
    backgroundClass: "bg-violet-500 dark:bg-violet-700",
  },
  pink: {
    name: "Pink",
    light: "pink-500",
    dark: "pink-700",
    textClass: "text-pink-500 dark:text-pink-700",
    backgroundClass: "bg-pink-500 dark:bg-pink-700",
  },
  red: {
    name: "Red",
    light: "red-500",
    dark: "red-700",
    textClass: "text-red-500 dark:text-red-700",
    backgroundClass: "bg-red-500 dark:bg-red-700",
  },
}

const SOLID_FG = "text-white dark:text-foreground"

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
}))

export function getPaletteColor(color?: string | null) {
  if (!color || color === "default" || !isPaletteColor(color)) {
    return null
  }

  const entry = PALETTE[color]

  return `light-dark(var(--color-${entry.light}), var(--color-${entry.dark}))`
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

export function getIconColorClassName(colorValue?: string | null) {
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