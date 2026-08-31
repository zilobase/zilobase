import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  AiAgentOperationalLimitError,
  getAiAgentTurnStaleBefore,
  getAiAgentToolEffect,
  normalizeAiAgentErrorCode,
  readAiAgentLimits,
  summarizeAiAgentTurnInput,
} from "./agent-operations";

test("stale turn cutoff matches the configured total turn timeout", () => {
  const now = new Date("2026-08-28T00:00:00.000Z");

  assert.equal(
    getAiAgentTurnStaleBefore(now, 180_000).toISOString(),
    "2026-08-27T23:57:00.000Z",
  );
});

test("agent limits use bounded defaults and operator overrides", () => {
  const defaults = readAiAgentLimits({});
  assert.equal(defaults.dailyUsageLimitsEnabled, true);
  assert.equal(defaults.maxConcurrentTurnsPerUser, 2);
  assert.equal(defaults.maxFilesPerTurn, 5);
  assert.equal(defaults.maxOutputTokens, 8_000);
  assert.equal(defaults.maxSteps, 15);

  const overridden = readAiAgentLimits({
    AI_AGENT_DAILY_USAGE_LIMITS_ENABLED: "false",
    AI_AGENT_MAX_CONCURRENT_TURNS_PER_USER: "4",
    AI_AGENT_MAX_FILES_PER_TURN: "99",
    AI_AGENT_MAX_PROVIDER_RETRIES: "0",
    AI_AGENT_MAX_STEPS: "0",
  });
  assert.equal(overridden.dailyUsageLimitsEnabled, false);
  assert.equal(overridden.maxConcurrentTurnsPerUser, 4);
  assert.equal(overridden.maxFilesPerTurn, 5);
  assert.equal(overridden.maxRetries, 0);
  assert.equal(overridden.maxSteps, 1);
});

test("turn input audit stores counts rather than message content", () => {
  const metrics = summarizeAiAgentTurnInput(
    [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "confidential prompt" }],
      },
    ],
    ["file-1", "file-1", "file-2"],
  );

  assert.equal(metrics.inputMessageCount, 1);
  assert.equal(metrics.attachmentCount, 2);
  assert.ok(metrics.inputCharacterCount > 0);
  assert.equal("content" in metrics, false);
});

test("tool effects and failures normalize to finite audit labels", () => {
  assert.equal(getAiAgentToolEffect("searchWorkspace"), "read");
  assert.equal(getAiAgentToolEffect("analyzeDataTable"), "analysis");
  assert.equal(getAiAgentToolEffect("createDownloadableArtifact"), "artifact");
  assert.equal(getAiAgentToolEffect("updateWorkspacePage"), "write");
  assert.equal(normalizeAiAgentErrorCode(new DOMException("Stopped", "AbortError")), "cancelled");
  assert.equal(normalizeAiAgentErrorCode(new Error("request timed out")), "provider_timeout");
  assert.equal(
    normalizeAiAgentErrorCode(
      new AiAgentOperationalLimitError("quota_code", "limit", 30),
    ),
    "quota_code",
  );
});

test("operations migration stores metadata without prompt or tool payload columns", async () => {
  const migration = await readFile(
    new URL("../../../../drizzle/0054_ai_agent_operations.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE "ai_agent_turn"/);
  assert.match(migration, /CREATE TABLE "ai_agent_tool_execution"/);
  assert.match(migration, /ai_agent_turn_status_check/);
  assert.match(migration, /ai_agent_tool_execution_turn_call_unique/);
  assert.doesNotMatch(migration, /"prompt"|"tool_input"|"tool_output"/);
});
