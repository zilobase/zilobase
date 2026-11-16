import { buildLucideStoredSvg } from "@/components/ui/icon-svg";

// Exact Lucide drawings. These remain stored SVG strings because the same
// fallbacks are also used in document metadata and favicons.
function buildLucideFallbackIcon(markup: string) {
  return buildLucideStoredSvg({ color: "gray", markup });
}

const PAGE_OUTLINE =
  '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path>';

export const DEFAULT_PAGE_ITEM_ICON = buildLucideFallbackIcon(PAGE_OUTLINE);

export const CONTENT_PAGE_ITEM_ICON = buildLucideFallbackIcon(
  `${PAGE_OUTLINE}<path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>`,
);

export const DEFAULT_DATABASE_ITEM_ICON = buildLucideFallbackIcon(
  '<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path>',
);

export const DEFAULT_MEETING_ITEM_ICON = buildLucideFallbackIcon(
  '<path d="M8 2v3"></path><path d="M16 2v3"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M8 13h.01"></path><path d="M12 13h.01"></path><path d="M16 13h.01"></path><path d="M8 17h.01"></path><path d="M12 17h.01"></path><path d="M16 17h.01"></path>',
);
