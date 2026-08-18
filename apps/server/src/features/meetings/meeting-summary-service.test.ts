import assert from "node:assert/strict";
import { test } from "vitest";

import { buildSummaryDocument, splitTranscript } from "./meeting-summary-service";

test("summary documents contain structured meeting sections", () => {
  const document = buildSummaryDocument({
    actionItems: [{ dueDate: null, owner: "Sam", task: "Ship the draft" }],
    decisions: ["Use the new homepage"],
    highlights: ["Conversion improved"],
    overview: "The team reviewed the launch.",
    title: "Launch review",
  });
  assert.equal(document.type, "doc");
  assert.equal(document.content[0]?.type, "heading");
  assert.match(JSON.stringify(document), /Ship the draft — Owner: Sam/);
});

test("long transcripts split on line boundaries", () => {
  const chunks = splitTranscript(`${"a".repeat(40_000)}\n${"b".repeat(40_000)}`);
  assert.equal(chunks.length, 2);
  assert.equal(chunks.join("" ).length, 80_001);
});
