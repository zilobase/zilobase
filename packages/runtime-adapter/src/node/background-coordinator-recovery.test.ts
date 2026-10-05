import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  database: vi.fn(),
  independentDatabase: vi.fn(),
  maintenance: vi.fn(),
  realtime: vi.fn(),
}));
vi.mock("@zilobase/server/node-adapter-api", () => ({
  AI_JOB_HANDLERS: {},
  advancePendingCalendars: vi.fn(),
  boundedErrorCode: () => "Error",
  createDbClientForUrl: mocks.client,
  aiJob: {},
  aiAgentRun: {},
  calendarProviderCalendar: {},
  databaseAutomationRun: {},
  databaseAutomationEventWindow: {},
  databaseRealtimeOutbox: {},
  inProductNotificationOutbox: {},
  db: {
    select: () => ({
      from: () =>
        Object.assign(Promise.resolve([]), {
          where: () => Object.assign(Promise.resolve([]), { limit: async () => [] }),
        }),
    }),
  },
  drainAgentRuns: vi.fn(),
  drainDatabaseAutomationEventWindows: vi.fn(),
  drainDatabaseAutomationRuns: vi.fn(),
  drainDatabaseRealtimeOutbox: mocks.realtime,
  drainInProductNotificationOutbox: vi.fn(),
  runAiJobBatch: vi.fn(),
  runDueBackgroundMaintenance: mocks.maintenance,
  runWithDbEnv: mocks.database,
  runWithIndependentDbEnv: mocks.independentDatabase,
}));
vi.mock("../capabilities", () => ({
  runWithRuntimePorts: (_ports: unknown, operation: () => unknown) => operation(),
}));

import { createNodeBackgroundCoordinator } from "./background-coordinator";
import type { RuntimeEnv } from "@zilobase/server/node-adapter-api";

const ports = {
  env: {
    get: () => "postgres://localhost/test",
    require: () => "postgres://localhost/test",
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.maintenance.mockReset();
  mocks.realtime.mockReset().mockResolvedValue(undefined);
  mocks.database.mockReset().mockImplementation((_env, callback) => callback());
  mocks.independentDatabase.mockReset().mockImplementation((_env, callback) => callback());
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

it("owns database scopes for background drains, maintenance and timer reads", async () => {
  mocks.database.mockImplementation(() => {
    throw new Error("Inherited request scope has closed");
  });
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv, ports);
  try {
    await coordinator.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.realtime).toHaveBeenCalledTimes(2);
    expect(mocks.maintenance).toHaveBeenCalledTimes(2);
    expect(mocks.independentDatabase).toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  } finally {
    await coordinator.stop();
  }
});

it("survives a maintenance connection timeout at startup and retries", async () => {
  mocks.maintenance.mockRejectedValueOnce(
    new Error("Connection terminated due to connection timeout"),
  );
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv, ports);
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
  mocks.maintenance
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"));
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv, ports);
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
  const coordinator = createNodeBackgroundCoordinator({} as RuntimeEnv, ports);
  try {
    await coordinator.start();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"background.node_lane_operation"'),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"operation":"database_realtime"'),
    );
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("cell value must stay private"),
    );
  } finally {
    await coordinator.stop();
  }
});
