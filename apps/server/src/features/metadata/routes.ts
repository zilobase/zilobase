import { Hono } from "hono";
import { isIP } from "node:net";
import type { AppBindings } from "../../types";

export const metadataRoutes = new Hono<AppBindings>();

metadataRoutes.get("/bookmark", async (c) => {
  if (!c.get("user")) {
    return c.json({ message: "Please sign in to continue." }, 401);
  }

  const url = normalizeUrl(c.req.query("url") ?? "");

  if (!url) {
    return c.json({ message: "A valid http or https URL is required." }, 400);
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (compatible; NotelabBookmarkBot/1.0; +https://notelab.io)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return c.json({ message: "Unable to fetch bookmark metadata." }, 502);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
      return c.json({ message: "URL does not point to an HTML page." }, 415);
    }

    const html = await readLimitedResponse(response, 1_000_000);

    return c.json({
      description:
        getMetaContent(html, "og:description") ??
        getMetaContent(html, "twitter:description") ??
        getMetaContent(html, "description"),
      favicon:
        resolveUrl(
          getLinkHref(html, "icon") ??
            getLinkHref(html, "shortcut icon") ??
            getLinkHref(html, "apple-touch-icon"),
          url,
        ) ?? getFallbackFavicon(url),
      image:
        resolveUrl(
          getMetaContent(html, "og:image") ??
            getMetaContent(html, "twitter:image"),
          url,
        ) ?? null,
      title:
        getMetaContent(html, "og:title") ??
        getMetaContent(html, "twitter:title") ??
        getTitle(html) ??
        getUrlTitle(url),
    });
  } catch {
    return c.json({ message: "Unable to fetch bookmark metadata." }, 502);
  }
});

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (isBlockedHostname(url.hostname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (isIP(normalized) === 4) {
    const [first = 0, second = 0] = normalized.split(".").map(Number);

    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

async function readLimitedResponse(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();

  if (!reader) {
    return response.text();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    const nextChunk = value.slice(0, Math.max(0, maxBytes - total));

    chunks.push(nextChunk);
    total += nextChunk.byteLength;
  }

  await reader.cancel().catch(() => undefined);

  return new TextDecoder().decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number) {
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function getMetaContent(html: string, name: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const property = getAttribute(tag, "property");
    const metaName = getAttribute(tag, "name");

    if (property !== name && metaName !== name) {
      continue;
    }

    const content = getAttribute(tag, "content")?.trim();

    if (content) {
      return decodeHtml(content);
    }
  }

  return null;
}

function getLinkHref(html: string, rel: string) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const relValue = getAttribute(tag, "rel")
      ?.split(/\s+/)
      .map((part) => part.toLowerCase());

    if (!relValue?.includes(rel.toLowerCase())) {
      continue;
    }

    const href = getAttribute(tag, "href")?.trim();

    if (href) {
      return decodeHtml(href);
    }
  }

  return null;
}

function getAttribute(tag: string, name: string) {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i");

  return tag.match(pattern)?.[2] ?? null;
}

function getTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();

  return match ? decodeHtml(match.replace(/\s+/g, " ")) : null;
}

function getUrlTitle(value: string) {
  const host = getUrlHost(value);

  if (!host) {
    return value;
  }

  return host
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getUrlHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getFallbackFavicon(value: string) {
  try {
    return new URL("/favicon.ico", value).toString();
  } catch {
    return null;
  }
}

function resolveUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
