import {
  getStoredIconColor,
  isSvgIcon,
  normalizeStoredIconPresentation,
  sanitizeStoredSvg,
} from "@/shared/lib/page-icon-utils"

export const DEFAULT_DOCUMENT_TITLE = "Zilobase"

export function getRouteFaviconIcon({
  itemIcon,
  pathname,
}: {
  itemIcon?: string | null
  pathname: string
}) {
  return isItemRoute(pathname) ? itemIcon ?? null : null
}

export function getRouteDocumentTitle({
  itemTitle,
  pathname,
}: {
  itemTitle?: string | null
  pathname: string
}) {
  const title = itemTitle?.trim()
  return isItemRoute(pathname) && title
    ? `${title} | ${DEFAULT_DOCUMENT_TITLE}`
    : DEFAULT_DOCUMENT_TITLE
}

export function createFaviconHref(
  icon: string,
  options: {
    color?: string
  } = {},
) {
  const svg = isSvgIcon(icon)
    ? prepareStoredSvg(icon, options.color)
    : createEmojiSvg(icon)

  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null
}

export function getFaviconColor(
  icon: string,
  getCssVariable: (name: string) => string,
) {
  if (!isSvgIcon(icon)) return undefined

  const color = getStoredIconColor(icon)
  const paletteColor =
    color === "default" ? "" : getCssVariable(`--editor-${color}`).trim()

  return paletteColor || getCssVariable("--foreground").trim()
}

function isItemRoute(pathname: string) {
  return /^\/(?:p|d|m)\/[^/]+/.test(pathname)
}

function createEmojiSvg(icon: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="23" font-size="24" text-anchor="middle">${escapeXml(icon)}</text></svg>`
}

function prepareStoredSvg(icon: string, color?: string) {
  const sanitized = normalizeStoredIconPresentation(sanitizeStoredSvg(icon))

  if (!sanitized) return null

  const attributes = ` width="32" height="32"${color ? ` color="${escapeXml(color)}"` : ""}`

  return sanitized
    .replace(/\swidth=("[^"]*"|'[^']*')/i, "")
    .replace(/\sheight=("[^"]*"|'[^']*')/i, "")
    .replace(/<svg\b/i, `<svg${attributes}`)
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
