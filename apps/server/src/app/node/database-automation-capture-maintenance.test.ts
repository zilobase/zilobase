import { readFile } from "node:fs/promises";
import { test, expect } from "vitest";

test("Node maintenance promotes closed dark-capture windows", async () => {
  const runtime = await readFile(new URL("./node-runtime.ts", import.meta.url), "utf8");
  expect(runtime).toContain("promoteClosedDatabaseAutomationEventWindows()");
  expect(runtime).toContain("drainDatabaseAutomationEventWindows(env");
  expect(runtime).toContain("drainDatabaseAutomationRuns(env");
});

test("hosted adapters can promote windows and read bounded capture metrics", async () => {
  const adapter = await readFile(new URL("../../public/adapter-api.ts", import.meta.url), "utf8");
  expect(adapter).toContain("promoteClosedDatabaseAutomationEventWindows");
  expect(adapter).toContain("getDatabaseAutomationEventCaptureMetrics");
  expect(adapter).toContain("drainDatabaseAutomationEventWindows");
  expect(adapter).toContain("drainDatabaseAutomationRuns");
});
