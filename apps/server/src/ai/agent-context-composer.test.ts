import assert from "node:assert/strict";
import { test } from "vitest";

import { composeBoundedAgentMessages } from "./agent-context-composer";

test("context composition preserves the latest user turn and compact summary", () => {
  const messages = composeBoundedAgentMessages({
    context: [{ content: "attached context", role: "user" }],
    contextWindowTokens: 8_000,
    history: [
      { content: "old question", role: "user" },
      { content: "old answer", role: "assistant" },
      { content: "latest question", role: "user" },
    ],
    maxOutputTokens: 1_000,
    summary: "Earlier, the user selected page p-1.",
    system: "stable policy",
  });

  assert.equal(messages.at(-1)?.content, "latest question");
  assert.match(String(messages[0]?.content), /page p-1/);
  assert.ok(messages.some((message) => message.content === "attached context"));
});

test("context composition truncates oversized untrusted context", () => {
  const messages = composeBoundedAgentMessages({
    context: [{ content: "x".repeat(40_000), role: "user" }],
    contextWindowTokens: 6_000,
    history: [{ content: "latest", role: "user" }],
    maxOutputTokens: 1_000,
    system: "policy",
  });
  assert.equal(messages.at(-1)?.content, "latest");
  assert.ok(String(messages[0]?.content).length < 40_000);
});
