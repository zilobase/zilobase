import assert from "node:assert/strict";
import { test } from "vitest";

import {
  insertDatabaseBlockInContent,
  shouldShowInlineDatabaseTitle,
} from "@zilobase/page-context";

const DATABASE_ID = "bf51b30e-1234-5678-9abc-def012345678";

test("insertDatabaseBlockInContent appends block to empty doc", () => {
  const result = insertDatabaseBlockInContent(null, { databaseId: DATABASE_ID });

  assert.equal(result.alreadyEmbedded, false);
  assert.equal(result.content.type, "doc");
  assert.equal(result.content.content?.[0]?.type, "databaseBlock");
  assert.equal(result.content.content?.[0]?.attrs?.databaseId, DATABASE_ID);
});

test("insertDatabaseBlockInContent can hide a redundant inline title", () => {
  const result = insertDatabaseBlockInContent(null, {
    databaseId: DATABASE_ID,
    showTitle: false,
  });

  assert.equal(result.content.content?.[0]?.attrs?.showTitle, false);
});

test("matching page and database names use the native page title only", () => {
  assert.equal(
    shouldShowInlineDatabaseTitle("🚀 Release Tracker", "Release Tracker"),
    false,
  );
  assert.equal(
    shouldShowInlineDatabaseTitle("Launch Dashboard", "Release Tracker"),
    true,
  );
});

test("insertDatabaseBlockInContent repairs an existing block title", () => {
  const result = insertDatabaseBlockInContent({
    type: "doc",
    content: [{
      attrs: { databaseId: DATABASE_ID, showTitle: true },
      type: "databaseBlock",
    }],
  }, {
    databaseId: DATABASE_ID,
    showTitle: false,
  });

  assert.equal(result.alreadyEmbedded, true);
  assert.equal(result.titleUpdated, true);
  assert.equal(result.content.content?.[0]?.attrs?.showTitle, false);
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

test("insertDatabaseBlockInContent validates IDs and scans nested blocks", () => {
  assert.throws(
    () => insertDatabaseBlockInContent({}, { databaseId: "not-a-uuid" }),
    /databaseId must be a valid UUID/,
  );

  const result = insertDatabaseBlockInContent(
    {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              attrs: { databaseId: DATABASE_ID },
              type: "databaseBlock",
            },
          ],
        },
      ],
    },
    { databaseId: DATABASE_ID },
  );

  assert.equal(result.alreadyEmbedded, true);
});

test("insertDatabaseBlockInContent normalizes heading markup and boundaries", () => {
  const result = insertDatabaseBlockInContent(
    {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ text: "before" }] },
        {
          type: "heading2",
          content: [{ text: "## Road" }, { text: "map" }],
        },
        { type: "paragraph", content: [{ text: "section" }] },
        { type: "heading3", content: [{ text: "Next" }] },
      ],
    },
    { afterHeading: " # Roadmap ", databaseId: DATABASE_ID },
  );

  assert.equal(result.content.content?.[3]?.type, "databaseBlock");
  assert.equal(result.content.content?.[5]?.type, "heading3");
});

test("insertDatabaseBlockInContent handles sparse valid documents", () => {
  const appended = insertDatabaseBlockInContent(
    { type: "doc" },
    { databaseId: DATABASE_ID },
  );
  assert.equal(appended.content.content?.[0]?.type, "databaseBlock");

  assert.throws(
    () =>
      insertDatabaseBlockInContent(
        { type: "doc", content: [{ type: "heading2" }] },
        { afterHeading: "Roadmap", databaseId: DATABASE_ID },
      ),
    /Could not find section heading/,
  );
});
