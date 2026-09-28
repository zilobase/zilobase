import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSubItemRelations: vi.fn(),
  getDatabaseViewEntity: vi.fn(),
  sourceMutations: vi.fn(),
}));

vi.mock("./sub-items", () => ({ ensureSubItemRelations: mocks.ensureSubItemRelations }));
vi.mock("../metadata-entities", () => ({ getDatabaseViewEntity: mocks.getDatabaseViewEntity }));
vi.mock("../source-command-state", () => ({ sourceMutations: mocks.sourceMutations }));

import { viewUpdate } from "./views";

beforeEach(() => {
  vi.clearAllMocks();
});

test("view.update sets up sub-item properties and publishes them with the view", async () => {
  const requestedConfig = { subItems: { enabled: true } };
  const savedConfig = {
    subItems: {
      enabled: true,
      parentPropertyId: "parent-property",
      subItemPropertyId: "child-property",
    },
  };
  const entity = { id: "view-1", config: savedConfig, dataSourceId: "source-1" };
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const transaction = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "view-1",
              dataSourceId: "source-1",
            },
          ],
        }),
      }),
    })),
    update: vi.fn(() => ({ set: updateSet })),
  };
  const context = {
    actorId: "user-1",
    commandId: "command-1",
    databaseId: "host-1",
    dataSourceId: null,
    transaction,
  };
  const properties = [{ id: "parent-column" }, { id: "child-column" }];
  const records = [{ id: "row-1" }];
  mocks.ensureSubItemRelations.mockResolvedValue({
    config: savedConfig,
    properties,
    records,
  });
  mocks.getDatabaseViewEntity.mockResolvedValue(entity);
  mocks.sourceMutations.mockResolvedValue([
    {
      areas: ["properties", "records"],
      changes: { properties, records },
      databaseId: "host-1",
      dataSourceId: "source-1",
    },
    {
      areas: ["properties", "records"],
      changes: { properties, records },
      databaseId: "host-2",
      dataSourceId: "source-1",
    },
  ]);

  const result = await viewUpdate(
    context as never,
    {
      type: "view.update",
      viewId: "view-1",
      patch: {
        configuration: [{ operation: "set", path: ["subItems"], value: requestedConfig.subItems }],
      },
    } as never,
  );

  expect(mocks.ensureSubItemRelations).toHaveBeenCalledWith(context, "source-1", requestedConfig);
  expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ config: savedConfig }));
  expect(mocks.sourceMutations).toHaveBeenCalledWith(
    expect.objectContaining({ dataSourceId: "source-1" }),
    ["properties", "records"],
    expect.any(Function),
  );
  expect(result.mutations).toEqual([
    {
      areas: ["properties", "records", "views"],
      changes: { properties, records, views: [entity] },
      databaseId: "host-1",
      dataSourceId: "source-1",
    },
    {
      areas: ["properties", "records"],
      changes: { properties, records },
      databaseId: "host-2",
      dataSourceId: "source-1",
    },
  ]);
});
