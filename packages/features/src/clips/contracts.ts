export const CLIP_CAPTURE_MODES = [
  "article",
  "page",
  "selection",
  "bookmark",
  "highlights",
] as const;

export type ClipCaptureMode = (typeof CLIP_CAPTURE_MODES)[number];

export const CLIP_DUPLICATE_STRATEGIES = ["create", "reject", "open-existing"] as const;

export type ClipDuplicateStrategy = (typeof CLIP_DUPLICATE_STRATEGIES)[number];

export type ClipPropertyValue = {
  propertyId: string;
  value: unknown;
};

export type CreateClipRequest = {
  workspaceId: string;
  parentPageId?: string | null;
  databaseId?: string | null;
  teamspaceId?: string | null;
  title: string;
  sourceUrl: string;
  canonicalUrl?: string | null;
  captureMode: ClipCaptureMode;
  note?: string | null;
  html?: string | null;
  content?: unknown | null;
  metadata?: {
    author?: string | null;
    published?: string | null;
    description?: string | null;
    image?: string | null;
    favicon?: string | null;
    site?: string | null;
  };
  propertyValues?: ClipPropertyValue[];
  duplicateStrategy?: ClipDuplicateStrategy;
};

export type CreateClipResponse = {
  pageId: string;
  databaseRowId?: string;
  url: string;
  duplicateOf?: string;
};

export type ClipDuplicateRecord = {
  pageId: string;
  title: string;
  url: string;
};

export function isClipCaptureMode(value: unknown): value is ClipCaptureMode {
  return typeof value === "string" && (CLIP_CAPTURE_MODES as readonly string[]).includes(value);
}

export function isClipDuplicateStrategy(value: unknown): value is ClipDuplicateStrategy {
  return (
    typeof value === "string" && (CLIP_DUPLICATE_STRATEGIES as readonly string[]).includes(value)
  );
}
