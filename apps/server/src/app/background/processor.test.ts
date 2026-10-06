import { afterEach, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
  rows: [] as unknown[][],
  publish: vi.fn(async () => undefined),
  database: vi.fn(async () => undefined),
  navigation: vi.fn(async () => undefined),
  notification: vi.fn(async () => undefined),
}));
vi.mock("../../infrastructure/database", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => fake.rows.shift() ?? [] }) }),
    }),
  },
}));
vi.mock("../../infrastructure/background/telemetry", () => ({
  recordBackgroundCounter: vi.fn(),
  recordBackgroundHistogram: vi.fn(),
  runBackgroundTaskSpan: (_task: unknown, _attributes: unknown, run: () => unknown) => run(),
}));
vi.mock("../../features/ai/jobs/ai-job-handlers", () => ({ AI_JOB_HANDLERS: {} }));
vi.mock("../../features/ai/jobs/ai-jobs", () => ({ runAiJobById: vi.fn() }));
vi.mock("../../features/ai/execution/agent-run-service", () => ({ processAgentRun: vi.fn() }));
vi.mock("../../features/automations/triggers/event-evaluator", () => ({
  processDatabaseAutomationEventWindow: vi.fn(),
}));
vi.mock("../../features/automations/execution/run-engine", () => ({
  processDatabaseAutomationRun: vi.fn(),
}));
vi.mock("../../features/databases/realtime/outbox", () => ({
  drainDatabaseRealtimeOutbox: fake.database,
}));

vi.mock("../../features/notifications/outbox", () => ({
  drainInProductNotificationOutbox: fake.notification,
}));

import { processBackgroundTask } from "./processor";
import type { BackgroundTaskKind } from "../../infrastructure/background/contracts";

const run = (kind: BackgroundTaskKind) =>
  processBackgroundTask({
    env: {},
    workerId: "worker",
    task: {
      availableAt: "2026-01-01T00:00:00.000Z",
      cellId: "cell",
      kind,
      resourceId: "resource",
      taskId: "00000000-0000-4000-8000-000000000001",
      version: 2,
    },
  });

afterEach(() => {
  fake.rows = [];
  vi.clearAllMocks();
  vi.useRealTimers();
});

test.each(["realtime.database", "notification.publish"] as const)(
  "%s retries at the persisted deadline and completes after its outbox row disappears",
  async (kind) => {
    fake.rows = [[{ nextAttemptAt: new Date("2026-01-01T00:01:00.000Z"), status: "pending" }]];
    expect(await run(kind)).toEqual({ outcome: "retry", availableAt: "2026-01-01T00:01:00.000Z" });
    expect(await run(kind)).toEqual({ outcome: "completed" });
  },
);

test("published notifications finish", async () => {
  fake.rows = [[{ status: "published" }]];
  expect(await run("notification.publish")).toEqual({ outcome: "completed" });
  expect(fake.notification).toHaveBeenCalledWith({}, { limit: 1, outboxId: "resource" });
});
