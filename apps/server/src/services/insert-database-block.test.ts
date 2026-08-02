import assert from "node:assert/strict";
import { test } from "vitest";

import { insertDatabaseBlockInContent } from "./insert-database-block";

const DATABASE_ID = "bf51b30e-1234-5678-9abc-def012345678";

test("insertDatabaseBlockInContent appends block to empty doc", () => {
  const result = insertDatabaseBlockInContent(null, { databaseId: DATABASE_ID });

  assert.equal(result.alreadyEmbedded, false);
  assert.equal(result.content.type, "doc");
  assert.equal(result.content.content?.[0]?.type, "databaseBlock");
  assert.equal(result.content.content?.[0]?.attrs?.databaseId, DATABASE_ID);
});

test("insertDatabaseBlockInContent inserts after matching heading", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Roadmap" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Existing paragraph" }],
      },
    ],
  };

  const result = insertDatabaseBlockInContent(content, {
    afterHeading: "Roadmap",
    databaseId: DATABASE_ID,
  });

  assert.equal(result.content.content?.[1]?.type, "paragraph");
  assert.equal(result.content.content?.[2]?.type, "databaseBlock");
  assert.equal(result.content.content?.[2]?.attrs?.databaseId, DATABASE_ID);
});

test("insertDatabaseBlockInContent detects duplicate embeds", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "databaseBlock",
        attrs: { databaseId: DATABASE_ID, showTitle: true },
      },
    ],
  };

  const result = insertDatabaseBlockInContent(content, {
    databaseId: DATABASE_ID,
  });

  assert.equal(result.alreadyEmbedded, true);
});

test("insertDatabaseBlockInContent rejects unknown heading", () => {
  assert.throws(
    () =>
      insertDatabaseBlockInContent({ type: "doc", content: [] }, {
        afterHeading: "Missing",
        databaseId: DATABASE_ID,
      }),
    /Could not find section heading/,
  );
});
