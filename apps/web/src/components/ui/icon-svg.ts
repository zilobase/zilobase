export function isSvgIcon(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return value.trim().startsWith("<svg");
}

export function getDatabaseIconConfig(database: { config?: unknown; dataSourceConfig?: unknown }) {
  return "dataSourceConfig" in database ? database.dataSourceConfig : database.config;
}

export function normalizeSvgContent(content: string) {
  return content
    .replace(/\sfill="[^"]*"/gi, "")
    .replace(/\sfill='[^']*'/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/\sstyle='[^']*'/gi, "");
}

export function getStoredIconColor(svg: string) {
  const dataColorMatch = svg.match(/data-icon-color="([^"]+)"/i);

  return dataColorMatch?.[1] ?? "default";
}

export function buildColoredIconSvg({
  viewBox,
  content,
  color,
}: {
  viewBox: string;
  content: string;
  color: string;
}) {
  const normalizedContent = normalizeSvgContent(content);
  const colorValue = color || "default";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1em" height="1em" fill="currentColor" data-icon-color="${colorValue}">${normalizedContent}</svg>`;
}

export function buildStoredSvgFromRenderedSvg({ color, svg }: { color: string; svg: string }) {
  const sanitized = sanitizeStoredSvg(svg);

  if (!sanitized) {
    return "";
  }

  const viewBoxMatch = sanitized.match(/viewBox="([^"]+)"/i);
  const viewBox = viewBoxMatch?.[1] ?? "0 0 24 24";
  const content = sanitized
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\saria-hidden="[^"]*"/gi, "")
    .replace(/\srole="[^"]*"/gi, "")
    .trim();

  if (!content) {
    return "";
  }

  const colorValue = color || "default";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1em" height="1em" fill="currentColor" data-icon-color="${colorValue}">${content}</svg>`;
}

export function parseUploadedSvg(raw: string) {
  const sanitized = sanitizeStoredSvg(raw);

  if (!sanitized) {
    return null;
  }

  const viewBoxMatch = sanitized.match(/viewBox="([^"]+)"/i);
  const widthMatch = sanitized.match(/\bwidth="([\d.]+)"/i);
  const heightMatch = sanitized.match(/\bheight="([\d.]+)"/i);
  const viewBox =
    viewBoxMatch?.[1] ??
    (widthMatch && heightMatch ? `0 0 ${widthMatch[1]} ${heightMatch[1]}` : "0 0 24 24");
  const content = normalizeSvgContent(
    sanitized
      .replace(/<svg[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "")
      .trim(),
  );

  if (!content) {
    return null;
  }

  return { viewBox, content };
}

export function sanitizeStoredSvg(value: string) {
  const trimmed = value.trim();

  if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
    return "";
  }

  if (/<script|on\w+=|javascript:/i.test(trimmed)) {
    return "";
  }

  return trimmed;
}

export type LucideIconNode = ReadonlyArray<
  readonly [string, object] | readonly [string, object, LucideIconNode]
>;

export function buildLucideIconMarkup(node: LucideIconNode): string {
  return node
    .map(([tag, attributes, children]) => {
      const serialized = Object.entries(attributes as Record<string, unknown>)
        .filter(([name, value]) => name !== "key" && value !== undefined)
        .map(([name, value]) => ` ${name}="${String(value)}"`)
        .join("");

      return `<${tag}${serialized}>${children ? buildLucideIconMarkup(children) : ""}</${tag}>`;
    })
    .join("");
}

export function buildLucideStoredSvg({ color, markup }: { color: string; markup: string }) {
  const colorValue = color || "default";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" data-icon-color="${colorValue}" data-icon-library="lucide">${markup}</svg>`;
}

const drawingElementPattern = /<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)>/gi;
const drawingAttributePattern =
  /\s(d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points)=("[^"]*"|'[^']*')/gi;

/** Identifies an icon by its drawing alone, ignoring color, size, and wrapper attributes. */
export function getSvgDrawingSignature(svg: string) {
  const content = svg.replace(/^\s*<svg\b[^>]*>/i, "");
  const elements = [...content.matchAll(drawingElementPattern)].map(([, tag, attributes]) => {
    const geometry = [...attributes.matchAll(drawingAttributePattern)]
      .map(([, name, value]) => `${name}=${value.slice(1, -1).replace(/\s+/g, " ").trim()}`)
      .sort();

    return `${tag.toLowerCase()}(${geometry.join(",")})`;
  });

  return hashString(elements.join("|"));
}

function hashString(value: string) {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }

  first = Math.imul(first ^ (first >>> 16), 2246822507);
  first ^= Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507);
  second ^= Math.imul(first ^ (first >>> 13), 3266489909);

  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36);
}

/** Icons picked before the Lucide migration were stored as 256-unit Phosphor drawings. */
export function isLegacyPhosphorSvg(value: string | null | undefined): value is string {
  return isSvgIcon(value) && /\sviewBox=["']0 0 256 256["']/i.test(value as string);
}

type LegacyIconTable = Map<string, string | null>;

let legacyIconTable: Promise<LegacyIconTable> | undefined;
const resolvedLegacyIcons = new Map<string, string | null>();

async function loadLegacyIconTable(): Promise<LegacyIconTable> {
  const { lucideNames, phosphorDrawings } = await import("./legacy-phosphor-icons");
  const table: LegacyIconTable = new Map();

  for (const entry of phosphorDrawings.split(",")) {
    const [signature, index] = entry.split(":");
    const lucideIndex = Number(index);
    table.set(signature, lucideIndex < 0 ? null : (lucideNames[lucideIndex] ?? null));
  }

  return table;
}

/** Returns the converted icon when it has already been resolved; undefined while unknown. */
export function peekLegacyIconSvg(svg: string) {
  return resolvedLegacyIcons.get(svg);
}

/**
 * Converts a stored Phosphor icon to the equivalent Lucide drawing, keeping its color.
 * Resolves to null when Lucide has no equivalent, and to the original markup when the
 * drawing is not a Phosphor icon (for example an uploaded 256-unit SVG).
 */
export async function resolveLegacyIconSvg(svg: string): Promise<string | null> {
  const cached = resolvedLegacyIcons.get(svg);
  if (cached !== undefined) return cached;

  let resolved: string | null;

  try {
    legacyIconTable ??= loadLegacyIconTable();
    const table = await legacyIconTable;
    const signature = getSvgDrawingSignature(svg);

    if (!table.has(signature)) {
      resolved = svg;
    } else {
      const lucideName = table.get(signature);
      resolved = lucideName
        ? await buildLucideStoredSvgByName(lucideName, getStoredIconColor(svg))
        : null;
    }
  } catch {
    resolved = null;
  }

  resolvedLegacyIcons.set(svg, resolved);
  return resolved;
}

export async function buildLucideStoredSvgByName(name: string, color: string) {
  const { dynamicIconImports } = await import("lucide-react/dynamic");
  const loadIcon = dynamicIconImports[name as keyof typeof dynamicIconImports];
  if (!loadIcon) return null;

  const { __iconData } = await loadIcon();

  return buildLucideStoredSvg({ color, markup: buildLucideIconMarkup(__iconData.node) });
}
