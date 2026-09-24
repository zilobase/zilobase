export function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readPositiveInteger(value: unknown) {
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

export function normalizeContentType(value: string | undefined) {
  return value?.split(";")[0]?.trim().toLowerCase();
}

export function sanitizeFilename(value: string) {
  const basename = value.split(/[\\/]/).pop() ?? "image";
  const safe = basename
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return safe || "image";
}

export function getImageObjectKey(options: {
  assetId: string;
  filename: string;
  workspaceId: string;
  pageId: string;
}) {
  return [
    "org",
    encodeObjectKeySegment(options.workspaceId),
    "page",
    encodeObjectKeySegment(options.pageId),
    "images",
    options.assetId,
    options.filename,
  ].join("/");
}

function encodeObjectKeySegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/gi, "-");
}
