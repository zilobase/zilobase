import assert from "node:assert/strict";
import { test } from "vitest";

import {
  parseZilobaseAiModes,
  readPageEmoji,
  readZilobaseAiMode,
  toZilobaseAiPageSummary,
} from "./page-ai-metadata";

test("AI page metadata accepts canonical modes and removes duplicates", () => {
  assert.deepEqual(parseZilobaseAiModes("skill, instruction, skill"), [
    "skill",
    "instruction",
  ]);
  assert.equal(readZilobaseAiMode({ zilobaseai: "skill" }), "skill");
  assert.equal(readZilobaseAiMode({ zilobaseai: "chat" }), null);
  assert.equal(readPageEmoji({ emoji: "🧠" }), "🧠");
});

test("AI page summaries expose only canonical presentation metadata", () => {
  const updatedAt = new Date("2026-01-02T03:04:05.000Z");
  assert.deepEqual(
    toZilobaseAiPageSummary({
      id: "page-1",
      metadata: { emoji: "🧠", ignored: true, zilobaseai: "instruction" },
      name: "Instructions",
      updatedAt,
      url: "instructions",
      workspaceId: "workspace-1",
    }),
    {
      id: "page-1",
      metadata: { emoji: "🧠", zilobaseai: "instruction" },
      name: "Instructions",
      updatedAt,
      url: "instructions",
      workspaceId: "workspace-1",
    },
  );
});
