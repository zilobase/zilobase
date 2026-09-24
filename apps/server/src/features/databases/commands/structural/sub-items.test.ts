import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  propertyEntity: vi.fn(),
  recordEntity: vi.fn(),
  upsertValues: vi.fn(),
}));

vi.mock("../../access/data-source-access", () => ({
  requireDataSourceEditAccess: mocks.access,
}));
vi.mock("../metadata-entities", () => ({
  getDatabasePropertyEntity: mocks.propertyEntity,
}));
vi.mock("../record-entity", () => ({
  getDatabaseRecordEntity: mocks.recordEntity,
}));
vi.mock("../../../pages/properties/upsert", () => ({
  upsertPagePropertyValues: mocks.upsertValues,
}));

import { ensureSubItemRelations } from "./sub-items";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.propertyEntity.mockImplementation(async (_context, id) => ({ id }));
});

test("sub-item setup creates both relation properties and returns their view config IDs", async () => {
  const selectResults = [
    [{ name: "Tasks", parentDatabaseId: "host-1", workspaceId: "workspace-1" }],
    [],
    [{ pageId: "parent-page" }, { pageId: "child-page" }],
    [],
  ];
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const transaction = {
    execute: vi.fn(),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
      },
    }),
    select: () => {
      const result = selectResults.shift() ?? [];
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        limit: async () => result,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
  const context = {
    actorId: "user-1",
    commandId: "command-1",
    databaseId: "host-1",
    dataSourceId: null,
    transaction,
  };
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000003")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000004");

  const result = await ensureSubItemRelations(context as never, "source-1", {
    subItems: { enabled: true, property: "sub-item" },
  });

  expect(mocks.access).toHaveBeenCalledWith("source-1", "user-1");
  expect(result?.config).toEqual({
    subItems: {
      enabled: true,
      parentPropertyId: "00000000-0000-4000-8000-000000000001",
      property: "sub-item",
      subItemPropertyId: "00000000-0000-4000-8000-000000000002",
    },
  });
  expect(inserts).toHaveLength(4);
  expect(inserts[0]?.values).toEqual(
    expect.objectContaining({
      name: "Parent item",
      type: "relation",
      config: expect.objectContaining({
        relation: expect.objectContaining({ limit: "one_page" }),
      }),
    }),
  );
  expect(inserts[2]?.values).toEqual(
    expect.objectContaining({
      name: "Sub-item",
      type: "relation",
      config: expect.objectContaining({
        relation: expect.objectContaining({ limit: "no_limit" }),
      }),
    }),
  );
  expect(result?.properties).toEqual([
    { id: "00000000-0000-4000-8000-000000000003" },
    { id: "00000000-0000-4000-8000-000000000004" },
  ]);
});
