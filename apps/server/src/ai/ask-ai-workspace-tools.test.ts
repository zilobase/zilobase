import assert from "node:assert/strict";
import { test } from "vitest";
import * as Y from "yjs";

import { extractPageCommentThreads } from "./ask-ai-workspace-tools";

test("page comment extraction reads and orders current collaboration comments", () => {
  const document = new Y.Doc();
  const threads = document.getMap<Y.Map<unknown>>("commentThreads");
  const thread = new Y.Map<unknown>();
  const messages = new Y.Map<Y.Map<unknown>>();
  const first = new Y.Map<unknown>();
  const second = new Y.Map<unknown>();

  first.set("author", { id: "user-1", name: "Ada" });
  first.set("body", "First comment");
  first.set("createdAt", "2026-08-26T10:00:00.000Z");
  second.set("author", { email: "grace@example.com", id: "user-2" });
  second.set("body", "Second comment");
  second.set("createdAt", "2026-08-26T11:00:00.000Z");
  messages.set("message-2", second);
  messages.set("message-1", first);
  thread.set("kind", "inline");
  thread.set("quote", "Selected text");
  thread.set("createdAt", "2026-08-26T10:00:00.000Z");
  thread.set("updatedAt", "2026-08-26T11:00:00.000Z");
  thread.set("resolvedAt", null);
  thread.set("messages", messages);
  threads.set("thread-1", thread);

  assert.deepEqual(
    extractPageCommentThreads(Y.encodeStateAsUpdate(document)),
    [{
      comments: [
        {
          author: "Ada",
          authorId: "user-1",
          body: "First comment",
          createdAt: "2026-08-26T10:00:00.000Z",
          id: "message-1",
        },
        {
          author: "grace@example.com",
          authorId: "user-2",
          body: "Second comment",
          createdAt: "2026-08-26T11:00:00.000Z",
          id: "message-2",
        },
      ],
      id: "thread-1",
      kind: "inline",
      quote: "Selected text",
      resolvedAt: null,
      updatedAt: "2026-08-26T11:00:00.000Z",
    }],
  );
});
