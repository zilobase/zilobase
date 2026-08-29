import assert from "node:assert/strict";
import { test } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { AI_ARTIFACT_FORMATS, generateAiArtifact } from "./ai-artifact-generator";

test("generates every advertised artifact format", () => {
  for (const format of AI_ARTIFACT_FORMATS) {
    const generated = generateAiArtifact({
      content: format === "json" ? '{"ok":true}' : "Hello\nWorld",
      format,
      table: { columns: ["Name", "Count"], rows: [["Ada", 2]] },
      title: "Report",
    });
    assert.ok(generated.bytes.byteLength > 10, format);
    assert.equal(generated.extension, format);
  }
});

test("generated office and archive files contain expected safe entries", () => {
  const xlsx = generateAiArtifact({
    format: "xlsx",
    table: { columns: ["Name"], rows: [["Ada"]] },
    title: "People",
  });
  const sheet = unzipSync(xlsx.bytes)["xl/worksheets/sheet1.xml"];
  assert.match(strFromU8(sheet!), /Ada/);

  const zip = generateAiArtifact({
    entries: [{ content: "safe", filename: "../notes/readme.md" }],
    format: "zip",
    title: "Bundle",
  });
  assert.deepEqual(Object.keys(unzipSync(zip.bytes)), ["notes/readme.md"]);
});

test("generated PDF has a valid header and trailer", () => {
  const pdf = strFromU8(generateAiArtifact({
    content: "Summary",
    format: "pdf",
    title: "Report",
  }).bytes);
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /%%EOF$/);
});
