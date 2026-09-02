import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

import { planDatabaseAutomationScheduleClaim } from "./scheduler";

describe("database automation schedule claims", () => {
  test("collapses downtime to the most recent missed occurrence and one future instant", () => {
    const plan = planDatabaseAutomationScheduleClaim({
      automationId: "automation-1",
      now: new Date("2026-09-05T12:00:00Z"),
      schedule: {
        frequency: "daily",
        interval: 1,
        localTime: "09:00",
        startDate: "2026-09-01",
        timezone: "UTC",
      },
    });
    expect(plan.scheduledFor?.toISOString()).toBe("2026-09-05T09:00:00.000Z");
    expect(plan.nextRunAt?.toISOString()).toBe("2026-09-06T09:00:00.000Z");
    expect(plan.occurrenceKey).toBe("automation-1:2026-09-05T09:00:00.000Z");
  });

  test("returns no future occurrence after an end date", () => {
    const plan = planDatabaseAutomationScheduleClaim({
      automationId: "automation-1",
      now: new Date("2026-09-05T12:00:00Z"),
      schedule: {
        endDate: "2026-09-05",
        frequency: "daily",
        interval: 1,
        localTime: "09:00",
        startDate: "2026-09-01",
        timezone: "UTC",
      },
    });
    expect(plan.scheduledFor?.toISOString()).toBe("2026-09-05T09:00:00.000Z");
    expect(plan.nextRunAt).toBeNull();
  });

  test("claims due schedules transactionally with durable occurrence receipts", async () => {
    const source = await readFile(new URL("./scheduler.ts", import.meta.url), "utf8");
    expect(source).toContain('.for("update", { skipLocked: true })');
    expect(source).toContain("databaseAutomation.currentRevisionId");
    expect(source).toContain("occurrenceKey: plan.occurrenceKey");
    expect(source).toContain(".onConflictDoNothing()");
    expect(source).toContain("nextRunAt: plan.nextRunAt");
    expect(source).toContain("enqueueDatabaseAutomationRun");
  });
});
