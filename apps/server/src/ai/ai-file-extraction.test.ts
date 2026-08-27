import assert from "node:assert/strict";
import { test } from "vitest";
import { strToU8, zipSync } from "fflate";

import { extractAiFile } from "./ai-file-extraction";

test("extracts quoted CSV and formatted JSON", () => {
  const csv = extractAiFile({
    bytes: strToU8('name,notes\nAda,"Line one, line two"'),
    contentType: "text/csv",
    filename: "people.csv",
  });
  assert.match(csv.text ?? "", /Ada\tLine one, line two/);

  const json = extractAiFile({
    bytes: strToU8('{"ready":true}'),
    contentType: "application/json",
    filename: "state.json",
  });
  assert.equal(json.text, '{\n  "ready": true\n}');
});

test("extracts DOCX, PPTX, XLSX, and safe ZIP text", () => {
  const docx = zipSync({
    "word/document.xml": strToU8(
      "<w:document><w:p><w:r><w:t>Hello document</w:t></w:r></w:p></w:document>",
    ),
  });
  assert.match(
    extractAiFile({ bytes: docx, contentType: "application/octet-stream", filename: "brief.docx" }).text ?? "",
    /Hello document/,
  );

  const pptx = zipSync({
    "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>Launch plan</a:t></p:sld>"),
  });
  assert.match(
    extractAiFile({ bytes: pptx, contentType: "application/octet-stream", filename: "deck.pptx" }).text ?? "",
    /Launch plan/,
  );

  const xlsx = zipSync({
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Revenue</t></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><row><c t="s"><v>0</v></c><c><v>42</v></c></row></worksheet>'),
  });
  assert.match(
    extractAiFile({ bytes: xlsx, contentType: "application/octet-stream", filename: "data.xlsx" }).text ?? "",
    /Revenue\t42/,
  );

  const zip = zipSync({ "notes/readme.md": strToU8("# Notes\nSafe archive") });
  assert.match(
    extractAiFile({ bytes: zip, contentType: "application/zip", filename: "notes.zip" }).text ?? "",
    /Safe archive/,
  );
});

test("keeps PDF bytes for provider-isolated reading and rejects disguised binary", () => {
  const pdf = extractAiFile({
    bytes: strToU8("%PDF-1.4 fixture"),
    contentType: "application/pdf",
    filename: "brief.pdf",
  });
  assert.equal(pdf.mode, "provider_file");
  assert.equal(pdf.text, null);

  assert.throws(
    () => extractAiFile({
      bytes: new Uint8Array([0, 1, 2, 3]),
      contentType: "text/plain",
      filename: "fake.txt",
    }),
    /binary/,
  );
  assert.throws(
    () => extractAiFile({
      bytes: strToU8("%PDF-1.4 disguised"),
      contentType: "text/plain",
      filename: "fake.txt",
    }),
    /do not match/,
  );
});
