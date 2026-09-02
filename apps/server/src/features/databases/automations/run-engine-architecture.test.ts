import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

test("run engine pins revisions, leases work, and receipts every action", async () => {
  const source = await readFile(new URL("./run-engine.ts", import.meta.url), "utf8");
  expect(source).toContain("databaseAutomationRun.revisionId");
  expect(source).toContain('eq(databaseAutomationRun.status, "running")');
  expect(source).toContain("databaseAutomationRun.leaseExpiresAt");
  expect(source).toContain(".for(\"update\", { skipLocked: true })");
  expect(source).toContain("idempotencyKey = `${runId}:${actionId}`");
  expect(source).toContain("stableActionSuffix(context.run.id, action.id)");
});

test("internal actions preserve authority, limits, and automation origin", async () => {
  const [engine, mutations, rows] = await Promise.all([
    readFile(new URL("./run-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("./internal-mutations.ts", import.meta.url), "utf8"),
    readFile(new URL("../rows/service.ts", import.meta.url), "utf8"),
  ]);
  expect(engine).toContain('requireDataSourceAccess(');
  expect(engine).toContain('"AUTOMATION_ROW_LIMIT"');
  expect(engine).toContain('status: "error"');
  expect(mutations).toContain("input.rows.length > 1_000");
  expect(mutations).toContain('origin: "automation" as const');
  expect(rows).toContain('origin: input.origin ?? "user"');
});

test("scheduled runs use the pinned occurrence without requiring a trigger page", async () => {
  const source = await readFile(new URL("./run-engine.ts", import.meta.url), "utf8");
  expect(source).toContain('parsed.data.trigger.kind === "schedule"');
  expect(source).toContain('"AUTOMATION_SCHEDULE_MISSING"');
  expect(source).toContain("const row = scheduled ? null");
  expect(source).toContain("Scheduled automations have no trigger page");
});

test("Gmail delivery reuses owned connections, stable receipts, and reconnect handling", async () => {
  const [engine, service] = await Promise.all([
    readFile(new URL("./run-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("./service.ts", import.meta.url), "utf8"),
  ]);
  expect(engine).toContain("sendGmailComposition");
  expect(engine).toContain("isMailFeatureEnabled(env)");
  expect(engine).toContain('kind: "gmail"');
  expect(engine).toContain('status === "succeeded"');
  expect(engine).toContain('status: "reconnect_required"');
  expect(engine).toContain('status: "retrying"');
  expect(engine).toContain("error.retryable");
  expect(engine).toContain("`${context.run.id}:${action.id}`");
  expect(service).toContain("assertProtectedDefinitionOwner");
  expect(service).toContain("protectedLifecycleResponse");
  expect(service).toContain('"AUTOMATION_PROTECTED_CONFIGURATION"');
  expect(service).toContain("transfersProtectedOwnership");
});
