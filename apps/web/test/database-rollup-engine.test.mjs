export function register({ assert, loadModule, test }) {
  test("database rollups require relation and target configuration", async () => {
    const { evaluateDatabaseRollup } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()

    const result = evaluateDatabaseRollup({
      ...context,
      propertyConfig: {},
    })

    assert.equal(result.kind, "empty")
    assert.equal(result.displayValue, "Configure rollup")
  })

  test("database rollups show original and unique values", async () => {
    const { evaluateDatabaseRollup } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()

    const original = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-category", "show_original"),
    })
    const unique = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-category", "show_unique"),
    })

    assert.equal(original.displayValue, "Design, Build, Design")
    assert.equal(unique.displayValue, "Design, Build")
  })

  test("database rollups resolve relation by page property id", async () => {
    const { evaluateDatabaseRollup, getRollupRelationProperty } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()
    const relationProperty = getRollupRelationProperty(
      [context.relationProperty],
      "property-relation"
    )
    const result = evaluateDatabaseRollup({
      ...context,
      propertyConfig: {
        rollup: {
          calculation: "show_unique",
          numberDecimalPlaces: "default",
          numberFormat: "number",
          relationPropertyId: "property-relation",
          targetPropertyId: "property-category",
        },
      },
      relationProperty,
    })

    assert.equal(result.displayValue, "Design, Build")
  })

  test("database rollup config updates persist displayed defaults", async () => {
    const { getRollupConfigUpdate } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-config.ts"
    )

    assert.deepEqual(
      getRollupConfigUpdate(
        {},
        {
          relationPropertyId: "database-property-relation",
          targetPropertyId: "name",
        },
        { calculation: "show_original" }
      ),
      {
        rollup: {
          calculation: "show_original",
          numberDecimalPlaces: "default",
          numberDisplayColor: "green",
          numberDisplayDivideBy: 100,
          numberDisplayShowNumber: true,
          numberDisplayStyle: "number",
          numberFormat: "number",
          relationPropertyId: "database-property-relation",
          targetPropertyId: "name",
        },
      }
    )
  })

  test("database rollup config updates persist number display settings", async () => {
    const { getRollupConfigUpdate } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-config.ts"
    )
    const next = getRollupConfigUpdate(
      {},
      {
        relationPropertyId: "database-property-relation",
        targetPropertyId: "property-score",
      },
      { numberDisplayStyle: "bar", numberDisplayDivideBy: 50 }
    )

    assert.equal(next.rollup.numberDisplayStyle, "bar")
    assert.equal(next.rollup.numberDisplayDivideBy, 50)
  })

  test("database rollups count and percent values", async () => {
    const { evaluateDatabaseRollup } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()

    const countEmpty = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-score", "count_empty"),
    })
    const percentNotEmpty = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-score", "percent_not_empty"),
    })

    assert.equal(countEmpty.value, 1)
    assert.equal(percentNotEmpty.value, 2 / 3)
    assert.equal(percentNotEmpty.displayValue, "67%")
  })

  test("database rollups aggregate numbers", async () => {
    const { evaluateDatabaseRollup } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()

    const sum = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-score", "sum"),
    })
    const average = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-score", "average"),
    })
    const range = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-score", "range"),
    })

    assert.equal(sum.value, 30)
    assert.equal(average.value, 15)
    assert.equal(range.value, 10)
  })

  test("database rollups aggregate dates", async () => {
    const { evaluateDatabaseRollup } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()

    const earliest = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-due", "earliest_date"),
    })
    const latest = evaluateDatabaseRollup({
      ...context,
      propertyConfig: createRollupConfig("property-due", "latest_date"),
    })

    assert.match(earliest.displayValue, /1 Jan 2026|Jan 1, 2026/)
    assert.match(latest.displayValue, /5 Jan 2026|Jan 5, 2026/)
  })

  test("database rollups exclude rollup targets", async () => {
    const { getRollupTargetProperty } = await loadModule(
      "/src/editor/extensions/database/properties/rollup/rollup-engine.ts"
    )
    const context = createRollupContext()

    assert.equal(
      getRollupTargetProperty(
        context.relatedDatabasePayload.properties,
        "property-rollup"
      ),
      null
    )
  })
}

function createRollupContext() {
  const currentRow = createRow("row-source", "page-source", "Source")
  const relationProperty = createDatabaseProperty(
    "database-property-relation",
    "property-relation",
    "Tasks",
    "relation",
    {
      relation: {
        relatedDatabaseId: "database-related",
      },
    }
  )
  const relatedDatabasePayload = {
    database: createDatabase("database-related"),
    properties: [
      createDatabaseProperty(
        "database-property-category",
        "property-category",
        "Category",
        "text"
      ),
      createDatabaseProperty(
        "database-property-score",
        "property-score",
        "Score",
        "number"
      ),
      createDatabaseProperty(
        "database-property-due",
        "property-due",
        "Due",
        "date"
      ),
      createDatabaseProperty(
        "database-property-rollup",
        "property-rollup",
        "Nested",
        "rollup"
      ),
    ],
    rowCount: 3,
    rows: [
      createRow("row-1", "page-1", "One"),
      createRow("row-2", "page-2", "Two"),
      createRow("row-3", "page-3", "Three"),
    ],
    values: [
      createValue("page-1", "property-category", "Design"),
      createValue("page-2", "property-category", "Build"),
      createValue("page-3", "property-category", "Design"),
      createValue("page-1", "property-score", 10),
      createValue("page-3", "property-score", 20),
      createValue("page-1", "property-due", "2026-01-05"),
      createValue("page-2", "property-due", "2026-01-01"),
    ],
    views: [],
  }

  return {
    currentRow,
    propertyConfig: createRollupConfig("property-category", "show_original"),
    propertyValuesByKey: {
      "page-source:property-relation": ["page-1", "page-2", "page-3"],
    },
    relatedDatabasePayload,
    relationProperty,
  }
}

function createRollupConfig(targetPropertyId, calculation) {
  return {
    rollup: {
      calculation,
      numberDecimalPlaces: "default",
      numberFormat: "number",
      relationPropertyId: "database-property-relation",
      targetPropertyId,
    },
  }
}

function createDatabase(id) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id,
    name: "Related",
    pageId: "page-database",
    updatedAt: "2026-01-01T00:00:00.000Z",
    workspaceId: "workspace-1",
  }
}

function createDatabaseProperty(databasePropertyId, propertyId, name, type, config) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    databaseId: "database-1",
    id: databasePropertyId,
    position: 0,
    property: {
      config,
      createdAt: "2026-01-01T00:00:00.000Z",
      id: propertyId,
      name,
      type,
      updatedAt: "2026-01-01T00:00:00.000Z",
      workspaceId: "workspace-1",
    },
    propertyId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    visible: true,
  }
}

function createRow(id, pageId, name) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    databaseId: "database-1",
    id,
    page: {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: pageId,
      name,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    pageId,
    position: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function createValue(pageId, propertyId, value) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: `${pageId}:${propertyId}`,
    pageId,
    propertyId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    value,
  }
}
