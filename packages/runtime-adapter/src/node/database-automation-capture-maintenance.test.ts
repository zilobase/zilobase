import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "vitest";

const require = createRequire(import.meta.url);
const serverSrc = path.dirname(path.dirname(require.resolve("@zilobase/server/adapter-api")));

test("Node maintenance promotes closed dark-capture windows", async () => {
  const [coordinator, maintenance] = await Promise.all([
    readFile(new URL("./background-coordinator.ts", import.meta.url), "utf8"),
    readFile(path.join(serverSrc, "app/background/maintenance.ts"), "utf8"),
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
  const adapter = await readFile(path.join(serverSrc, "public/adapter-api.ts"), "utf8");
  expect(adapter).toContain("promoteClosedDatabaseAutomationEventWindows");
  expect(adapter).toContain("getDatabaseAutomationEventCaptureMetrics");
  expect(adapter).toContain("drainDatabaseAutomationEventWindows");
  expect(adapter).toContain("drainDatabaseAutomationRuns");
  expect(adapter).toContain("scanDueDatabaseAutomationSchedules");
  expect(adapter).toContain("cleanupDatabaseAutomationHistory");
  expect(adapter).toContain("getBackgroundOperationalSnapshot");
});
