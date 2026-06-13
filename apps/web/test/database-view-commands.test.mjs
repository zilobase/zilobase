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
      activeDatabaseFilters: [],
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
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

  test("database view commands create filter config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const showFilterPillValues = []
    const filterPickerOpenValues = []
    const properties = [
      createProperty("database-property-status", "property-status", "Status", "status"),
    ]
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: {
          emoji: "pin",
          filter: {
            id: "legacy-filter",
            operator: "contains",
            propertyId: "title",
            values: ["roadmap"],
          },
        },
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
      setFilterPickerOpen: (value) => filterPickerOpenValues.push(value),
      setShowFilterPill: (value) => showFilterPillValues.push(value),
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.createDatabaseFilter("database-property-status")

    const filter = updateDatabaseView.calls[0][0].config.filters[0]

    assert.match(filter.id, /^filter-/)
    assert.deepEqual(
      {
        ...updateDatabaseView.calls[0][0],
        config: {
          ...updateDatabaseView.calls[0][0].config,
          filters: [{ ...filter, id: "filter-id" }],
        },
      },
      {
        config: {
          emoji: "pin",
          filter: undefined,
          filters: [
            {
              id: "filter-id",
              operator: "is",
              propertyId: "database-property-status",
              values: [],
            },
          ],
        },
        databaseId,
        databaseViewId: "view-1",
      }
    )
    assert.deepEqual(showFilterPillValues, [true])
    assert.deepEqual(filterPickerOpenValues, [false])
  })

  test("database view commands update filter config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const properties = [
      createProperty("database-property-status", "property-status", "Status", "status"),
    ]
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [
        {
          id: "filter-name",
          operator: "contains",
          propertyId: "name",
          values: ["roadmap"],
        },
      ],
      activeDatabaseSorts: [],
      activeView: {
        config: { emoji: "pin" },
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.updateDatabaseFilter(0, {
      propertyId: "database-property-status",
    })

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "pin",
            filter: undefined,
            filters: [
              {
                id: "filter-name",
                operator: "is",
                propertyId: "database-property-status",
                values: [],
              },
            ],
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ])
  })

  test("database view commands reorder filter config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [
        {
          id: "filter-a",
          operator: "contains",
          propertyId: "name",
          values: ["alpha"],
        },
        {
          id: "filter-b",
          operator: "contains",
          propertyId: "name",
          values: ["beta"],
        },
        {
          id: "filter-c",
          operator: "contains",
          propertyId: "name",
          values: ["charlie"],
        },
      ],
      activeDatabaseSorts: [],
      activeView: {
        config: { emoji: "pin" },
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.reorderDatabaseFilters(["filter-c", "filter-a"])

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "pin",
            filter: undefined,
            filters: [
              {
                id: "filter-c",
                operator: "contains",
                propertyId: "name",
                values: ["charlie"],
              },
              {
                id: "filter-a",
                operator: "contains",
                propertyId: "name",
                values: ["alpha"],
              },
              {
                id: "filter-b",
                operator: "contains",
                propertyId: "name",
                values: ["beta"],
              },
            ],
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ])
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
      activeDatabaseFilters: [],
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
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
      activeDatabaseFilters: [],
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
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

  test("database view commands update group config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { emoji: "📌" },
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.setViewGroupProperty("property-status")
    commands.setViewGroupProperty(null)

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: { emoji: "📌", groupPropertyId: "property-status" },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
      [
        {
          config: { emoji: "📌", groupPropertyId: undefined },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ])
  })

  test("database view commands save conditional color config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { emoji: "pin" },
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
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.saveDatabaseConditionalColors([
      {
        applyTo: "entire-row",
        color: "green",
        filter: {
          id: "conditional-filter-name",
          operator: "contains",
          propertyId: "name",
          values: ["launch"],
        },
        id: "conditional-color-name",
        style: "page-background",
      },
    ])
    commands.saveDatabaseConditionalColors([])

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            conditionalColors: [
              {
                applyTo: "entire-row",
                color: "green",
                filter: {
                  id: "conditional-filter-name",
                  operator: "contains",
                  propertyId: "name",
                  values: ["launch"],
                },
                id: "conditional-color-name",
                style: "page-background",
              },
            ],
            emoji: "pin",
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
      [
        {
          config: {
            conditionalColors: undefined,
            emoji: "pin",
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ])
  })

  test("database view commands add kanban view grouped by name without properties", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const addDatabaseView = createMutation()
    const addProperty = createMutation()
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ addDatabaseView, addProperty }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.addKanbanView()

    assert.deepEqual(addProperty.calls, [])
    assert.deepEqual(addDatabaseView.calls.map(([input]) => input), [
      {
        config: { groupPropertyId: "name", hiddenPropertyIds: [] },
        databaseId,
        name: "Kanban",
        type: "kanban",
      },
    ])
  })

  test("database view commands avoid writing read-only group values", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const addRow = createMutation()
    const updateValue = createMutation()
    const createdProperty = createProperty(
      "database-property-created",
      "property-created",
      "Created",
      "created_time"
    )
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { groupPropertyId: "property-created" },
        id: "view-1",
        name: "Kanban",
        type: "kanban",
      },
      databaseId,
      editable: true,
      isKanbanView: true,
      items: [],
      kanbanGroupProperty: createdProperty,
      mutations: createMutations({ addRow, updateValue }),
      payload: createPayload({ properties: [createdProperty] }),
      properties: [createdProperty],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.addDatabaseRow("2026-01-01T00:00:00.000Z")
    addRow.calls[0][1].onSuccess({
      rows: [{ id: "row-1" }],
    })

    assert.deepEqual(addRow.calls[0][0], {
      databaseId,
      title: "Untitled",
    })
    assert.deepEqual(updateValue.calls, [])
  })

  test("database view commands update active view type", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-commands.ts"
    )
    const updateDatabaseView = createMutation()
    const properties = [
      createProperty("database-property-1", "property-status", "Status", "status"),
    ]
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { emoji: "pin" },
        id: "view-1",
        name: "Table",
        type: "table",
      },
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: properties[0],
      mutations: createMutations({ updateDatabaseView }),
      payload: createPayload({ properties }),
      properties,
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    })

    commands.setViewType("kanban")
    commands.setViewType("table")

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: { emoji: "pin", groupPropertyId: "property-status" },
          databaseId,
          databaseViewId: "view-1",
          type: "kanban",
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
