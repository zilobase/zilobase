import assert from "node:assert/strict";
import { test } from "vitest";

import { hashAgentToolInput } from "./agent-action-receipts";

test("agent action input hashes are stable across object key order", async () => {
  assert.equal(
    await hashAgentToolInput({ pageId: "page-1", config: { b: 2, a: 1 } }),
    await hashAgentToolInput({ config: { a: 1, b: 2 }, pageId: "page-1" }),
  );
});

test("agent action input hashes distinguish action payloads", async () => {
  assert.notEqual(
    await hashAgentToolInput({ value: "draft" }),
    await hashAgentToolInput({ value: "sent" }),
  );
});
