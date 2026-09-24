import assert from "node:assert/strict";
import { test } from "vitest";

import { mailThreadIndexRecord } from "./mailbox-store";

test("canonical mailbox rows include searchable full-body content", () => {
  const row = mailThreadIndexRecord(
    "account-1",
    2,
    {
      id: "thread-1",
      messages: [
        {
          historyId: "12",
          id: "message-1",
          internalDate: "1788231600000",
          labelIds: ["INBOX"],
          payload: {
            body: { data: Buffer.from("quarterly forecast").toString("base64url") },
            headers: [
              { name: "From", value: "Ada <ada@example.com>" },
              { name: "Subject", value: "Planning" },
            ],
            mimeType: "text/plain",
          },
          threadId: "thread-1",
        },
      ],
    },
    true,
  );

  assert.equal(row.hydrationStatus, "complete");
  assert.match(row.searchDocument, /Planning/);
  assert.match(row.searchDocument, /quarterly forecast/);
  assert.match(row.searchDocument, /ada@example\.com/);
});
