import type { EmbeddedItemsOpenAs, Page } from "@notelab/features/pages"

const PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY =
  "notelab:published:embeddedItemsOpenAs"

export function isPublishedFallbackPage(page: Page | null | undefined) {
  return Boolean(page?.publishedOwnerPreferences)
}

export function readPublishedEmbeddedItemsOpenAs(): EmbeddedItemsOpenAs {
  if (typeof window === "undefined") {
    return "sidepanel"
  }

  try {
    return window.localStorage.getItem(PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY) ===
      "dialog"
      ? "dialog"
      : "sidepanel"
  } catch {
    return "sidepanel"
  }
}

export function writePublishedEmbeddedItemsOpenAs(mode: EmbeddedItemsOpenAs) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY, mode)
  } catch {
    // The in-memory preference still applies when browser storage is blocked.
  }
}
