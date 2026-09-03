export function getPageId(pathname: string) {
  return getRouteItemId(pathname, "p")
}

export function getDatabaseId(pathname: string) {
  return getRouteItemId(pathname, "d")
}

export function getMeetingId(pathname: string) {
  return getRouteItemId(pathname, "m")
}

function getRouteItemId(pathname: string, prefix: "d" | "m" | "p") {
  const match = pathname.match(new RegExp(`^/${prefix}/([^/]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}
