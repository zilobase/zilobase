export type NavItemKind = "page" | "database";

export type ItemRef = {
  id: string;
  kind: NavItemKind;
};

export type EmbeddedItemsOpenAs = "dialog" | "sidepanel";

export type PageIconPosition = "inline" | "top";

export type PageMetadata = {
  cover?: string | null;
  emoji?: string | null;
  embeddedItemsOpenAs?: EmbeddedItemsOpenAs | null;
  fullWidth?: boolean | null;
  iconPosition?: PageIconPosition | null;
  locked?: boolean | null;
  meetingLocked?: boolean | null;
  zilobaseai?: "instruction" | "skill" | null;
  useUserEmbeddedItemsPreference?: boolean | null;
  useUserFullWidthPreference?: boolean | null;
};

export function isPageLocked(
  page: { metadata?: PageMetadata | null } | null | undefined,
) {
  return page?.metadata?.locked === true;
}

export function isMeetingLocked(
  page: { metadata?: PageMetadata | null } | null | undefined,
) {
  return page?.metadata?.meetingLocked === true;
}

export function readMetadataRecord(metadata: unknown): PageMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as PageMetadata;
}

export function itemRefKey(ref: ItemRef) {
  return `${ref.kind}:${ref.id}`;
}
