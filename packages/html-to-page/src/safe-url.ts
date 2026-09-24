const allowedProtocols = new Set(["http:", "https:"]);

export function parseAbsoluteUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isAllowedHttpUrl(value: string | null | undefined) {
  const url = parseAbsoluteUrl(value);
  return Boolean(url && allowedProtocols.has(url.protocol));
}

export function isAllowedImageUrl(value: string | null | undefined) {
  const url = parseAbsoluteUrl(value);
  if (!url) return false;
  if (url.protocol === "data:") {
    return url.pathname.startsWith("image/");
  }
  return allowedProtocols.has(url.protocol);
}

export function isAllowedEmbedSrc(value: string | null | undefined) {
  const url = parseAbsoluteUrl(value);
  if (!url || !allowedProtocols.has(url.protocol)) return false;
  const host = url.hostname.replace(/^www\./, "");
  return (
    host === "youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "player.vimeo.com" ||
    host === "vimeo.com"
  );
}
