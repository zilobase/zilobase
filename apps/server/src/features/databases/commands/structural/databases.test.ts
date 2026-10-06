import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  host: vi.fn(),
  access: vi.fn(),
  graph: vi.fn(),
  placement: vi.fn(),
}));
vi.mock("../metadata-entities", () => ({ getDatabaseHostEntity: mocks.host }));
vi.mock("../../../access", () => ({ canAccessPageInWorkspace: mocks.access }));
vi.mock("../../../pages/graph/loader", () => ({ loadWorkspacePageGraph: mocks.graph }));
vi.mock("../../../pages/placements/page-item-placements", () => ({
  upsertPageItemPlacement: mocks.placement,
}));
import { databaseUpdate } from "./databases";
function fixture() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn((_patch: Record<string, unknown>) => ({ where }));
  const transaction = { update: vi.fn(() => ({ set })) };
  return {
    context: {
      actorId: "user",
      databaseId: "db",
      dataSourceId: null,
      commandId: "command",
      transaction,
    },
    transaction,
    set,
    where,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.host.mockResolvedValue({
    id: "db",
    pageId: "source",
    workspaceId: "workspace",
    config: {},
  });
  mocks.access.mockResolvedValue(true);
  mocks.graph.mockResolvedValue({ getPrimaryNestedDatabasePageIds: () => [] });
});
test("database relocation changes its primary placement and publishes the new host metadata", async () => {
  const f = fixture();
  const result = await databaseUpdate(f.context as never, {
    type: "database.update",
    patch: { pageId: "destination", expectedPageId: "source" },
  });
  expect(mocks.access).toHaveBeenCalledWith("destination", "workspace", "user", "edit");
  expect(f.transaction.update).toHaveBeenCalledTimes(2);
  expect(f.set.mock.calls[1][0]).toMatchObject({ pageId: "destination" });
  expect(mocks.placement).toHaveBeenCalledWith(
    f.transaction,
    expect.objectContaining({
      itemId: "db",
      itemKind: "database",
      parentId: "destination",
      placementKind: "primary",
    }),
  );
  expect(result.mutations[0].areas).toEqual(["databases"]);
});
test("concurrent database relocation rejects an outdated location receipt", async () => {
  const f = fixture();
  await expect(
    databaseUpdate(f.context as never, {
      type: "database.update",
      patch: { pageId: "destination", expectedPageId: "other" },
    }),
  ).rejects.toThrow("location changed");
  expect(f.transaction.update).not.toHaveBeenCalled();
});
test("database relocation denies inaccessible destinations before mutation", async () => {
  const f = fixture();
  mocks.access.mockResolvedValue(false);
  await expect(
    databaseUpdate(f.context as never, {
      type: "database.update",
      patch: { pageId: "destination", expectedPageId: "source" },
    }),
  ).rejects.toThrow("Forbidden");
  expect(f.transaction.update).not.toHaveBeenCalled();
});
test("database relocation rejects its own record pages and their descendants", async () => {
  for (const destination of ["record", "descendant"]) {
    const f = fixture();
    mocks.graph.mockResolvedValue({
      getPrimaryNestedDatabasePageIds: () => ["record", "descendant"],
    });
    await expect(
      databaseUpdate(f.context as never, {
        type: "database.update",
        patch: { pageId: destination, expectedPageId: "source" },
      }),
    ).rejects.toThrow("cycle");
    expect(f.transaction.update).not.toHaveBeenCalled();
  }
});

test("database relocation allows another child of its current host page", async () => {
  const f = fixture();
  await databaseUpdate(f.context as never, {
    type: "database.update",
    patch: { pageId: "unrelated-child", expectedPageId: "source" },
  });
  expect(f.set.mock.calls[1][0]).toMatchObject({ pageId: "unrelated-child" });
});
