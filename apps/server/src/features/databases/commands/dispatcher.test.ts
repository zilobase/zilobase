import { beforeEach, expect, test, vi } from "vitest";
import type { DatabaseCommandContext } from "./framework";
const mocks = vi.hoisted(() => ({ records: vi.fn(), clearSort: vi.fn() }));
vi.mock("./records", () => ({ dispatchRecordCommand: mocks.records }));
vi.mock("./lifecycle", () => ({ dispatchLifecycleCommand: async () => null }));
vi.mock("./structural/dispatch", () => ({ dispatchStructuralCommand: async () => null }));
vi.mock("./structural/views", () => ({ clearViewSort: mocks.clearSort }));
import { dispatchDatabaseCommand } from "./dispatcher";
const context = {
  databaseId: "host",
  dataSourceId: "source",
  actorId: "actor",
  commandId: "command",
  transaction: {},
} as DatabaseCommandContext;
beforeEach(() => {
  mocks.records.mockReset();
  mocks.clearSort.mockReset();
});

test("sort clearing and placement share one transaction context and one host event", async () => {
  mocks.records.mockResolvedValue({
    result: { id: "row" },
    mutations: [
      { databaseId: "host", dataSourceId: "source", areas: ["records"], changes: { records: [] } },
    ],
  });
  mocks.clearSort.mockResolvedValue({
    databaseId: "host",
    dataSourceId: "source",
    areas: ["views"],
    changes: { views: [] },
  });
  const result = await dispatchDatabaseCommand(context, {
    type: "row.change",
    rowId: "row",
    placement: { afterRowId: null, beforeRowId: "next" },
    clearSortViewId: "view",
  });
  expect(mocks.clearSort).toHaveBeenCalledWith(context, "view");
  expect(result.mutations).toEqual([
    {
      databaseId: "host",
      dataSourceId: "source",
      areas: ["records", "views"],
      changes: { records: [], views: [] },
    },
  ]);
  expect(result.result).toEqual({ id: "row" });
});

test("sort failure rejects the compound dispatcher so its transaction cannot commit the row", async () => {
  mocks.records.mockResolvedValue({
    result: {},
    mutations: [{ databaseId: "host", dataSourceId: "source", areas: ["records"], changes: {} }],
  });
  mocks.clearSort.mockRejectedValue(new Error("View no longer exists"));
  await expect(
    dispatchDatabaseCommand(context, { type: "row.change", rowId: "row", clearSortViewId: "view" }),
  ).rejects.toThrow("View no longer exists");
});
