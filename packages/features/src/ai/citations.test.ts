import assert from "node:assert/strict";
import { test } from "node:test";
import { chatCitations, chatDisplayText, chatMentionParts, chatCitationParts } from "./citations";

test("sent mentions retain position and repeated references without an attachment list", () => {
  const page = { type: "page" as const, id: "page" };
  const database = { type: "database" as const, id: "db/with]characters" };
  assert.deepEqual(
    chatMentionParts(
      "Compare [[page:page]] with [[database:db%2Fwith%5Dcharacters]] then [[page:page]].",
      [page, database],
    ),
    [
      { type: "text", text: "Compare " },
      { type: "source", source: page },
      { type: "text", text: " with " },
      { type: "source", source: database },
      { type: "text", text: " then " },
      { type: "source", source: page },
      { type: "text", text: "." },
    ],
  );
  assert.deepEqual(chatMentionParts("[[page:unknown]] [[page:%broken]]", []), [
    { type: "source", source: { type: "page", id: "unknown" } },
    { type: "text", text: " [[page:%broken]]" },
  ]);
  assert.deepEqual(chatMentionParts("Old question", [page, page]), [
    { type: "text", text: "Old question" },
    { type: "text", text: " " },
    { type: "source", source: page },
  ]);
});
test("only exact supplied citation identities resolve and repeated citations collapse", () => {
  const entry = {
    key: "page:allowed",
    id: "allowed",
    type: "page" as const,
    title: "Allowed",
    pageId: "allowed",
    provenance: { capturedAt: "now", origin: "saved" as const },
  };
  assert.deepEqual(
    chatCitations("[[page:allowed]] [[page:allowed]] [[page:secret]] [[https://example.com]]", [
      entry,
    ]),
    [entry],
  );
});

test("display text hides internal citations, including unknown identities, and retains markdown", () => {
  assert.equal(
    chatDisplayText(
      "**Summary**\n\nDone. [[page:allowed]] [[record:source:row]] [[page:secret]]\n\nNext. [[database:db]] [[source:s]]",
    ),
    "**Summary**\n\nDone.\n\nNext.",
  );
  assert.equal(
    chatDisplayText("See [[ordinary text]] and [a link](https://example.com)."),
    "See [[ordinary text]] and [a link](https://example.com).",
  );
});

test("streaming and interrupted citations never expose partial identities", () => {
  for (const marker of ["[[page:abc]]", "[[database:abc]]", "[[source:abc]]", "[[record:s:r]]"]) {
    for (let length = 2; length <= marker.length; length++) {
      assert.equal(chatDisplayText(`Answer. ${marker.slice(0, length)}`), "Answer.");
    }
  }
  assert.equal(chatDisplayText("Answer [[ordinary"), "Answer [[ordinary");
});

test("citations stay inline, repeat in place, and only resolve successfully read evidence", () => {
  const entry = {
    key: "page:allowed",
    id: "allowed",
    type: "page" as const,
    title: "Plan",
    pageId: "allowed",
    provenance: { capturedAt: "now", origin: "saved" as const },
  };
  assert.deepEqual(
    chatCitationParts("**Due Friday** [[page:allowed]], then [[page:allowed]]. [[page:unread]]", [
      entry,
    ]),
    [
      { type: "text", text: "**Due Friday** " },
      { type: "citation", entry },
      { type: "text", text: ", then " },
      { type: "citation", entry },
      { type: "text", text: "." },
    ],
  );
  const literal = "`[[page:allowed]]`\n\n```md\n[[page:allowed]]\n```\n\n";
  assert.deepEqual(chatCitationParts(literal + "[[page:allowed]]", [entry]), [
    { type: "text", text: literal },
    { type: "citation", entry },
  ]);
  assert.equal(chatDisplayText(literal), literal.trimEnd());
});

test("page citations may point at one block of a read page", () => {
  const entry = {
    key: "page:allowed",
    id: "allowed",
    type: "page" as const,
    title: "Plan",
    pageId: "allowed",
    provenance: { capturedAt: "now", origin: "saved" as const },
  };
  assert.deepEqual(chatCitationParts("Risks [[page:allowed#block-7]] [[page:unread#b]]", [entry]), [
    { type: "text", text: "Risks " },
    { type: "citation", entry, blockId: "block-7" },
    { type: "text", text: "" },
  ]);
});
