import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("../../../infrastructure/database/index", () => {
  const select = () => {
    const result = Promise.resolve(state.rows.shift() ?? []);
    const chain: Record<string, unknown> = { then: result.then.bind(result) };
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit"])
      chain[method] = () => chain;
    return chain;
  };
  return { db: { select, selectDistinct: select } };
});
vi.mock("../../access/effective-access", () => ({
  canAccessDatabaseInWorkspace: async () => true,
}));
import { getPagePropertyPayload } from "./property-payload";

function seedReads() {
  const now = new Date("2026-10-24T00:00:00.000Z");
  state.rows = [
    [{ databaseId: "host", dataSourceId: "source", rowId: "row", version: 3 }],
    [
      {
        databaseId: "host",
        dataSourceId: "source",
        property: {
          id: "person",
          workspaceId: "workspace",
          name: "Person",
          type: "person",
          config: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deletedById: null,
          searchRevision: "42",
          futureInternalColumn: "private",
        },
      },
    ],
    [
      {
        id: "value",
        pageId: "page",
        propertyId: "person",
        value: [],
        createdAt: now,
        updatedAt: now,
        searchRevision: "99",
        futureInternalColumn: "private",
      },
    ],
  ];
}
beforeEach(seedReads);

test("page property responses project public fields without leaking storage revisions", async () => {
  const payload = JSON.parse(
    JSON.stringify(await getPagePropertyPayload("page", "workspace", "actor")),
  );
  for (const entity of [...payload.properties, ...payload.values]) {
    assert.equal("searchRevision" in entity, false);
    assert.equal("futureInternalColumn" in entity, false);
  }
  assert.deepEqual(payload.properties, [
    {
      id: "person",
      workspaceId: "workspace",
      name: "Person",
      type: "person",
      config: {},
      createdAt: "2026-10-24T00:00:00.000Z",
      updatedAt: "2026-10-24T00:00:00.000Z",
      deletedAt: null,
      deletedById: null,
    },
  ]);
  assert.deepEqual(payload.values, [
    {
      id: "value",
      pageId: "page",
      propertyId: "person",
      value: [],
      createdAt: "2026-10-24T00:00:00.000Z",
      updatedAt: "2026-10-24T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(payload.presenceTargets, [
    {
      databaseId: "host",
      dataSourceId: "source",
      rowId: "row",
      propertyIds: ["person"],
    },
  ]);
  assert.deepEqual(payload.databaseVersions, { host: 3 });
});

test("page metadata ignores legacy verification text and returns canonical trust", async () => {
  const propertyRow = state.rows[1]![0] as { property: { type: string } };
  propertyRow.property.type = "verification";
  (state.rows[2]![0] as { value: unknown }).value = "Verified";
  state.rows.push([
    {
      id: "page",
      createdAt: new Date("2026-01-01"),
      verifiedAt: null,
      verificationUpdatedAt: new Date("2026-02-01"),
    },
  ]);
  const payload = await getPagePropertyPayload("page", "workspace", "actor");
  assert.equal(payload.values.length, 1);
  assert.deepEqual(payload.values[0]?.value, {
    state: "unverified",
    verifiedAt: null,
    verifiedById: null,
    expiresAt: null,
    revision: "2026-02-01T00:00:00.000Z",
  });
});
