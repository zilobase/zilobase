import {
  getStoredIconColor,
  isSvgIcon,
  normalizeStoredIconPresentation,
  sanitizeStoredSvg,
} from "@/lib/page-icon-utils"

export type LibraryFaviconView =
  | "favourites"
  | "private"
  | "recents"
  | "shared"
  | "teamspaces"

const routeIcons: Array<[matches: (pathname: string) => boolean, icon: string]> = [
  [(pathname) => pathname === "/trash", "🗑️"],
  [(pathname) => pathname === "/ai", "✨"],
  [(pathname) => pathname === "/canvas", "🎨"],
  [(pathname) => pathname.startsWith("/settings"), "⚙️"],
  [(pathname) => pathname.startsWith("/m/"), "🎙️"],
  [(pathname) => pathname.startsWith("/d/"), "🗃️"],
  [(pathname) => pathname.startsWith("/p/"), "📄"],
]

const libraryIcons: Record<LibraryFaviconView, string> = {
  favourites: "⭐",
  private: "🔒",
  recents: "🕘",
  shared: "👥",
  teamspaces: "🏢",
}

export function getRouteFaviconIcon({
  itemIcon,
  libraryView,
  pathname,
}: {
  itemIcon?: string | null
  libraryView?: string | null
  pathname: string
}) {
  if (itemIcon) return itemIcon

  if (pathname === "/recents") {
    return libraryIcons[normalizeLibraryView(libraryView)]
  }

  return routeIcons.find(([matches]) => matches(pathname))?.[1] ?? null
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

  return paletteColor || getCssVariable("--favicon-foreground").trim()
}

function normalizeLibraryView(value?: string | null): LibraryFaviconView {
  return value === "favourites" ||
    value === "private" ||
    value === "shared" ||
    value === "teamspaces"
    ? value
    : "recents"
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
