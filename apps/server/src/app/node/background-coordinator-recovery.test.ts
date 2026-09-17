import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  database: vi.fn(),
  maintenance: vi.fn(),
  realtime: vi.fn(),
}));
vi.mock("../../infrastructure/database", () => ({
  db: { select: () => ({ from: () => Object.assign(Promise.resolve([]), { where: async () => [] }) }) },
  createDbClientForUrl: mocks.client,
  runWithDbEnv: mocks.database,
}));
vi.mock("../../infrastructure/runtime/runtime-adapter", () => ({ getDatabaseUrl: () => "postgres://localhost/test" }));
vi.mock("../background/maintenance", () => ({ runDueBackgroundMaintenance: mocks.maintenance }));
vi.mock("../../features/ai/jobs/ai-job-handlers", () => ({ AI_JOB_HANDLERS: {} }));
vi.mock("../../features/ai/jobs/ai-jobs", () => ({ runAiJobBatch: vi.fn() }));
vi.mock("../../features/ai/execution/agent-run-service", () => ({ drainAgentRuns: vi.fn() }));
vi.mock("../../features/automations/triggers/event-evaluator", () => ({ drainDatabaseAutomationEventWindows: vi.fn() }));
vi.mock("../../features/automations/execution/run-engine", () => ({ drainDatabaseAutomationRuns: vi.fn() }));
vi.mock("../../features/databases/realtime/outbox", () => ({ drainDatabaseRealtimeOutbox: mocks.realtime }));
vi.mock("../../features/mail/query/mail-index", () => ({ advancePendingMailIndexes: vi.fn() }));
vi.mock("../../features/mail/database-sync/mail-database-sync-worker", () => ({ drainMailDatabaseSyncOutbox: vi.fn() }));
vi.mock("../../features/notifications/outbox", () => ({ drainInProductNotificationOutbox: vi.fn() }));
vi.mock("../../features/workspaces/navigation-realtime/outbox", () => ({ drainNavigationRealtimeOutbox: vi.fn() }));
vi.mock("../../infrastructure/background/dispatch", () => ({ boundedErrorCode: () => "Error" }));

import { createNodeBackgroundCoordinator } from "./background-coordinator";
import type { RuntimeEnv } from "../../shared/config/config";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.maintenance.mockReset();
  mocks.realtime.mockReset().mockResolvedValue(undefined);
  mocks.database.mockReset().mockImplementation((_env, callback) => callback());
  const client = Object.assign(new EventEmitter(), {
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  });
  mocks.client.mockReturnValue({ client });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("survives a maintenance connection timeout at startup and retries", async () => {
  mocks.maintenance.mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"));
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv);
  try {
    await expect(coordinator.start()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.maintenance).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("background.node_reconcile"));
  } finally {
    await coordinator.stop();
  }
});

it("handles a periodic maintenance rejection without an unhandled promise and recovers", async () => {
  mocks.maintenance.mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"));
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv);
  try {
    await coordinator.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.maintenance).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("background.node_reconcile"));
  } finally {
    await coordinator.stop();
  }
});

it("identifies a failed database realtime drainer without logging payload values", async () => {
  mocks.realtime.mockRejectedValueOnce(new Error("cell value must stay private"));
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv);
  try {
    await coordinator.start();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(
      '"event":"background.node_lane_operation"',
    ));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(
      '"operation":"database_realtime"',
    ));
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining(
      "cell value must stay private",
    ));
  } finally {
    await coordinator.stop();
  }
});
