import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  dispatch: vi.fn(),
  provider: vi.fn(),
  rows: [
    {
      accountId: "a",
      calendarId: "c",
      dirtyAt: new Date(0),
      data: { permissions: { read: true, freeBusyOnly: false } },
    },
  ],
}));
vi.mock("../../../infrastructure/database", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => fixture.rows }) }) }) },
}));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: fixture.dispatch,
}));
vi.mock("../provider/oauth", () => ({ createCalendarGateway: fixture.provider }));
import { recoverCalendarDispatches } from "./sync";
it("recovery publishes stable references without contacting the calendar provider", async () => {
  const env = { ZILOBASE_CELL_ID: "fixture" };
  await recoverCalendarDispatches(env);
  expect(fixture.dispatch).toHaveBeenCalledWith(env, [
    expect.objectContaining({
      kind: "calendar.sync",
      cellId: "fixture",
      resourceId: '["a","c"]',
      availableAt: new Date(0).toISOString(),
    }),
  ]);
  expect(fixture.provider).not.toHaveBeenCalled();
});
