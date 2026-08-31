import assert from "node:assert/strict";
import { test } from "vitest";

import { coerceAiChatRequestBody } from "./chat-request";

test("durable chat request coercion preserves turn identity and context", () => {
  assert.deepEqual(coerceAiChatRequestBody({
    attachmentIds: ["file-1"],
    clientMessageId: "message-1",
    clientTurnId: "11111111-1111-4111-8111-111111111111",
    contextRefs: [
      { id: "page-1", role: "primary", type: "page" },
      { id: "database-1", role: "attached", type: "database" },
    ],
    debugStream: true,
    modelId: "gpt-5.6-terra",
    threadId: "thread-1",
  }), {
    allowedPageIds: ["page-1"],
    attachmentIds: ["file-1"],
    clientTurnId: "11111111-1111-4111-8111-111111111111",
    contextRefs: [
      { id: "page-1", role: "primary", type: "page" },
      { id: "database-1", role: "attached", type: "database" },
    ],
    debugStream: true,
    mentionedUserIds: [],
    model: "gpt-5.6-terra",
    pageContext: null,
    primaryPageId: "page-1",
    threadId: "thread-1",
    userClientMessageId: "message-1",
    userId: null,
    userMessageId: "message-1",
    workspaceId: null,
  });
});
