import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages";

const PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY = "zilobase:published:embeddedItemsOpenAs";

export { isPublishedFallbackPage } from "@zilobase/features/pages";

export function readPublishedEmbeddedItemsOpenAs(): EmbeddedItemsOpenAs {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY) === "dialog"
      ? "dialog"
      : "sidepanel";
  } catch {
    return "sidepanel";
  }
}

export function writePublishedEmbeddedItemsOpenAs(mode: EmbeddedItemsOpenAs) {
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(PUBLISHED_EMBEDDED_ITEMS_OPEN_AS_KEY, mode);
  } catch {}
}
