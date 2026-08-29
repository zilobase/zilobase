export function isEmbeddedMobileViewer() {
  if (typeof window === "undefined") {
    return false
  }

  const search = new URLSearchParams(window.location.search)

  return search.get("mobileViewer") === "1"
}
