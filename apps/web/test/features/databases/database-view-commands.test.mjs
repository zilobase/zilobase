const databaseId = "database-1";

export function register({ assert, loadModule, test }) {
  test("database view commands place an imported row in its Kanban group", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addRow = createMutation();
    const updateValue = createMutation();
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status",
    );
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { groupPropertyId: "property-status" },
        id: "view-kanban",
        name: "Kanban",
        type: "kanban",
      },
      databaseId,
      editable: true,
      getSourcePropertyMode: async () => "match",
      isKanbanView: true,
      items: [{ id: "existing-row" }],
      kanbanGroupProperty: statusProperty,
      mutations: createMutations({ addRow, updateValue }),
      payload: createPayload({ properties: [statusProperty] }),
      properties: [statusProperty],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    await commands.addDraggedPageRow(
      {
        databaseId: "source-database",
        pageId: "source-page",
        rowId: "source-row",
        title: "Imported task",
      },
      1,
      "Done",
      statusProperty,
    );
    addRow.calls[0][1].onSuccess({
      rows: [{ id: "existing-row" }, { id: "imported-row" }],
    });

    assert.deepEqual(addRow.calls[0][0], {
      databaseId,
      optimisticValues: [{ propertyId: "property-status", value: "Done" }],
      pageId: "source-page",
      position: 1,
      sourceDataSourceId: "source-database",
      sourcePropertyMode: "match",
      sourceRowId: "source-row",
      title: "Imported task",
    });
    assert.deepEqual(updateValue.calls[0][0], {
      databaseId,
      propertyId: "property-status",
      rowId: "imported-row",
      value: "Done",
    });
  });

  test("database view commands rename an imported row dropped into a name group", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addRow = createMutation();
    const updatePage = createMutation();
    const nameProperty = createProperty("name", "name", "Name", "text");
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { groupPropertyId: "name" },
        id: "view-table",
        name: "Table",
        type: "table",
      },
      databaseId,
      editable: true,
      getSourcePropertyMode: async () => "match",
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ addRow, updatePage }),
      payload: createPayload({ properties: [nameProperty] }),
      properties: [nameProperty],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    await commands.addDraggedPageRow(
      {
        databaseId: "source-database",
        pageId: "source-page",
        rowId: "source-row",
        title: "Original title",
      },
      0,
      "Renamed task",
      nameProperty,
    );
    addRow.calls[0][1].onSuccess({ rows: [{ id: "imported-row" }] });

    assert.equal(addRow.calls[0][0].title, "Renamed task");
    assert.deepEqual(updatePage.calls[0][0], {
      id: "source-page",
      name: "Renamed task",
    });
  });

  test("database view commands update sort config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const showSortPillValues = [];
    const sortPickerOpenValues = [];
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [{ column: "name", direction: "ascending" }],
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
      setShowSortPill: (value) => showSortPillValues.push(value),
      setSortPickerOpen: (value) => sortPickerOpenValues.push(value),
    });

    commands.createDatabaseSort("property-1");

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "📌",
            sorts: [
              { column: "name", direction: "ascending" },
              { column: "property-1", direction: "ascending" },
            ],
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ]);
    assert.deepEqual(showSortPillValues, [true]);
    assert.deepEqual(sortPickerOpenValues, [false]);
  });

  test("database view commands create filter config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const showFilterPillValues = [];
    const filterPickerOpenValues = [];
    const properties = [
      createProperty(
        "database-property-status",
        "property-status",
        "Status",
        "status",
      ),
    ];
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
      payload: createPayload({ properties }),
      properties,
      setActiveViewId: () => {},
      setFilterPickerOpen: (value) => filterPickerOpenValues.push(value),
      setShowFilterPill: (value) => showFilterPillValues.push(value),
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.createDatabaseFilter("database-property-status");

    const filter = updateDatabaseView.calls[0][0].config.filters[0];

    assert.match(filter.id, /^filter-/);
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
      },
    );
    assert.deepEqual(showFilterPillValues, [true]);
    assert.deepEqual(filterPickerOpenValues, [false]);
  });

  test("database view commands update filter config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const properties = [
      createProperty(
        "database-property-status",
        "property-status",
        "Status",
        "status",
      ),
    ];
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
    });

    commands.updateDatabaseFilter(0, {
      propertyId: "database-property-status",
    });

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "pin",
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
    ]);
  });

  test("database view commands reorder filter config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
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
    });

    commands.reorderDatabaseFilters(["filter-c", "filter-a"]);

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "pin",
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
    ]);
  });

  test("database view commands toggle property visibility from table defaults", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const properties = [
      createProperty("database-property-1", "property-1", "Text", "text"),
      createProperty("database-property-2", "property-2", "Hidden", "text", {
        hidden: true,
      }),
    ];
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
    });

    commands.togglePropertyVisibility("database-property-2");

    assert.deepEqual(updateDatabaseView.calls[0][0], {
      config: { hiddenPropertyIds: [] },
      databaseId,
      databaseViewId: "view-1",
    });
  });

  test("database view commands save property order config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const latestConfigs = [];
    const properties = [
      createProperty("database-property-a", "property-a", "A", "text"),
      createProperty("database-property-b", "property-b", "B", "text"),
      createProperty("database-property-c", "property-c", "C", "text"),
    ];
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
      payload: createPayload({ properties }),
      properties,
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
      setLatestViewConfig: (nextDatabaseId, viewId, config) => {
        latestConfigs.push({ config, nextDatabaseId, viewId });
      },
    });

    commands.saveDatabasePropertyOrder([
      "database-property-b",
      "name",
      "missing-property",
      "database-property-a",
      "database-property-b",
    ]);

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: {
            emoji: "pin",
            propertyOrder: [
              "database-property-b",
              "name",
              "database-property-a",
              "database-property-c",
            ],
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    ]);
    assert.deepEqual(latestConfigs, [
      {
        config: {
          emoji: "pin",
          propertyOrder: [
            "database-property-b",
            "name",
            "database-property-a",
            "database-property-c",
          ],
        },
        nextDatabaseId: databaseId,
        viewId: "view-1",
      },
    ]);
  });

  test("database view commands compose rapid property visibility toggles", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const latestConfigs = new Map();
    const properties = [
      createProperty("database-property-1", "property-1", "Text", "text"),
      createProperty("database-property-2", "property-2", "Owner", "text"),
    ];
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { hiddenPropertyIds: [] },
        id: "view-1",
        name: "Table",
        type: "table",
      },
      databaseId,
      editable: true,
      getLatestViewConfig: (nextDatabaseId, viewId, fallbackConfig) =>
        latestConfigs.get(`${nextDatabaseId}:${viewId}`) ?? fallbackConfig,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateDatabaseView }),
      payload: createPayload({ properties }),
      properties,
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setLatestViewConfig: (nextDatabaseId, viewId, config) => {
        latestConfigs.set(`${nextDatabaseId}:${viewId}`, config);
      },
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.togglePropertyVisibility("database-property-1");
    commands.togglePropertyVisibility("database-property-2");

    assert.deepEqual(
      updateDatabaseView.calls.map(([input]) => input),
      [
        {
          config: { hiddenPropertyIds: ["database-property-1"] },
          databaseId,
          databaseViewId: "view-1",
        },
        {
          config: {
            hiddenPropertyIds: ["database-property-1", "database-property-2"],
          },
          databaseId,
          databaseViewId: "view-1",
        },
      ],
    );
  });

  test("database view commands skip unchanged serialized property values", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateValue = createMutation();
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
    });

    commands.savePropertyValue("row-1", "property-1", "number", "2", "2.0");
    commands.savePropertyValue("row-1", "property-1", "number", "2", "3");

    assert.deepEqual(updateValue.calls, [
      [
        {
          databaseId,
          propertyId: "property-1",
          rowId: "row-1",
          value: 3,
        },
      ],
    ]);
  });

  test("database view commands merge property config patches", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateProperty = createMutation();
    const relationConfig = {
      pageSummaries: {
        "page-b": { id: "page-b", name: "Beta" },
      },
      relation: {
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
        syncStatus: "not_synced",
        twoWayRelation: true,
      },
    };
    const property = createProperty(
      "database-property-relation",
      "property-relation",
      "Related",
      "relation",
      relationConfig,
    );
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateProperty }),
      payload: createPayload({ properties: [property] }),
      properties: [property],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    await commands.updateDatabasePropertyConfig("database-property-relation", {
      wrapContent: true,
    });

    assert.deepEqual(updateProperty.calls[0][0], {
      config: {
        ...relationConfig,
        wrapContent: true,
      },
      databaseId,
      databasePropertyId: "database-property-relation",
    });
  });

  test("database view commands trim relation values when switching to one page", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateProperty = createMutation();
    const updateValue = createMutation();
    const relationConfig = {
      relation: {
        limit: "no_limit",
        relatedDatabaseId: "database-b",
        relatedPropertyId: "property-b",
      },
    };
    const property = createProperty(
      "database-property-relation",
      "property-relation",
      "Related",
      "relation",
      relationConfig,
    );
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateProperty, updateValue }),
      payload: createPayload({
        properties: [property],
        rows: [
          {
            id: "row-1",
            page: { id: "page-1", name: "Page 1" },
            pageId: "page-1",
          },
        ],
        values: [
          {
            pageId: "page-1",
            propertyId: "property-relation",
            value: ["page-a", "page-b"],
          },
        ],
      }),
      properties: [property],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    await commands.updateDatabasePropertyConfig("database-property-relation", {
      relation: { limit: "one_page" },
    });

    assert.deepEqual(updateValue.calls[0][0], {
      databaseId,
      propertyId: "property-relation",
      rowId: "row-1",
      value: "page-a",
    });
  });

  test("database view commands update group config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
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
    });

    commands.setViewGroupProperty("property-status");
    commands.setViewGroupProperty(null);

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
    ]);
  });

  test("database view commands save conditional color config", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
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
    });

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
    ]);
    commands.saveDatabaseConditionalColors([]);

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
    ]);
  });

  test("database view commands add kanban view grouped by name without properties", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const addProperty = createMutation();
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
    });

    commands.addKanbanView();

    assert.deepEqual(addProperty.calls, []);
    assert.deepEqual(
      addDatabaseView.calls.map(([input]) => input),
      [
        {
          config: { groupPropertyId: "name", hiddenPropertyIds: [] },
          dataSourceId: databaseId,
          databaseId,
          name: "Kanban",
          type: "kanban",
        },
      ],
    );
  });

  test("database view commands avoid writing read-only group values", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addRow = createMutation();
    const updateValue = createMutation();
    const createdProperty = createProperty(
      "database-property-created",
      "property-created",
      "Created",
      "created_time",
    );
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
    });

    commands.addDatabaseRow("2026-01-01T00:00:00.000Z");
    addRow.calls[0][1].onSuccess({
      rows: [{ id: "row-1" }],
    });

    assert.deepEqual(addRow.calls[0][0], {
      databaseId,
      title: "Untitled",
    });
    assert.deepEqual(updateValue.calls, []);
  });

  test("database view commands update active view type", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const properties = [
      createProperty(
        "database-property-1",
        "property-status",
        "Status",
        "status",
      ),
    ];
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
    });

    commands.setViewType("kanban");
    commands.setViewType("table");

    assert.deepEqual(updateDatabaseView.calls, [
      [
        {
          config: { emoji: "pin", groupPropertyId: "property-status" },
          databaseId,
          databaseViewId: "view-1",
          type: "kanban",
        },
      ],
    ]);
  });

  test("database view commands add timeline view with existing date property", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const addProperty = createMutation();
    const dateProperty = createProperty(
      "database-property-date",
      "property-date",
      "Due date",
      "date",
    );
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status",
    );
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
      payload: createPayload({ properties: [dateProperty, statusProperty] }),
      properties: [dateProperty, statusProperty],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.addTimelineView();

    assert.deepEqual(addProperty.calls, []);
    assert.deepEqual(
      addDatabaseView.calls.map(([input]) => input),
      [
        {
          config: {
            datePropertyId: "property-date",
            groupPropertyId: "property-status",
          },
          dataSourceId: databaseId,
          databaseId,
          name: "Timeline",
          type: "timeline",
        },
      ],
    );
  });

  test("database view commands add a dated row to its timeline group", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addRow = createMutation();
    const updateValue = createMutation();
    const dateProperty = createProperty(
      "database-property-date",
      "property-date",
      "Due date",
      "date",
    );
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status",
    );
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: {
          datePropertyId: "property-date",
          groupPropertyId: "property-status",
        },
        id: "view-timeline",
        name: "Timeline",
        type: "timeline",
      },
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: statusProperty,
      mutations: createMutations({ addRow, updateValue }),
      payload: createPayload({ properties: [dateProperty, statusProperty] }),
      properties: [dateProperty, statusProperty],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
      timelineDateProperty: dateProperty,
    });

    commands.addTimelineRow(
      new Date(2026, 5, 15),
      new Date(2026, 5, 20),
      "In progress",
      statusProperty,
    );
    addRow.calls[0][1].onSuccess({ rows: [{ id: "row-1" }] });

    assert.deepEqual(addRow.calls[0][0], {
      databaseId,
      optimisticValues: [
        {
          propertyId: "property-date",
          value: {
            end: "2026-06-20",
            start: "2026-06-15",
          },
        },
        {
          propertyId: "property-status",
          value: "In progress",
        },
      ],
      title: "Untitled",
    });
    assert.deepEqual(
      updateValue.calls.map(([input]) => input),
      [
        {
          databaseId,
          propertyId: "property-date",
          rowId: "row-1",
          value: {
            start: "2026-06-15",
            end: "2026-06-20",
          },
        },
        {
          databaseId,
          propertyId: "property-status",
          rowId: "row-1",
          value: "In progress",
        },
      ],
    );
  });

  test("database view commands add timeline view creates date property", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const addProperty = createMutation();
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
    });

    commands.addTimelineView();
    addProperty.calls[0][1].onSuccess({
      properties: [
        createProperty(
          "database-property-date",
          "property-date",
          "Date",
          "date",
        ),
      ],
      views: [],
    });
    addDatabaseView.calls[0][1].onSuccess({
      properties: [
        createProperty(
          "database-property-date",
          "property-date",
          "Date",
          "date",
        ),
      ],
      views: [
        {
          config: { datePropertyId: "property-date" },
          id: "view-timeline",
          name: "Timeline",
          type: "timeline",
        },
      ],
    });

    assert.deepEqual(addProperty.calls[0][0], {
      databaseId,
      name: "Date",
      type: "date",
    });
    assert.deepEqual(
      addDatabaseView.calls.map(([input]) => input),
      [
        {
          config: { datePropertyId: "property-date" },
          dataSourceId: databaseId,
          databaseId,
          name: "Timeline",
          type: "timeline",
        },
      ],
    );
  });

  test("database view commands persist chart settings in the active view", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { filters: [] },
        id: "view-chart",
        name: "Chart",
        type: "chart",
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
    });

    commands.updateDatabaseChartSettings({
      color: "purple",
      groupByPropertyId: "property-status",
      type: "pie",
    });

    assert.deepEqual(updateDatabaseView.calls[0][0], {
      config: {
        chart: {
          color: "purple",
          groupByPropertyId: "property-status",
          omitZeroValues: false,
          type: "pie",
          valueColors: {},
        },
        filters: [],
      },
      databaseId,
      databaseViewId: "view-chart",
    });
  });

  test("database view commands persist layout and page icon settings", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabase = createMutation();
    const updateDatabaseView = createMutation();
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: { filters: [] },
        id: "view-gallery",
        name: "Gallery",
        type: "gallery",
      },
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ updateDatabase, updateDatabaseView }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.updateDatabaseLayoutSettings({
      cardLayout: "list",
      cardPreview: "none",
      cardSize: "large",
      fullLinePropertyIds: ["database-property-status"],
      wrapAllContent: true,
    });
    commands.updateNameColumnConfig({ showPageIcon: false });

    assert.deepEqual(updateDatabaseView.calls[0][0], {
      config: {
        filters: [],
        layout: {
          cardLayout: "list",
          cardPreview: "none",
          cardSize: "large",
          fullLinePropertyIds: ["database-property-status"],
          showVerticalLines: true,
          wrapAllContent: true,
        },
      },
      databaseId,
      databaseViewId: "view-gallery",
    });
    assert.deepEqual(updateDatabase.calls[0][0], {
      config: { nameColumn: { showPageIcon: false } },
      databaseId,
    });
  });

  test("database view commands add a chart view", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const activeViewIds = [];
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ addDatabaseView }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: (viewId) => activeViewIds.push(viewId),
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.addChartView();
    addDatabaseView.calls[0][1].onSuccess({
      views: [{ id: "view-chart", name: "Chart", type: "chart" }],
    });

    assert.deepEqual(addDatabaseView.calls[0][0], {
      config: {
        chart: {
          color: "auto",
          omitZeroValues: false,
          type: "bar",
          valueColors: {},
        },
      },
      dataSourceId: databaseId,
      databaseId,
      name: "Chart",
      type: "chart",
    });
    assert.deepEqual(activeViewIds, ["view-chart"]);
  });

  test("database view commands do not add views when editing is locked", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const addProperty = createMutation();
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: false,
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
    });

    commands.addChartView();
    commands.addFormView([]);
    commands.addGalleryView();
    commands.addKanbanView();
    commands.addListView();
    commands.addTableView();
    commands.addTimelineView();

    assert.equal(addDatabaseView.calls.length, 0);
    assert.equal(addProperty.calls.length, 0);
  });

  test("database view commands create forms with normal view visibility", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ addDatabaseView }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.addFormView([]);
    commands.addFormView(["property-status", "property-rollup"]);

    assert.deepEqual(
      addDatabaseView.calls.map(([input]) => input),
      [
        {
          config: { hiddenPropertyIds: [] },
          dataSourceId: databaseId,
          databaseId,
          name: "Form",
          type: "form",
        },
        {
          config: {
            hiddenPropertyIds: ["property-status", "property-rollup"],
          },
          dataSourceId: databaseId,
          databaseId,
          name: "Form",
          type: "form",
        },
      ],
    );
  });

  test("database view commands persist form sharing per view", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    let latestViewConfig;
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: {
          hiddenPropertyIds: ["property-rollup"],
          formShare: {
            anonymousResponses: true,
            fillAccess: "workspace",
            submissionAccess: "none",
          },
        },
        id: "view-form",
        name: "Form",
        type: "form",
      },
      databaseId,
      editable: true,
      getLatestViewConfig: (_databaseId, _viewId, fallbackConfig) =>
        latestViewConfig ?? fallbackConfig,
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
      setLatestViewConfig: (_databaseId, _viewId, config) => {
        latestViewConfig = config;
      },
    });

    commands.updateDatabaseFormShareSettings({ anonymousResponses: false });
    commands.updateDatabaseFormShareSettings({ submissionAccess: "comment" });

    assert.deepEqual(
      updateDatabaseView.calls.map(([input]) => input),
      [
        {
          config: {
            hiddenPropertyIds: ["property-rollup"],
            formShare: {
              anonymousResponses: false,
              fillAccess: "workspace",
              submissionAccess: "none",
            },
          },
          databaseId,
          databaseViewId: "view-form",
        },
        {
          config: {
            hiddenPropertyIds: ["property-rollup"],
            formShare: {
              anonymousResponses: false,
              fillAccess: "workspace",
              submissionAccess: "comment",
            },
          },
          databaseId,
          databaseViewId: "view-form",
        },
      ],
    );
  });

  test("database view commands persist form page headers per view", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const updateDatabaseView = createMutation();
    let latestViewConfig;
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: {
        config: {
          formHeader: {
            cover: "",
            description: "",
            icon: "",
            iconPosition: "inline",
            title: "",
          },
          hiddenPropertyIds: ["property-rollup"],
        },
        id: "view-form",
        name: "Form",
        type: "form",
      },
      databaseId,
      editable: true,
      getLatestViewConfig: (_databaseId, _viewId, fallbackConfig) =>
        latestViewConfig ?? fallbackConfig,
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
      setLatestViewConfig: (_databaseId, _viewId, config) => {
        latestViewConfig = config;
      },
    });

    commands.updateDatabaseFormHeaderSettings({ title: "Project request" });
    commands.updateDatabaseFormHeaderSettings({
      description: "Tell us what you need.",
    });

    assert.deepEqual(
      updateDatabaseView.calls.map(([input]) => input.config),
      [
        {
          formHeader: {
            cover: "",
            description: "",
            icon: "",
            iconPosition: "inline",
            title: "Project request",
          },
          hiddenPropertyIds: ["property-rollup"],
        },
        {
          formHeader: {
            cover: "",
            description: "Tell us what you need.",
            icon: "",
            iconPosition: "inline",
            title: "Project request",
          },
          hiddenPropertyIds: ["property-rollup"],
        },
      ],
    );
  });

  test("database view commands add list and gallery views", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addDatabaseView = createMutation();
    const activeViewIds = [];
    const commands = getDatabaseViewCommands({
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      activeView: null,
      databaseId,
      editable: true,
      isKanbanView: false,
      items: [],
      kanbanGroupProperty: null,
      mutations: createMutations({ addDatabaseView }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: (viewId) => activeViewIds.push(viewId),
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.addListView();
    addDatabaseView.calls[0][1].onSuccess({
      views: [{ id: "view-list", name: "List", type: "list" }],
    });
    commands.addGalleryView();
    addDatabaseView.calls[1][1].onSuccess({
      views: [{ id: "view-gallery", name: "Gallery", type: "gallery" }],
    });

    assert.deepEqual(
      addDatabaseView.calls.map(([input]) => input),
      [
        { dataSourceId: databaseId, databaseId, name: "List", type: "list" },
        { dataSourceId: databaseId, databaseId, name: "Gallery", type: "gallery" },
      ],
    );
    assert.deepEqual(activeViewIds, ["view-list", "view-gallery"]);
  });

  test("database view commands persist sub-item settings and create children", async () => {
    const { getDatabaseViewCommands } = await loadModule(
      "/src/features/databases/commands/database-view-commands.ts",
    );
    const addRow = createMutation();
    const updateDatabaseView = createMutation();
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
      mutations: createMutations({ addRow, updateDatabaseView }),
      payload: createPayload(),
      properties: [],
      setActiveViewId: () => {},
      setFilterPickerOpen: () => {},
      setShowFilterPill: () => {},
      setShowSortPill: () => {},
      setSortPickerOpen: () => {},
    });

    commands.updateDatabaseSubItemsSettings({ enabled: true });
    commands.addDatabaseRow(undefined, undefined, "parent-row");

    assert.deepEqual(updateDatabaseView.calls[0][0], {
      config: {
        emoji: "pin",
        subItems: {
          display: "nested",
          enabled: true,
          filter: "parents-only",
          property: "sub-item",
        },
      },
      databaseId,
      databaseViewId: "view-1",
    });
    assert.deepEqual(addRow.calls[0][0], {
      databaseId,
      title: "Untitled",
    });
  });
}

function createMutation() {
  const calls = [];

  return {
    calls,
    isPending: false,
    mutate: (...args) => {
      calls.push(args);
    },
    mutateAsync: async (...args) => {
      calls.push(args);
    },
  };
}

function createMutations(overrides = {}) {
  return {
    addDatabaseView: createMutation(),
    addProperty: createMutation(),
    addRow: createMutation(),
    updateDatabase: createMutation(),
    updateDatabaseView: createMutation(),
    updatePage: createMutation(),
    updateProperty: createMutation(),
    updateValue: createMutation(),
    ...overrides,
  };
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
  };
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
  };
}
