import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { mailThreadIndexRecord } from "./mailbox-sync-engine";

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
  const source = await readFile(new URL("./mailbox-sync-engine.ts", import.meta.url), "utf8");

  assert.match(source, /RECENT_INBOX_SIZE = 100/);
  assert.match(source, /RECENT_SENT_SIZE = 25/);
  assert.match(source, /IMMEDIATE_DRAFT_SIZE = 50/);
  assert.match(source, /BACKFILL_PAGE_SIZE = 100/);
  assert.match(source, /RECENT_INDEX_LIMIT = 2_000/);
  assert.match(source, /maxResults: 100/);
  assert.match(source, /INDEX_LEASE_MS/);
  assert.match(source, /isNull\(mailIndexState\.leaseExpiresAt\)/);
  assert.match(source, /includeSpamTrash: true/);
  assert.match(source, /labelIds: \["INBOX"\]/);
  assert.match(source, /labelIds: \["SENT"\]/);
  assert.match(source, /getThreads\(recentIds, "full"\)/);
  assert.match(source, /query: "newer_than:90d"/);
  assert.match(source, /getThreads\(missingIds, "metadata"\)/);
  assert.match(source, /mailHydrationRequest/);
  assert.match(source, /nextPageToken: page\.nextPageToken/);
  assert.match(source, /historyPageToken: pageToken/);
  assert.doesNotMatch(source, /ne\(mailThreadIndex\.generation, state\.generation\)/);
  assert.match(source, /applyMailboxLabelDelta/);
  assert.match(source, /gateway\.getMessage\(messageId, "full"\)/);
  assert.match(source, /deleteMailboxMessage/);
  assert.doesNotMatch(source, /getThread\(threadId, "metadata"\)/);
});

test("index retry delay uses bounded full jitter", async () => {
  const { mailIndexRetryMs } = await import("./mailbox-sync-engine");
  assert.equal(
    mailIndexRetryMs(1, () => 0),
    1_000,
  );
  assert.equal(
    mailIndexRetryMs(1, () => 0.5),
    2_500,
  );
  assert.equal(
    mailIndexRetryMs(20, () => 1),
    900_000,
  );
});
