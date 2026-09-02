import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  results: [] as unknown[][],
}));

vi.mock("./service", () => ({
  DatabaseAutomationError: class DatabaseAutomationError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) {
      super(message);
    }
  },
  getDatabaseAutomation: mocks.access,
}));

vi.mock("../../../infrastructure/database", () => ({
  db: {
    select() {
      const rows = mocks.results.shift() ?? [];
      const builder = {
        from() { return builder; },
        limit() { return Promise.resolve(rows); },
        orderBy() { return builder; },
        then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve); },
        where() { return builder; },
      };
      return builder;
    },
  },
}));

import { getDatabaseAutomationRun, listDatabaseAutomationRuns } from "./run-history";

const run = {
  automationId: "automation-1",
  errorCode: null,
  errorSummary: null,
  finishedAt: new Date("2026-01-01T00:00:02.000Z"),
  id: "run-1",
  revisionId: "revision-1",
  scheduledFor: null,
  skipReason: null,
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  status: "succeeded",
  triggerActorId: "user-1",
  triggerPageId: "page-1",
  triggerRowId: "row-1",
  triggerTime: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  mocks.access.mockReset();
  mocks.results.length = 0;
});

describe("automation run history", () => {
  it("authorizes through the owning automation and serializes run duration", async () => {
    mocks.results.push([run]);
    const result = await listDatabaseAutomationRuns({
      automationId: "automation-1",
      databaseId: "database-1",
      limit: 500,
      userId: "user-1",
    });
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ databaseId: "database-1" }));
    expect(result.runs[0]).toMatchObject({ durationMs: 2_000, id: "run-1" });
  });

  it("returns ordered, sanitized step detail", async () => {
    mocks.results.push([run], [{
      actionId: "action-1",
      actionIndex: 0,
      errorCode: null,
      errorSummary: null,
      finishedAt: new Date("2026-01-01T00:00:01.000Z"),
      id: "step-1",
      inputSummary: null,
      outputSummary: { editedRows: 1 },
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "succeeded",
    }]);
    const result = await getDatabaseAutomationRun({
      automationId: "automation-1",
      databaseId: "database-1",
      runId: "run-1",
      userId: "user-1",
    });
    expect(result.steps).toEqual([expect.objectContaining({
      durationMs: 1_000,
      outputSummary: { editedRows: 1 },
    })]);
  });

  it("does not expose a run belonging to another automation", async () => {
    mocks.results.push([]);
    await expect(getDatabaseAutomationRun({
      automationId: "automation-1",
      databaseId: "database-1",
      runId: "missing",
      userId: "user-1",
    })).rejects.toMatchObject({ code: "AUTOMATION_RUN_NOT_FOUND", status: 404 });
  });
});
