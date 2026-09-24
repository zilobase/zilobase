import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { mailThreadIndexRecord } from "./mail-index";

test("mail index records snippets and queryable metadata but omits bodies", () => {
  const row = mailThreadIndexRecord("account-1", 3, {
    id: "thread-1",
    messages: [
      {
        historyId: "10",
        id: "message-1",
        internalDate: "1788231600000",
        labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
        payload: {
          headers: [
            { name: "From", value: "Ada <ada@example.com>" },
            { name: "To", value: "Team <team@zilobase.com>" },
            { name: "Subject", value: "Roadmap" },
          ],
          parts: [
            { mimeType: "text/calendar" },
            {
              body: { attachmentId: "attachment-1", size: 42 },
              filename: "roadmap.pdf",
              mimeType: "application/pdf",
            },
          ],
        },
        snippet: "private preview",
        threadId: "thread-1",
      },
    ],
  });

  assert.equal(row.subject, "Roadmap");
  assert.equal(row.snippet, "private preview");
  assert.equal(row.unread, true);
  assert.equal(row.important, true);
  assert.equal(row.hasCalendarEvent, true);
  assert.equal(row.attachmentCount, 1);
  assert.deepEqual(row.domains, ["example.com", "zilobase.com"]);
  assert.equal("bodyText" in row, false);
  assert.equal("bodyHtml" in row, false);
});

test("index work is bounded, resumable, history-driven, and deletion-safe", async () => {
  const source = await readFile(new URL("./mail-index.ts", import.meta.url), "utf8");

  assert.match(source, /RECENT_INBOX_SIZE = 50/);
  assert.match(source, /BACKFILL_PAGE_SIZE = 25/);
  assert.match(source, /MAX_HISTORY_PAGES_PER_ADVANCE = 5/);
  assert.match(source, /INDEX_LEASE_MS/);
  assert.match(source, /isNull\(mailIndexState\.leaseExpiresAt\)/);
  assert.match(source, /includeSpamTrash: true/);
  assert.match(source, /labelIds: \["INBOX"\]/);
  assert.match(source, /getThreads\(recentIds, "full"\)/);
  assert.match(source, /hydrationStatus, "complete"/);
  assert.match(source, /nextPageToken: page\.nextPageToken/);
  assert.match(source, /historyPageToken: pageToken/);
  assert.match(source, /ne\(mailThreadIndex\.generation, state\.generation\)/);
  assert.match(source, /error\.status !== 404/);
  assert.match(source, /delete\(mailThreadIndex\)/);
});
