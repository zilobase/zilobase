import { readFile } from "node:fs/promises";
import { test, expect } from "vitest";

test("Node maintenance promotes closed dark-capture windows", async () => {
  const [coordinator, maintenance] = await Promise.all([
    readFile(new URL("./background-coordinator.ts", import.meta.url), "utf8"),
    readFile(new URL("../background/maintenance.ts", import.meta.url), "utf8"),
  ]);
  expect(coordinator).toContain("drainDatabaseAutomationEventWindows(env");
  expect(coordinator).toContain("drainDatabaseAutomationRuns(env");
  expect(coordinator).toContain("zilobase_background_v1");
  expect(coordinator).toContain("30_000 + jitter");
  expect(maintenance).toContain("scanDueDatabaseAutomationSchedules(env");
  expect(maintenance).toContain("cleanupDatabaseAutomationHistory(env");
  expect(maintenance).toContain('"automation.retention": 60 * 60_000');
  expect(maintenance).toContain("getBackgroundOperationalSnapshot");
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
