import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  update: vi.fn(),
  advance: vi.fn(),
  drain: vi.fn(),
  dispatch: vi.fn(),
  refresh: vi.fn(),
  queue: vi.fn(),
  watches: vi.fn(),
}));
vi.mock("../../infrastructure/database", () => ({
  db: {
    select: () => ({ from: () => ({ where: mocks.where }) }),
    update: () => ({ set: () => ({ where: mocks.update }) }),
  },
}));
vi.mock("../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: mocks.dispatch,
}));
vi.mock("./sync/sync", () => ({
  advanceCalendarSync: mocks.advance,
  queueCalendarSync: mocks.queue,
  refreshCalendarList: mocks.refresh,
}));
vi.mock("./realtime/outbox", () => ({ drainCalendarOutbox: mocks.drain }));
vi.mock("./realtime/watches", () => ({ maintainAccountWatches: mocks.watches }));
vi.mock("./provider/oauth", () => ({ createCalendarGateway: async () => ({}) }));
import { dispatchCalendarWebhook, processCalendarSyncTask } from "./background";
const env = { CALENDAR_WEBHOOK_URL: "https://api.example.test/calendar/google/webhook" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.where.mockReset();
  mocks.advance.mockResolvedValue(false);
});
test("webhook dispatch uses the existing task kind for events and calendar-list changes", async () => {
  await dispatchCalendarWebhook(env, "account", null);
  expect(mocks.dispatch).toHaveBeenCalledWith(env, [
    expect.objectContaining({ kind: "calendar.sync", resourceId: '["account",null]' }),
  ]);
});
test("event tasks publish committed revisions immediately and retain paginated retries", async () => {
  mocks.where.mockResolvedValue([{ dirtyAt: new Date() }]);
  mocks.advance.mockResolvedValueOnce(true);
  expect((await processCalendarSyncTask(env, '["account","primary"]')).outcome).toBe("retry");
  expect(mocks.advance).toHaveBeenCalledWith(env, "account", "primary");
  expect(mocks.drain).toHaveBeenCalledWith();
  expect(mocks.advance.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.drain.mock.invocationCallOrder[0]!,
  );
});
test("deleted or already processed calendar tasks do not retry forever", async () => {
  mocks.where.mockResolvedValue([]);
  expect((await processCalendarSyncTask(env, '["account","deleted"]')).outcome).toBe("completed");
  expect(mocks.advance).not.toHaveBeenCalled();
  expect((await processCalendarSyncTask(env, "invalid")).outcome).toBe("terminal");
});
test("list tasks refresh metadata, queue events, clear the durable marker and maintain coverage", async () => {
  mocks.where
    .mockResolvedValueOnce([{ id: "binding", workspaceId: "workspace" }])
    .mockResolvedValueOnce([{ id: "account", status: "connected" }]);
  mocks.refresh.mockResolvedValue([
    { id: "primary", permissions: { read: true, freeBusyOnly: false } },
    { id: "busy", permissions: { read: true, freeBusyOnly: true } },
  ]);
  expect((await processCalendarSyncTask(env, '["account",null]')).outcome).toBe("completed");
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith("account", "binding", {}, env);
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.watches).toHaveBeenCalledOnce();
  expect(mocks.drain).toHaveBeenCalledOnce();
});
