import { unzipSync } from "fflate";

export const AI_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const AI_FILE_MAX_EXTRACTED_CHARS = 120_000;
export const AI_ZIP_MAX_ENTRIES = 100;
export const AI_ZIP_MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;

export const AI_FILE_ACCEPT = [
  ".csv",
  ".docx",
  ".json",
  ".md",
  ".pdf",
  ".pptx",
  ".txt",
  ".xlsx",
  ".zip",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");

export type AiFileKind =
  | "csv"
  | "docx"
  | "image"
  | "json"
  | "markdown"
  | "pdf"
  | "pptx"
  | "text"
  | "xlsx"
  | "zip";

export type AiFileExtraction = {
  kind: AiFileKind;
  mode: "extracted_text" | "provider_file";
  text: string | null;
  truncated: boolean;
};

export type FileExtractor = {
  kind: AiFileKind;
  extract(bytes: Uint8Array): Omit<AiFileExtraction, "kind" | "truncated">;
};

export class FileExtractorRegistry {
  private readonly extractors = new Map<AiFileKind, FileExtractor>();

  constructor(extractors: FileExtractor[]) {
    for (const extractor of extractors) {
      if (this.extractors.has(extractor.kind)) {
        throw new Error(`Duplicate file extractor for ${extractor.kind}.`);
      }
      this.extractors.set(extractor.kind, extractor);
    }
  }

  extract(kind: AiFileKind, bytes: Uint8Array): AiFileExtraction {
    const extractor = this.extractors.get(kind);
    if (!extractor) throw new Error(`No file extractor is registered for ${kind}.`);
    const extracted = extractor.extract(bytes);
    const normalized = extracted.text === null
      ? null
      : normalizeExtractedText(extracted.text);
    const truncated = (normalized?.length ?? 0) > AI_FILE_MAX_EXTRACTED_CHARS;
    return {
      ...extracted,
      kind,
      text: truncated
        ? `${normalized!.slice(0, AI_FILE_MAX_EXTRACTED_CHARS)}\n\n[File extraction truncated]`
        : normalized,
      truncated,
    };
  }
}

const DEFAULT_FILE_EXTRACTORS = new FileExtractorRegistry([
  providerFileExtractor("pdf"),
  providerFileExtractor("image"),
  textFileExtractor("csv", (bytes) => csvToReadableText(decodeUtf8(bytes))),
  textFileExtractor("json", (bytes) => formatJson(decodeUtf8(bytes))),
  textFileExtractor("text", decodeUtf8),
  textFileExtractor("markdown", decodeUtf8),
  textFileExtractor("docx", extractDocx),
  textFileExtractor("pptx", extractPptx),
  textFileExtractor("xlsx", extractXlsx),
  textFileExtractor("zip", extractZip),
]);

export function extractAiFile(input: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}): AiFileExtraction {
  if (input.bytes.byteLength === 0) {
    throw new Error("The uploaded file is empty.");
  }

  if (input.bytes.byteLength > AI_FILE_MAX_BYTES) {
    throw new Error("The uploaded file exceeds the 20 MB limit.");
  }

  const kind = detectAiFileKind(input);

  return DEFAULT_FILE_EXTRACTORS.extract(kind, input.bytes);
}

function providerFileExtractor(kind: "image" | "pdf"): FileExtractor {
  return {
    kind,
    extract: () => ({ mode: "provider_file", text: null }),
  };
}

function textFileExtractor(
  kind: Exclude<AiFileKind, "image" | "pdf">,
  extract: (bytes: Uint8Array) => string,
): FileExtractor {
  return {
    kind,
    extract: (bytes) => ({ mode: "extracted_text", text: extract(bytes) }),
  };
}

export function detectAiFileKind(input: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}): AiFileKind {
  const contentType = input.contentType.split(";", 1)[0]?.trim().toLowerCase();
  const extension = input.filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

  if (startsWithAscii(input.bytes, "%PDF-")) {
    if (extension === "pdf" || contentType === "application/pdf") return "pdf";
    throw new Error("The file signature is PDF but its name and content type do not match.");
  }

  if (isKnownImage(input.bytes, contentType)) {
    return "image";
  }

  if (isZip(input.bytes)) {
    if (extension === "docx") return "docx";
    if (extension === "pptx") return "pptx";
    if (extension === "xlsx") return "xlsx";
    if (extension === "zip") return "zip";
    throw new Error("ZIP-based files require a .docx, .pptx, .xlsx, or .zip name.");
  }

  if (input.bytes.includes(0)) {
    throw new Error("Unsupported binary file type.");
  }

  if (extension === "csv" || contentType === "text/csv") return "csv";
  if (extension === "json" || contentType === "application/json") return "json";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (
    extension === "txt" ||
    contentType === "text/plain" ||
    contentType?.startsWith("text/")
  ) {
    return "text";
  }

  throw new Error("Unsupported file type. Use PDF, CSV, XLSX, DOCX, PPTX, text, Markdown, JSON, ZIP, or a supported image.");
}

export function contentTypeForAiFileKind(
  kind: AiFileKind,
  declaredContentType: string,
) {
  const contentTypes: Partial<Record<AiFileKind, string>> = {
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    json: "application/json",
    markdown: "text/markdown",
    pdf: "application/pdf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    text: "text/plain",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return contentTypes[kind] ?? declaredContentType;
}

function extractDocx(bytes: Uint8Array) {
  const entries = safeUnzip(bytes);
  const document = entries["word/document.xml"];
  if (!document) throw new Error("The DOCX file has no document body.");

  return xmlText(document, /<w:p\b[\s\S]*?<\/w:p>/g);
}

function extractPptx(bytes: Uint8Array) {
  const entries = safeUnzip(bytes);
  const slideNames = Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(naturalCompare);
  if (slideNames.length === 0) throw new Error("The PPTX file has no slides.");

  return slideNames
    .map((name, index) => `## Slide ${index + 1}\n${xmlText(entries[name]!)}`)
    .join("\n\n");
}

function extractXlsx(bytes: Uint8Array) {
  const entries = safeUnzip(bytes);
  const sheetNames = Object.keys(entries)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(naturalCompare);
  if (sheetNames.length === 0) throw new Error("The XLSX file has no worksheets.");

  const sharedStrings = entries["xl/sharedStrings.xml"]
    ? xmlMatches(decodeUtf8(entries["xl/sharedStrings.xml"]!), "t")
    : [];

  return sheetNames
    .map((name, index) => {
      const xml = decodeUtf8(entries[name]!);
      const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(
        (row) => [...(row[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
          .map((cell) => {
            const attrs = cell[1] ?? "";
            const body = cell[2] ?? "";
            const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
              ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]
              ?? "";
            return /\bt="s"/.test(attrs)
              ? sharedStrings[Number(value)] ?? ""
              : decodeXml(value);
          })
          .join("\t"),
      );
      return `## Worksheet ${index + 1}\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

function extractZip(bytes: Uint8Array) {
  const entries = safeUnzip(bytes);
  const sections: string[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    if (sections.join("\n").length >= AI_FILE_MAX_EXTRACTED_CHARS) break;
    if (entry.byteLength === 0 || name.endsWith("/")) continue;

    const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (!["csv", "json", "md", "markdown", "txt"].includes(extension ?? "")) {
      continue;
    }

    const raw = decodeUtf8(entry);
    const content = extension === "csv"
      ? csvToReadableText(raw)
      : extension === "json"
        ? formatJson(raw)
        : raw;
    sections.push(`## ${sanitizeArchivePath(name)}\n${content}`);
  }

  if (sections.length === 0) {
    throw new Error("The ZIP contains no supported text, Markdown, CSV, or JSON files.");
  }

  return sections.join("\n\n");
}

function safeUnzip(bytes: Uint8Array) {
  inspectZipDirectory(bytes);
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error("The ZIP-based file is malformed or uses unsupported encryption.");
  }
}

function inspectZipDirectory(bytes: Uint8Array) {
  let entries = 0;
  let uncompressedBytes = 0;

  for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) continue;
    entries += 1;
    const flags = readUint16(bytes, offset + 8);
    if ((flags & 1) !== 0) throw new Error("Encrypted ZIP files are not supported.");
    uncompressedBytes += readUint32(bytes, offset + 24);
    if (entries > AI_ZIP_MAX_ENTRIES) {
      throw new Error(`ZIP files may contain at most ${AI_ZIP_MAX_ENTRIES} entries.`);
    }
    if (uncompressedBytes > AI_ZIP_MAX_UNCOMPRESSED_BYTES) {
      throw new Error("The expanded ZIP exceeds the 24 MB safety limit.");
    }
  }

  if (entries === 0) throw new Error("The ZIP central directory is missing.");
}

function csvToReadableText(input: string) {
  const rows = parseCsv(input).slice(0, 2_000);
  return rows.map((row) => row.join("\t")).join("\n");
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function formatJson(input: string) {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    throw new Error("The JSON file is malformed.");
  }
}

function xmlText(bytes: Uint8Array, blockPattern?: RegExp) {
  const xml = decodeUtf8(bytes);
  if (blockPattern) {
    return [...xml.matchAll(blockPattern)]
      .map((match) => xmlMatches(match[0], "t").join(""))
      .filter(Boolean)
      .join("\n");
  }
  return xmlMatches(xml, "t").join("\n");
}

function xmlMatches(xml: string, localName: string) {
  const pattern = new RegExp(
    `<(?:[a-z]+:)?${localName}[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?${localName}>`,
    "gi",
  );
  return [...xml.matchAll(pattern)].map((match) => decodeXml(match[1] ?? ""));
}

function decodeXml(input: string) {
  return input
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)));
}

function normalizeExtractedText(input: string) {
  return input.replaceAll("\0", "").replace(/\r\n?/g, "\n").trim();
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The file is not valid UTF-8 text.");
  }
}

function isZip(bytes: Uint8Array) {
  return readUint32(bytes, 0) === 0x04034b50;
}

function isKnownImage(bytes: Uint8Array, contentType: string | undefined) {
  return (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWithBytes(bytes, [0xff, 0xd8, 0xff]) ||
    startsWithAscii(bytes, "GIF8") ||
    (startsWithAscii(bytes.subarray(8), "WEBP") && startsWithAscii(bytes, "RIFF"))
  ) && Boolean(contentType?.startsWith("image/") || !contentType);
}

function startsWithAscii(bytes: Uint8Array, value: string) {
  return startsWithBytes(bytes, [...new TextEncoder().encode(value)]);
}

function startsWithBytes(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function readUint16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true });
}

function sanitizeArchivePath(value: string) {
  return value.replaceAll("\\", "/").split("/").filter(
    (part) => part && part !== "." && part !== "..",
  ).join("/");
}
