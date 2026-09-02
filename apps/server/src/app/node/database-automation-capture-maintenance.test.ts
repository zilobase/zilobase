import { readFile } from "node:fs/promises";
import { test, expect } from "vitest";

test("Node maintenance promotes closed dark-capture windows", async () => {
  const runtime = await readFile(new URL("./node-runtime.ts", import.meta.url), "utf8");
  expect(runtime).toContain("promoteClosedDatabaseAutomationEventWindows()");
  expect(runtime).toContain("drainDatabaseAutomationEventWindows(env");
  expect(runtime).toContain("drainDatabaseAutomationRuns(env");
  expect(runtime).toContain("scanDueDatabaseAutomationSchedules(env");
  expect(runtime).toContain("nextScheduleScanAt = now + 60_000");
  expect(runtime).toContain("cleanupDatabaseAutomationHistory(env");
  expect(runtime).toContain("nextCleanupAt = now + 5 * 60_000");
  expect(runtime).toContain("getDatabaseAutomationOperationalSnapshot");
});

test("hosted adapters can promote windows and read bounded capture metrics", async () => {
  const adapter = await readFile(new URL("../../public/adapter-api.ts", import.meta.url), "utf8");
  expect(adapter).toContain("promoteClosedDatabaseAutomationEventWindows");
  expect(adapter).toContain("getDatabaseAutomationEventCaptureMetrics");
  expect(adapter).toContain("drainDatabaseAutomationEventWindows");
  expect(adapter).toContain("drainDatabaseAutomationRuns");
  expect(adapter).toContain("scanDueDatabaseAutomationSchedules");
  expect(adapter).toContain("cleanupDatabaseAutomationHistory");
  expect(adapter).toContain("getDatabaseAutomationOperationalSnapshot");
});
