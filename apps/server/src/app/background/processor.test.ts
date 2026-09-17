import { afterEach, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
  rows: [] as unknown[][],
  advance: vi.fn(async () => undefined),
  publish: vi.fn(async () => undefined),
  mail: vi.fn(async () => undefined),
  database: vi.fn(async () => undefined),
  navigation: vi.fn(async () => undefined),
  notification: vi.fn(async () => undefined),
}));
vi.mock("../../infrastructure/database", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => fake.rows.shift() ?? [] }) }) }) },
}));
vi.mock("../../infrastructure/background/telemetry", () => ({
  recordBackgroundCounter: vi.fn(), recordBackgroundHistogram: vi.fn(),
  runBackgroundTaskSpan: (_task: unknown, _attributes: unknown, run: () => unknown) => run(),
}));
vi.mock("../../features/ai/jobs/ai-job-handlers", () => ({ AI_JOB_HANDLERS: {} }));
vi.mock("../../features/ai/jobs/ai-jobs", () => ({ runAiJobById: vi.fn() }));
vi.mock("../../features/ai/execution/agent-run-service", () => ({ processAgentRun: vi.fn() }));
vi.mock("../../features/automations/triggers/event-evaluator", () => ({ processDatabaseAutomationEventWindow: vi.fn() }));
vi.mock("../../features/automations/execution/run-engine", () => ({ processDatabaseAutomationRun: vi.fn() }));
vi.mock("../../features/mail/query/mail-index", () => ({ advanceMailIndex: fake.advance, publishMailIndexUpdate: fake.publish }));
vi.mock("../../features/mail/database-sync/mail-database-sync-worker", () => ({ drainMailDatabaseSyncOutbox: fake.mail }));
vi.mock("../../features/databases/realtime/outbox", () => ({ drainDatabaseRealtimeOutbox: fake.database }));
vi.mock("../../features/workspaces/navigation-realtime/outbox", () => ({ drainNavigationRealtimeOutbox: fake.navigation }));
vi.mock("../../features/notifications/outbox", () => ({ drainInProductNotificationOutbox: fake.notification }));

import { processBackgroundTask } from "./processor";
import type { BackgroundTaskKind } from "../../infrastructure/background/contracts";

const run = (kind: BackgroundTaskKind) => processBackgroundTask({
  env: {}, workerId: "worker", task: {
    availableAt: "2026-01-01T00:00:00.000Z", cellId: "cell", kind, resourceId: "resource", version: 1,
  },
});

afterEach(() => { fake.rows = []; vi.clearAllMocks(); vi.useRealTimers(); });

test("mail indexing skips disconnected accounts without advancing or publishing", async () => {
  fake.rows = [[{ id: "account", status: "reconnect_required" }]];
  expect(await run("mail.index")).toEqual({ outcome: "noop" });
  expect(fake.advance).not.toHaveBeenCalled();
  expect(fake.publish).not.toHaveBeenCalled();
});

test("mail indexing publishes progress and retries until the index is ready", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  fake.rows = [[{ id: "account", status: "connected" }], [{ status: "building" }]];
  expect(await run("mail.index")).toEqual({ outcome: "retry", availableAt: "2026-01-01T00:00:05.000Z" });
  expect(fake.advance).toHaveBeenCalledWith({}, "account");
  expect(fake.publish).toHaveBeenCalledWith({}, "account");
  fake.rows = [[{ id: "account", status: "connected" }], [{ status: "ready" }]];
  expect(await run("mail.index")).toEqual({ outcome: "completed" });
});

test.each(["realtime.database", "realtime.navigation", "mail.database_sync", "notification.publish"] as const)(
  "%s retries at the persisted deadline and completes after its outbox row disappears", async (kind) => {
    fake.rows = [[{ nextAttemptAt: new Date("2026-01-01T00:01:00.000Z"), status: "pending" }]];
    expect(await run(kind)).toEqual({ outcome: "retry", availableAt: "2026-01-01T00:01:00.000Z" });
    expect(await run(kind)).toEqual({ outcome: "completed" });
  },
);

test("published notifications finish while retrying mail work retains its worker identity", async () => {
  fake.rows = [[{ status: "published" }]];
  expect(await run("notification.publish")).toEqual({ outcome: "completed" });
  expect(fake.notification).toHaveBeenCalledWith({}, { limit: 1, outboxId: "resource" });
  await run("mail.database_sync");
  expect(fake.mail).toHaveBeenCalledWith({}, { limit: 1, outboxId: "resource", workerId: "worker" });
});
