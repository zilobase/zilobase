const DESKTOP_DEEP_LINK = "zilobase://open"

export function buildDesktopDeepLink(path: string) {
  const url = new URL(DESKTOP_DEEP_LINK)
  url.searchParams.set("path", normalizeAppPath(path) ?? "/")
  return url.toString()
}

export function getDesktopDeepLinkPath(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "zilobase:" || url.hostname !== "open") return null
    return normalizeAppPath(url.searchParams.get("path"))
  } catch {
    return null
  }
}

function normalizeAppPath(path: string | null) {
  if (!path?.startsWith("/") || path.startsWith("//")) return null

  const url = new URL(path, "https://app.zilobase.com")
  if (url.origin !== "https://app.zilobase.com") return null

  return `${url.pathname}${url.search}${url.hash}`
}
