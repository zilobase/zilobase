import { strToU8, zipSync } from "fflate";

export const AI_ARTIFACT_FORMATS = [
  "csv",
  "docx",
  "json",
  "md",
  "pdf",
  "pptx",
  "xlsx",
  "zip",
] as const;

export type AiArtifactFormat = (typeof AI_ARTIFACT_FORMATS)[number];
export type AiArtifactTable = {
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};

export type GeneratedAiArtifact = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
};

export type AiArtifactRenderInput = {
  content?: string;
  entries?: Array<{ content: string; filename: string }>;
  format: AiArtifactFormat;
  table?: AiArtifactTable;
  title: string;
};

export interface ArtifactRenderer {
  readonly format: AiArtifactFormat;
  render(input: AiArtifactRenderInput): GeneratedAiArtifact;
}

export class ArtifactRendererRegistry {
  private readonly renderers = new Map<AiArtifactFormat, ArtifactRenderer>();

  constructor(renderers: ArtifactRenderer[]) {
    for (const renderer of renderers) {
      if (this.renderers.has(renderer.format)) {
        throw new Error(`Duplicate artifact renderer for ${renderer.format}.`);
      }
      this.renderers.set(renderer.format, renderer);
    }
  }

  render(input: AiArtifactRenderInput) {
    const renderer = this.renderers.get(input.format);
    if (!renderer) throw new Error(`No artifact renderer is registered for ${input.format}.`);
    const generated = renderer.render(input);
    validateGeneratedArtifact(input.format, generated);
    return generated;
  }
}

const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

export function generateAiArtifact(input: AiArtifactRenderInput): GeneratedAiArtifact {
  const generated = DEFAULT_ARTIFACT_RENDERERS.render(input);

  if (generated.bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error("Generated artifact exceeds the 8 MB limit.");
  }
  return generated;
}

const DEFAULT_ARTIFACT_RENDERERS = new ArtifactRendererRegistry(
  AI_ARTIFACT_FORMATS.map((format): ArtifactRenderer => ({
    format,
    render(input) {
      switch (format) {
    case "csv":
      return textArtifact(toCsv(input.table ?? contentTable(input.content)), "text/csv; charset=utf-8", "csv");
    case "json":
      return textArtifact(toJson(input), "application/json", "json");
    case "md":
      return textArtifact(input.content ?? tableToMarkdown(input.table), "text/markdown; charset=utf-8", "md");
    case "pdf":
      return { bytes: createPdf(input.title, input.content ?? tableToPlainText(input.table)), contentType: "application/pdf", extension: "pdf" };
    case "docx":
      return { bytes: createDocx(input.title, input.content ?? tableToPlainText(input.table)), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" };
    case "pptx":
      return { bytes: createPptx(input.title, input.content ?? tableToPlainText(input.table)), contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx" };
    case "xlsx":
      return { bytes: createXlsx(input.table ?? contentTable(input.content)), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
    case "zip":
      return { bytes: createZip(input), contentType: "application/zip", extension: "zip" };
    default:
      format satisfies never;
      throw new Error("Unsupported artifact format.");
      }
    }
  })),
);

function validateGeneratedArtifact(
  format: AiArtifactFormat,
  generated: GeneratedAiArtifact,
) {
  if (generated.bytes.byteLength === 0) throw new Error("Artifact renderer returned an empty file.");
  if (format === "pdf" && new TextDecoder().decode(generated.bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("PDF renderer validation failed.");
  }
  if (["docx", "pptx", "xlsx", "zip"].includes(format)) {
    const bytes = generated.bytes;
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error(`${format.toUpperCase()} renderer validation failed.`);
    }
  }
}

function textArtifact(content: string, contentType: string, extension: string) {
  return { bytes: strToU8(content), contentType, extension };
}

function toCsv(table: AiArtifactTable) {
  return [table.columns, ...table.rows]
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n");
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toJson(input: { content?: string; table?: AiArtifactTable; title: string }) {
  if (input.table) {
    return JSON.stringify(
      input.table.rows.map((row) => Object.fromEntries(
        input.table!.columns.map((column, index) => [column, row[index] ?? null]),
      )),
      null,
      2,
    );
  }
  if (input.content) {
    try {
      return JSON.stringify(JSON.parse(input.content), null, 2);
    } catch {
      throw new Error("JSON artifact content must be valid JSON.");
    }
  }
  return JSON.stringify({ title: input.title }, null, 2);
}

function contentTable(content: string | undefined): AiArtifactTable {
  return {
    columns: ["Content"],
    rows: (content ?? "").split(/\r?\n/).map((line) => [line]),
  };
}

function tableToPlainText(table: AiArtifactTable | undefined) {
  return table ? [table.columns, ...table.rows].map((row) => row.join("\t")).join("\n") : "";
}

function tableToMarkdown(table: AiArtifactTable | undefined) {
  if (!table) return "";
  return [
    `| ${table.columns.map(markdownCell).join(" | ")} |`,
    `| ${table.columns.map(() => "---").join(" | ")} |`,
    ...table.rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ].join("\n");
}

function markdownCell(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function createZip(input: {
  content?: string;
  entries?: Array<{ content: string; filename: string }>;
  title: string;
}) {
  const entries = input.entries?.length
    ? input.entries
    : [{ content: input.content ?? "", filename: "README.md" }];
  if (entries.length > 50) throw new Error("ZIP artifacts may contain at most 50 files.");

  return zipSync(Object.fromEntries(entries.map((entry, index) => [
    safeZipPath(entry.filename, index),
    strToU8(entry.content),
  ])));
}

function safeZipPath(value: string, index: number) {
  const path = value.replaceAll("\\", "/").split("/").filter(
    (part) => part && part !== "." && part !== "..",
  ).join("/").replace(/[^\p{L}\p{N} ./_()\-]/gu, "_").slice(0, 180);
  return path || `file-${index + 1}.txt`;
}

function createDocx(title: string, content: string) {
  const paragraphs = [title, ...content.split(/\r?\n/)].map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`
  ).join("");
  return zipXml({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`,
  });
}

function createXlsx(table: AiArtifactTable) {
  const rows = [table.columns, ...table.rows].map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
      if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? ""))}</t></is></c>`;
    }).join("")}</row>`
  ).join("");
  return zipXml({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
  });
}

function createPptx(title: string, content: string) {
  const slides = content.split(/\n---\n/g).slice(0, 50);
  const slideEntries: Record<string, string> = {};
  const overrides: string[] = [];
  const relationships: string[] = [];
  const slideIds: string[] = [];
  slides.forEach((slide, index) => {
    const number = index + 1;
    slideEntries[`ppt/slides/slide${number}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(number === 1 ? `${title}\n${slide}` : slide)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    overrides.push(`<Override PartName="/ppt/slides/slide${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    relationships.push(`<Relationship Id="rId${number}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${number}.xml"/>`);
    slideIds.push(`<p:sldId id="${255 + number}" r:id="rId${number}"/>`);
  });
  return zipXml({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${overrides.join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/_rels/presentation.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`,
    "ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${slideIds.join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    ...slideEntries,
  });
}

function createPdf(title: string, content: string) {
  const lines = [title, "", ...content.split(/\r?\n/)].slice(0, 80);
  const stream = ["BT", "/F1 11 Tf", "48 760 Td", "14 TL", ...lines.flatMap((line, index) => [
    index === 0 ? "/F1 16 Tf" : index === 1 ? "/F1 11 Tf" : "",
    `(${pdfText(line.slice(0, 110))}) Tj`,
    "T*",
  ]).filter(Boolean), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${strToU8(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(strToU8(output).byteLength);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = strToU8(output).byteLength;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(output);
}

function zipXml(entries: Record<string, string>) {
  return zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)])));
}

function columnName(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function pdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7e]/g, "?");
}
