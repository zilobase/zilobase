import { isAllowedHttpUrl, isAllowedImageUrl, parseAbsoluteUrl } from "./safe-url";
import type { ClipMetadata } from "./types";

export type { ClipMetadata } from "./types";

export function extractClipMetadata(document: Document, pageUrl: string): ClipMetadata {
  const url = parseAbsoluteUrl(pageUrl);
  const canonical = absoluteFrom(
    document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    pageUrl,
  );
  const title = clipTitle(document, pageUrl);
  const description =
    metaContent(document, "og:description") ??
    metaContent(document, "twitter:description") ??
    namedMeta(document, "description");
  const image = firstAllowedImage(
    metaContent(document, "og:image"),
    metaContent(document, "twitter:image"),
    pageUrl,
  );
  const favicon = clipFavicon(document, pageUrl);
  const site = metaContent(document, "og:site_name");
  const { author, published } = clipAttribution(document);
  const schemaType = jsonLdType(document);
  const selectionText = document.getSelection?.()?.toString().trim() || null;
  const text = document.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";

  return {
    author,
    canonicalUrl: canonical,
    description,
    domain: url?.hostname ?? "",
    favicon,
    image,
    published,
    schemaType,
    selectionText,
    site,
    title,
    url: pageUrl,
    wordCount: text ? text.split(" ").filter(Boolean).length : 0,
  };
}

function clipAttribution(document: Document) {
  const author =
    namedMeta(document, "author") ??
    jsonLdString(document, "author") ??
    jsonLdString(document, "creator");
  const published =
    metaContent(document, "article:published_time") ??
    namedMeta(document, "date") ??
    jsonLdString(document, "datePublished");
  return { author, published };
}

function clipTitle(document: Document, pageUrl: string) {
  return (
    metaContent(document, "og:title") ??
    metaContent(document, "twitter:title") ??
    document.querySelector("title")?.textContent?.trim() ??
    parseAbsoluteUrl(pageUrl)?.hostname ??
    pageUrl
  );
}

function clipFavicon(document: Document, pageUrl: string) {
  return firstAllowedHttp(
    document.querySelector('link[rel="icon"]')?.getAttribute("href"),
    document.querySelector('link[rel="shortcut icon"]')?.getAttribute("href"),
    document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    pageUrl,
  );
}

function metaContent(document: Document, property: string) {
  return (
    document.querySelector(`meta[property="${property}"]`)?.getAttribute("content")?.trim() ||
    document.querySelector(`meta[name="${property}"]`)?.getAttribute("content")?.trim() ||
    null
  );
}

function namedMeta(document: Document, name: string) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || null;
}

function jsonLdText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name;
  }
  return null;
}

function jsonLdString(document: Document, key: string) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      const value = readJsonLd(data, key);
      const text = jsonLdText(value);
      if (text !== null) return text;
    } catch {
      continue;
    }
  }
  return null;
}

function jsonLdType(document: Document) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? "");
      const type = readJsonLd(data, "@type");
      if (typeof type === "string") return type;
    } catch {
      continue;
    }
  }
  return null;
}

function readJsonLd(data: unknown, key: string): unknown {
  if (Array.isArray(data)) {
    for (const item of data) {
      const value = readJsonLd(item, key);
      if (value) return value;
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (key in data) {
    return (data as Record<string, unknown>)[key];
  }
  if ("@graph" in data) {
    return readJsonLd((data as { "@graph": unknown })["@graph"], key);
  }
  return null;
}

function absoluteFrom(value: string | null | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base).toString();
    return isAllowedHttpUrl(url) ? url : null;
  } catch {
    return null;
  }
}

function firstAllowedHttp(...values: Array<string | null | undefined>) {
  const base = values.at(-1) ?? "";
  for (const value of values.slice(0, -1)) {
    const url = absoluteFrom(value, base);
    if (url) return url;
  }
  return null;
}

function firstAllowedImage(...values: Array<string | null | undefined>) {
  const base = values.at(-1) ?? "";
  for (const value of values.slice(0, -1)) {
    const url = absoluteFrom(value, base);
    if (url && isAllowedImageUrl(url)) return url;
  }
  return null;
}
