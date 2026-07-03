export function register({ assert, loadModule, test }) {
  test("two-way relation updates the reciprocal database", async () => {
    const { getRelationReciprocalUpdates } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const updates = getRelationReciprocalUpdates({
      nextPageIds: ["page-b"],
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
      }),
      relatedDatabasePayload: payload({
        databaseId: "database-b",
        pageId: "page-b",
        propertyId: "property-b",
        rowId: "row-b",
      }),
      selectedPageIds: [],
      sourcePage: {
        id: "page-a",
        metadata: { emoji: "A" },
        name: "Alpha",
      },
    })

    assert.deepEqual(updates, [
      {
        databaseId: "database-b",
        propertyId: "property-b",
        rowId: "row-b",
        value: ["page-a"],
      },
    ])
  })

  test("two-way relation updates back from the reciprocal database", async () => {
    const { getRelationReciprocalUpdates } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const updates = getRelationReciprocalUpdates({
      nextPageIds: ["page-a"],
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-a",
        relatedPropertyId: "property-a",
      }),
      relatedDatabasePayload: payload({
        databaseId: "database-a",
        pageId: "page-a",
        propertyId: "property-a",
        rowId: "row-a",
      }),
      selectedPageIds: [],
      sourcePage: {
        id: "page-b",
        metadata: { emoji: "B" },
        name: "Beta",
      },
    })

    assert.equal(updates[0]?.databaseId, "database-a")
    assert.equal(updates[0]?.propertyId, "property-a")
    assert.equal(updates[0]?.rowId, "row-a")
    assert.deepEqual(updates[0]?.value, ["page-b"])
  })

  test("relation without two-way enabled does not sync", async () => {
    const { getRelationReciprocalUpdates } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const updates = getRelationReciprocalUpdates({
      nextPageIds: ["page-a"],
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-a",
        relatedPropertyId: "property-a",
        twoWayRelation: false,
      }),
      relatedDatabasePayload: payload({
        databaseId: "database-a",
        pageId: "page-a",
        propertyId: "property-a",
        rowId: "row-a",
      }),
      selectedPageIds: [],
      sourcePage: { id: "page-b", name: "Beta" },
    })

    assert.deepEqual(updates, [])
  })
}

function relationConfig({
  relatedDatabaseId,
  relatedPropertyId,
  twoWayRelation = true,
}) {
  return {
    relation: {
      relatedDatabaseId,
      relatedPropertyId,
      twoWayRelation,
    },
  }
}

function payload({ databaseId, pageId, propertyId, rowId }) {
  const suffix = databaseId.endsWith("a") ? "a" : "b"

  return {
    database: { id: databaseId },
    properties: [
      {
        id: `database-property-${suffix}`,
        property: {
          config: relationConfig({
            relatedDatabaseId: suffix === "a" ? "database-b" : "database-a",
            relatedPropertyId: suffix === "a" ? "property-b" : "property-a",
          }),
          id: propertyId,
        },
      },
    ],
    rows: [{ id: rowId, pageId }],
    values: [],
  }
}
