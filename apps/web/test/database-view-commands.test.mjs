const databaseId = "database-1"

export function register({ assert, loadModule, test }) {
  test("database view commands update sort config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const showSortPillValues = []
    const sortPickerOpenValues = []
    const commands = getDatabaseViewCommands({
      activeDatabaseSorts: [{ column: "name", direction: "ascending" }],
      activeView: {
        config: { emoji: "📌", sort: { column: "legacy", direction: "descending" } },
        id: "view-1",
        name: "Table",
        type: "table",
      },
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateDatabaseView }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: () => {},
      setShowSortPill: (value) => showSortPillValues.push(value),
      setSortPickerOpen: (value) => sortPickerOpenValues.push(value),
    })

    commands.createDatabaseSort("property-1")

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "📌",
            sort: undefined,
            sorts: [
              { column: "name", direction: "ascending" },
              { column: "property-1", direction: "ascending" },
            ],
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ])
    assert.deepEqual(showSortPillValues, [true])
    assert.deepEqual(sortPickerOpenValues, [false])
  })

  test("database view commands toggle property visibility from table defaults", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const properties = [
      createProperty("database-property-1", "property-1", "Text", "text"),
      createProperty("database-property-2", "property-2", "Hidden", "text", {
        hidden: true,
      }),
    ]
    const commands = getDatabaseViewCommands({
      activeDatabaseSorts: [],
      activeView: {
        config: {},
        id: "view-1",
        name: "Table",
        type: "table",
      },
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateDatabaseView }),
      payload: createPayload({ properties }),
      properties,
      setActiveViewId: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.togglePropertyVisibility("database-property-2")

    assert.deepEqual(updateDatabaseView.calls[0][0], {
      config: { hiddenPropertyIds: [] },
      databaseId,
      databaseViewId: "view-1",
    })
  })

  test("database view commands skip unchanged serialized property values", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateValue = createMutation()
    const commands = getDatabaseViewCommands({
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateValue }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.savePropertyValue("row-1", "property-1", "number", "2", "2.0")
    commands.savePropertyValue("row-1", "property-1", "number", "2", "3")

    assert.deepEqual(updateValue.calls, [
      [
        {
          databaseId,
          propertyId: "property-1",
          rowId: "row-1",
          value: 3,
        },
      ],
    ])
  })
}

function createMutation() {
  const calls = []

  return {
    calls,
    isPending: false,
    mutate: (...args) => {
      calls.push(args)
    },
    mutateAsync: async (...args) => {
      calls.push(args)
    },
  }
}

function createMutations(overrides = {}) {
  return {
    addDatabaseView: createMutation(),
    addProperty: createMutation(),
    addRow: createMutation(),
    updateDatabase: createMutation(),
    updateDatabaseView: createMutation(),
    updateProperty: createMutation(),
    updateValue: createMutation(),
    ...overrides,
  }
}

function createPayload(overrides = {}) {
  return {
    database: {
      config: {},
      id: databaseId,
      name: "Roadmap",
      pageId: "database-page",
    },
    properties: [],
    rows: [],
    values: [],
    views: [],
    ...overrides,
  }
}

function createProperty(id, propertyId, name, type, config = {}) {
  return {
    id,
    position: 0,
    property: {
      config,
      id: propertyId,
      name,
      type,
    },
  }
}
