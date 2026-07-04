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
        config: {
          ...relationConfig({
            relatedDatabaseId: "database-a",
            relatedPropertyId: "property-a",
          }),
          pageSummaries: {
            "page-a": {
              iconKind: "page",
              id: "page-a",
              metadata: { emoji: "A" },
              name: "Alpha",
            },
          },
        },
        databaseId: "database-b",
        databasePropertyId: "database-property-b",
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
    assert.equal(updates[0]?.databasePropertyId, "database-property-a")
    assert.equal(updates[0]?.propertyId, "property-a")
    assert.equal(updates[0]?.rowId, "row-a")
    assert.deepEqual(updates[0]?.value, ["page-b"])
    assert.deepEqual(updates[0]?.config?.pageSummaries?.["page-b"], {
      iconKind: "page",
      id: "page-b",
      metadata: { emoji: "B" },
      name: "Beta",
    })
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

  test("disabling two-way relation disables the reciprocal property too", async () => {
    const { getRelationTwoWayConfigUpdate } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const update = getRelationTwoWayConfigUpdate({
      nextTwoWayRelation: false,
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
    })

    assert.deepEqual(update, {
      config: relationConfig({
        relatedDatabaseId: "database-a",
        relatedPropertyId: "property-a",
        twoWayRelation: false,
      }),
      databaseId: "database-b",
      databasePropertyId: "database-property-b",
    })
  })

  test("re-enabling two-way relation only patches reciprocal config", async () => {
    const { getRelationTwoWayConfigUpdate } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )
    const relatedDatabasePayload = payload({
      databaseId: "database-b",
      pageId: "page-b",
      propertyId: "property-b",
      rowId: "row-b",
      value: ["page-old"],
    })
    relatedDatabasePayload.properties[0].property.config = relationConfig({
      relatedDatabaseId: "database-a",
      relatedPropertyId: "property-a",
      syncStatus: "not_synced",
      twoWayRelation: false,
    })

    const update = getRelationTwoWayConfigUpdate({
      nextTwoWayRelation: true,
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        twoWayRelation: false,
      }),
      relatedDatabasePayload,
    })

    assert.deepEqual(update, {
      config: relationConfig({
        relatedDatabaseId: "database-a",
        relatedPropertyId: "property-a",
        syncStatus: "not_synced",
        twoWayRelation: true,
      }),
      databaseId: "database-b",
      databasePropertyId: "database-property-b",
    })
    assert.deepEqual(relatedDatabasePayload.values, [
      {
        pageId: "page-b",
        propertyId: "property-b",
        value: ["page-old"],
      },
    ])
  })

  test("relation repair does not mark synced before payloads load", async () => {
    const { getRelationRepairMutationPlan } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const plan = getRelationRepairMutationPlan({
      databaseId: "database-a",
      databasePropertyId: "database-property-a",
      payload: undefined,
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        syncStatus: "not_synced",
      }),
      relatedDatabasePayload: payload({
        databaseId: "database-b",
        pageId: "page-b",
        propertyId: "property-b",
        rowId: "row-b",
      }),
    })

    assert.equal(plan, null)
  })

  test("relation repair plan updates rows then marks both sides synced", async () => {
    const { getRelationRepairMutationPlan } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )
    const databaseA = payload({
      databaseId: "database-a",
      pageId: "page-a",
      propertyId: "property-a",
      rowId: "row-a",
      value: ["page-b"],
    })
    const databaseB = payload({
      databaseId: "database-b",
      pageId: "page-b",
      propertyId: "property-b",
      rowId: "row-b",
      value: [],
    })
    databaseA.rows[0].page = { id: "page-a", name: "Alpha" }

    const plan = getRelationRepairMutationPlan({
      databaseId: "database-a",
      databasePropertyId: "database-property-a",
      payload: databaseA,
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        syncStatus: "not_synced",
      }),
      relatedDatabasePayload: databaseB,
    })

    assert.deepEqual(
      plan?.valueUpdates.map(({ databaseId, propertyId, rowId, value }) => ({
        databaseId,
        propertyId,
        rowId,
        value,
      })),
      [
        {
          databaseId: "database-b",
          propertyId: "property-b",
          rowId: "row-b",
          value: ["page-a"],
        },
      ]
    )
    assert.deepEqual(
      plan?.configUpdates.map(({ databaseId, databasePropertyId, config }) => ({
        databaseId,
        databasePropertyId,
        syncStatus: config.relation.syncStatus,
      })),
      [
        {
          databaseId: "database-a",
          databasePropertyId: "database-property-a",
          syncStatus: "synced",
        },
        {
          databaseId: "database-b",
          databasePropertyId: "database-property-b",
          syncStatus: "synced",
        },
      ]
    )
    assert.equal(
      plan?.configUpdates[1]?.config.pageSummaries?.["page-a"]?.name,
      "Alpha"
    )
  })

  test("relation repair plan mirrors source over related", async () => {
    const { getRelationRepairMutationPlan } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )
    const databaseA = payload({
      databaseId: "database-a",
      pageId: "page-a",
      propertyId: "property-a",
      rowId: "row-a",
      value: ["page-b"],
    })
    const databaseB = payload({
      databaseId: "database-b",
      pageId: "page-b",
      propertyId: "property-b",
      rowId: "row-b",
      value: ["page-a", "page-extra"],
    })

    const plan = getRelationRepairMutationPlan({
      databaseId: "database-a",
      databasePropertyId: "database-property-a",
      payload: databaseA,
      primarySource: "source",
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        syncStatus: "not_synced",
      }),
      relatedDatabasePayload: databaseB,
    })

    assert.deepEqual(plan?.valueUpdates, [
      {
        config: plan.valueUpdates[0].config,
        databaseId: "database-b",
        databasePropertyId: "database-property-b",
        propertyId: "property-b",
        rowId: "row-b",
        value: ["page-a"],
      },
    ])
  })

  test("relation repair plan mirrors related over source", async () => {
    const { getRelationRepairMutationPlan } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )
    const databaseA = payload({
      databaseId: "database-a",
      pageId: "page-a",
      propertyId: "property-a",
      rowId: "row-a",
      value: ["page-b"],
    })
    const databaseB = payload({
      databaseId: "database-b",
      pageId: "page-b",
      propertyId: "property-b",
      rowId: "row-b",
      value: [],
    })

    const plan = getRelationRepairMutationPlan({
      databaseId: "database-a",
      databasePropertyId: "database-property-a",
      payload: databaseA,
      primarySource: "related",
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        syncStatus: "not_synced",
      }),
      relatedDatabasePayload: databaseB,
    })

    assert.deepEqual(
      plan?.valueUpdates.map(({ databaseId, propertyId, rowId, value }) => ({
        databaseId,
        propertyId,
        rowId,
        value,
      })),
      [
        {
          databaseId: "database-a",
          propertyId: "property-a",
          rowId: "row-a",
          value: [],
        },
      ]
    )
  })

  test("relation repair skips already mirrored links", async () => {
    const { getRelationRepairMutationPlan } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const plan = getRelationRepairMutationPlan({
      databaseId: "database-a",
      databasePropertyId: "database-property-a",
      payload: payload({
        databaseId: "database-a",
        pageId: "page-a",
        propertyId: "property-a",
        rowId: "row-a",
        value: ["page-b"],
      }),
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
      }),
      relatedDatabasePayload: payload({
        databaseId: "database-b",
        pageId: "page-b",
        propertyId: "property-b",
        rowId: "row-b",
        value: ["page-a"],
      }),
    })

    assert.deepEqual(plan?.valueUpdates, [])
  })

  test("relation repair status is tracked in property config", async () => {
    const {
      getRelationConfigWithSyncStatus,
      getRelationNeedsRepair,
    } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )
    const databaseB = payload({
      databaseId: "database-b",
      pageId: "page-b",
      propertyId: "property-b",
      rowId: "row-b",
    })

    assert.equal(
      getRelationNeedsRepair({
        propertyConfig: relationConfig({
          relatedDatabaseId: "database-b",
          relatedPropertyId: "property-b",
        }),
        relatedDatabasePayload: databaseB,
      }),
      false
    )
    assert.equal(
      getRelationNeedsRepair({
        propertyConfig: relationConfig({
          relatedDatabaseId: "database-b",
          relatedPropertyId: "property-b",
          syncStatus: "not_synced",
        }),
        relatedDatabasePayload: databaseB,
      }),
      true
    )

    databaseB.properties[0].property.config = relationConfig({
      relatedDatabaseId: "database-a",
      relatedPropertyId: "property-a",
      syncStatus: "not_synced",
    })

    assert.equal(
      getRelationNeedsRepair({
        propertyConfig: relationConfig({
          relatedDatabaseId: "database-b",
          relatedPropertyId: "property-b",
        }),
        relatedDatabasePayload: databaseB,
      }),
      true
    )
    assert.deepEqual(
      getRelationConfigWithSyncStatus(
        relationConfig({
          relatedDatabaseId: "database-b",
          relatedPropertyId: "property-b",
          syncStatus: "not_synced",
        }),
        "synced"
      ).relation.syncStatus,
      "synced"
    )
  })

  test("relation repair prompt stays until both sides are marked synced", async () => {
    const {
      getRelationConfigWithSyncStatus,
      getRelationNeedsRepair,
    } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )
    const databaseB = payload({
      databaseId: "database-b",
      pageId: "page-b",
      propertyId: "property-b",
      rowId: "row-b",
    })
    const dirtySourceConfig = relationConfig({
      relatedDatabaseId: "database-b",
      relatedPropertyId: "property-b",
      syncStatus: "not_synced",
    })

    assert.equal(
      getRelationNeedsRepair({
        propertyConfig: dirtySourceConfig,
        relatedDatabasePayload: databaseB,
      }),
      true
    )

    const repairedSourceConfig = getRelationConfigWithSyncStatus(
      dirtySourceConfig,
      "synced"
    )
    const repairedRelatedConfig = getRelationConfigWithSyncStatus(
      databaseB.properties[0].property.config,
      "synced"
    )
    databaseB.properties[0].property.config = repairedRelatedConfig

    assert.equal(
      getRelationNeedsRepair({
        propertyConfig: repairedSourceConfig,
        relatedDatabasePayload: databaseB,
      }),
      false
    )
  })

  test("one-page relation limit trims existing multi values", async () => {
    const { getRelationLimitTrimUpdates } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const updates = getRelationLimitTrimUpdates({
      databasePropertyId: "database-property-a",
      payload: payload({
        databaseId: "database-a",
        pageId: "page-a",
        propertyId: "property-a",
        rowId: "row-a",
        value: ["page-b", "page-c"],
      }),
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        limit: "one_page",
      }),
    })

    assert.deepEqual(updates, [
      {
        propertyId: "property-a",
        rowId: "row-a",
        value: "page-b",
      },
    ])
  })

  test("no-limit relation keeps existing multi values", async () => {
    const { getRelationLimitTrimUpdates } = await loadModule(
      "/src/editor/extensions/database/shared/database-relation-sync.ts"
    )

    const updates = getRelationLimitTrimUpdates({
      databasePropertyId: "database-property-a",
      payload: payload({
        databaseId: "database-a",
        pageId: "page-a",
        propertyId: "property-a",
        rowId: "row-a",
        value: ["page-b", "page-c"],
      }),
      propertyConfig: relationConfig({
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        limit: "no_limit",
      }),
    })

    assert.deepEqual(updates, [])
  })
}

function relationConfig({
  limit,
  relatedDatabaseId,
  relatedPropertyId,
  syncStatus,
  twoWayRelation = true,
}) {
  const relation = {
    limit,
    relatedDatabaseId,
    relatedPropertyId,
    twoWayRelation,
  }

  if (syncStatus !== undefined) {
    relation.syncStatus = syncStatus
  }

  return { relation }
}

function payload({ databaseId, pageId, propertyId, rowId, value }) {
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
          type: "relation",
        },
      },
    ],
    rows: [{ id: rowId, pageId }],
    values:
      value === undefined
        ? []
        : [{ pageId, propertyId, value }],
  }
}
