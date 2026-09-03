type RgbaColor = {
  alpha: number
  blue: number
  green: number
  red: number
}

const MIN_TEXT_CONTRAST = 4.5
const correctedColors = new WeakMap<HTMLElement, { priority: string; value: string }>()

export function applyMailDocumentTheme(
  document: Document,
  theme: { backgroundColor: string; textColor: string },
) {
  const view = document.defaultView
  const background = parseCssColor(theme.backgroundColor)
  const fallbackText = parseCssColor(theme.textColor)
  if (!view || !background || !fallbackText) return

  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    const original = correctedColors.get(element)
    if (!original) continue
    if (original.value) element.style.setProperty("color", original.value, original.priority)
    else element.style.removeProperty("color")
    correctedColors.delete(element)
  }

  document.documentElement.style.setProperty("background-color", theme.backgroundColor, "important")
  document.body.style.setProperty("background-color", theme.backgroundColor, "important")
  document.body.style.setProperty("color", theme.textColor, "important")

  const elements = [document.body, ...document.body.querySelectorAll<HTMLElement>("*")]
  for (const element of elements) {
    if (!hasDirectText(element)) continue

    const backgroundResult = effectiveBackground(view, element, background)
    if (backgroundResult.hasImage) continue

    const text = parseCssColor(view.getComputedStyle(element).color)
    if (!text) continue

    const renderedText = composite(text, backgroundResult.color)
    const textContrast = contrastRatio(renderedText, backgroundResult.color)
    if (textContrast >= MIN_TEXT_CONTRAST) continue

    const renderedFallback = composite(fallbackText, backgroundResult.color)
    if (contrastRatio(renderedFallback, backgroundResult.color) <= textContrast) continue

    correctedColors.set(element, {
      priority: element.style.getPropertyPriority("color"),
      value: element.style.getPropertyValue("color"),
    })
    element.style.setProperty("color", theme.textColor, "important")
  }
}

function effectiveBackground(view: Window, element: HTMLElement, base: RgbaColor) {
  const ancestors: HTMLElement[] = []
  let current: HTMLElement | null = element
  while (current) {
    ancestors.push(current)
    current = current.parentElement
  }

  let color = base
  let hasImage = false
  for (const ancestor of ancestors.reverse()) {
    const style = view.getComputedStyle(ancestor)
    if (style.backgroundImage && style.backgroundImage !== "none") hasImage = true
    const layer = parseCssColor(style.backgroundColor)
    if (layer && layer.alpha > 0) color = composite(layer, color)
  }
  return { color, hasImage }
}

function hasDirectText(element: HTMLElement) {
  return [...element.childNodes].some(
    (node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
  )
}

function parseCssColor(value: string): RgbaColor | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === "transparent") return { alpha: 0, blue: 0, green: 0, red: 0 }

  const hex = normalized.match(/^#([\da-f]{3,8})$/i)?.[1]
  if (hex) {
    const expanded = hex.length === 3 || hex.length === 4
      ? [...hex].map((character) => character.repeat(2)).join("")
      : hex
    if (expanded.length === 6 || expanded.length === 8) {
      return {
        red: Number.parseInt(expanded.slice(0, 2), 16),
        green: Number.parseInt(expanded.slice(2, 4), 16),
        blue: Number.parseInt(expanded.slice(4, 6), 16),
        alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
      }
    }
  }

  const functional = normalized.match(/^rgba?\((.*)\)$/)?.[1]
  if (!functional) return null
  const [channels, slashAlpha] = functional.split("/").map((part) => part.trim())
  const parts = channels.includes(",")
    ? channels.split(",").map((part) => part.trim())
    : channels.split(/\s+/)
  if (parts.length < 3) return null

  const red = parseChannel(parts[0])
  const green = parseChannel(parts[1])
  const blue = parseChannel(parts[2])
  const alpha = parseAlpha(slashAlpha ?? parts[3] ?? "1")
  if ([red, green, blue, alpha].some((channel) => Number.isNaN(channel))) return null
  return { alpha, blue, green, red }
}

function parseChannel(value: string) {
  return value.endsWith("%")
    ? Math.max(0, Math.min(255, Number.parseFloat(value) * 2.55))
    : Math.max(0, Math.min(255, Number.parseFloat(value)))
}

function parseAlpha(value: string) {
  return value.endsWith("%")
    ? Math.max(0, Math.min(1, Number.parseFloat(value) / 100))
    : Math.max(0, Math.min(1, Number.parseFloat(value)))
}

function composite(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha)
  if (alpha === 0) return { alpha: 0, blue: 0, green: 0, red: 0 }
  return {
    alpha,
    red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
    green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
    blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
  }
}

function contrastRatio(first: RgbaColor, second: RgbaColor) {
  const firstLuminance = luminance(first)
  const secondLuminance = luminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function luminance(color: RgbaColor) {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue)
}
