import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { normalizeThreadSearch } from "./chat-persistence";
import {
  AI_AGENT_INSTRUCTIONS_MAX_CHARS,
  AI_CHAT_FEEDBACK_REASON_MAX_CHARS,
  normalizeFeedbackReason,
  normalizeInstructions,
  normalizeResponseStyle,
} from "./agent-experience";

test("agent preferences normalize bounded user input", () => {
  assert.equal(normalizeInstructions("  Keep it practical.\r\n  "), "Keep it practical.");
  assert.equal(
    normalizeInstructions("a".repeat(AI_AGENT_INSTRUCTIONS_MAX_CHARS + 10)).length,
    AI_AGENT_INSTRUCTIONS_MAX_CHARS,
  );
  assert.equal(normalizeResponseStyle("detailed"), "detailed");
  assert.equal(normalizeResponseStyle("unknown"), "concise");
});

test("feedback reasons are compact and bounded", () => {
  assert.equal(normalizeFeedbackReason("  Missing   citations  "), "Missing citations");
  assert.equal(
    normalizeFeedbackReason("x".repeat(AI_CHAT_FEEDBACK_REASON_MAX_CHARS + 5))?.length,
    AI_CHAT_FEEDBACK_REASON_MAX_CHARS,
  );
});

test("chat history search is normalized and bounded", () => {
  assert.equal(normalizeThreadSearch("  quarterly   plan  "), "quarterly plan");
  assert.equal(normalizeThreadSearch(" "), null);
  assert.equal(normalizeThreadSearch("x".repeat(100))?.length, 80);
});

test("teammate experience migration enforces durable ownership constraints", async () => {
  const migration = await readFile(
    new URL("../../../../drizzle/0053_ai_teammate_experience.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /ai_agent_user_preference_workspace_user_unique/);
  assert.match(migration, /ai_agent_user_preference_response_style_check/);
  assert.match(migration, /ai_chat_feedback_user_message_unique/);
  assert.match(migration, /ai_chat_feedback_rating_check/);
  assert.match(migration, /REFERENCES "public"\."ai_chat_message"/);
});
