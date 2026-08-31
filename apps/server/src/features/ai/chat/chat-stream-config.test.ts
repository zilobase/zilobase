import assert from "node:assert/strict";
import { test } from "vitest";

import { AI_CHAT_STREAM_HEADERS } from "./chat-stream-config";

test("Ask AI response headers disable proxy and transform buffering", () => {
  assert.deepEqual(AI_CHAT_STREAM_HEADERS, {
    "cache-control": "no-cache, no-transform",
    "content-encoding": "identity",
    "x-accel-buffering": "no",
  });
});
