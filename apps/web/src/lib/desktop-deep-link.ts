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

export function buildDesktopAuthDeepLink(token: string, path: string) {
  const url = new URL(
    import.meta.env.DEV
      ? "http://127.0.0.1:1422/auth"
      : "zilobase://auth",
  )
  url.searchParams.set("token", token)
  url.searchParams.set("path", normalizeAppPath(path) ?? "/dashboard")
  return url.toString()
}

export function getDesktopAuthDeepLink(value: string) {
  try {
    const url = new URL(value)
    const token = url.searchParams.get("token")
    if (
      url.protocol !== "zilobase:" ||
      url.hostname !== "auth" ||
      !token ||
      token.length > 512
    ) {
      return null
    }

    return {
      path: normalizeAppPath(url.searchParams.get("path")) ?? "/dashboard",
      token,
    }
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
