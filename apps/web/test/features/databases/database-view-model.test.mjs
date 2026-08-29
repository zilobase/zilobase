export function register({ assert, loadModule, test }) {
  test("database view model derives kanban visibility, sorts, and rows", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/views/database-view-model.tsx"
    )
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status"
    )
    const priorityProperty = createProperty(
      "database-property-priority",
      "property-priority",
      "Priority",
      "number"
    )
    const payload = {
      database: {
        config: {
          nameColumn: {
            label: "Task",
            showPageIcon: false,
          },
        },
        id: "database-1",
        name: "Roadmap",
      },
      properties: [statusProperty, priorityProperty],
      rows: [
        createRow("row-1", "page-1", "Second", 0),
        createRow("row-2", "page-2", "First", 1),
      ],
      values: [
        {
          propertyId: "property-priority",
          value: 2,
          pageId: "page-1",
        },
        {
          propertyId: "property-priority",
          value: 1,
          pageId: "page-2",
        },
      ],
      views: [
        {
          config: {
            groupPropertyId: "property-status",
            sorts: [
              { column: "database-property-priority", direction: "ascending" },
              { column: "missing-property", direction: "descending" },
            ],
          },
          id: "view-kanban",
          name: "Board",
          type: "kanban",
        },
      ],
    }

    const model = getDatabaseViewModel({
      accessTargets: {
        members: [
          { email: "one@example.com", id: "user-1", name: "One" },
          { email: "two@example.com", id: "user-2", name: "" },
        ],
      },
      activeViewId: "view-kanban",
      currentUserId: "user-1",
      payload,
    })

    assert.equal(model.activeView?.id, "view-kanban")
    assert.equal(model.isKanbanView, true)
    assert.equal(model.titlePropertyLabel, "Task")
    assert.equal(model.showPageIconInTitle, false)
    assert.deepEqual(
      model.activeDatabaseSorts.map(({ column, direction, label }) => ({
        column,
        direction,
        label,
      })),
      [
        {
          column: "database-property-priority",
          direction: "ascending",
          label: "Priority",
        },
      ]
    )
    assert.deepEqual(
      model.addableSortFieldOptions.map((option) => option.value),
      ["name", "database-property-status"]
    )
    assert.deepEqual(
      model.activeVisibilityConfig.hiddenPropertyIds,
      ["database-property-status", "database-property-priority"]
    )
    assert.equal(model.visiblePropertyCount, 1)
    assert.equal(model.showPropertyTitles, false)
    assert.equal(
      getDatabaseViewModel({
        activeViewId: "view-kanban",
        payload: {
          ...payload,
          views: [
            {
              ...payload.views[0],
              config: {
                ...payload.views[0].config,
                hiddenPropertyIds: [
                  "database-property-status",
                  "database-property-priority",
                  "name",
                ],
                showPropertyTitles: true,
              },
            },
          ],
        },
      }).visiblePropertyCount,
      1
    )
    assert.equal(
      getDatabaseViewModel({
        activeViewId: "view-kanban",
        payload: {
          ...payload,
          views: [
            {
              ...payload.views[0],
              config: {
                ...payload.views[0].config,
                showPropertyTitles: true,
              },
            },
          ],
        },
      }).showPropertyTitles,
      true
    )
    assert.deepEqual(
      model.kanbanOptions.map((option) => option.name),
      ["Not started", "In progress", "Done"]
    )
    assert.deepEqual(
      model.personOptions.map(({ id, name, suffix }) => ({ id, name, suffix })),
      [
        { id: "user-1", name: "One", suffix: "(you)" },
        { id: "user-2", name: "two@example.com", suffix: undefined },
      ]
    )
    assert.deepEqual(
      model.sortedItems.map((item) => item.id),
      ["row-2", "row-1"]
    )
    assert.deepEqual(model.propertyValuesByKey, {
      "page-1:property-priority": "2",
      "page-1:property-status": "",
      "page-2:property-priority": "1",
      "page-2:property-status": "",
    })
  })

  test("database view model filters rows before sorting", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/views/database-view-model.tsx"
    )
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status",
      {
        options: [
          { id: "todo", name: "Not started" },
          { id: "done", name: "Done" },
        ],
      }
    )
    const priorityProperty = createProperty(
      "database-property-priority",
      "property-priority",
      "Priority",
      "number"
    )
    const payload = {
      database: {
        config: {
          nameColumn: { label: "Task" },
        },
        id: "database-1",
        name: "Roadmap",
      },
      properties: [statusProperty, priorityProperty],
      rows: [
        createRow("row-1", "page-1", "Alpha", 0),
        createRow("row-2", "page-2", "Beta", 1),
        createRow("row-3", "page-3", "Gamma", 2),
      ],
      values: [
        {
          propertyId: "property-status",
          value: "Done",
          pageId: "page-1",
        },
        {
          propertyId: "property-priority",
          value: 3,
          pageId: "page-1",
        },
        {
          propertyId: "property-status",
          value: "Not started",
          pageId: "page-2",
        },
        {
          propertyId: "property-priority",
          value: 1,
          pageId: "page-2",
        },
        {
          propertyId: "property-status",
          value: "Done",
          pageId: "page-3",
        },
        {
          propertyId: "property-priority",
          value: 2,
          pageId: "page-3",
        },
      ],
      views: [
        {
          config: {
            filters: [
              {
                id: "filter-status",
                operator: "is",
                propertyId: "database-property-status",
                values: ["Done"],
              },
            ],
            sorts: [
              {
                column: "database-property-priority",
                direction: "descending",
              },
            ],
          },
          id: "view-table",
          name: "Table",
          type: "table",
        },
      ],
    }

    const model = getDatabaseViewModel({
      activeViewId: "view-table",
      payload,
    })

    assert.deepEqual(
      model.activeDatabaseFilters.map(
        ({ label, operator, operatorLabel, propertyId, values }) => ({
          label,
          operator,
          operatorLabel,
          propertyId,
          values,
        })
      ),
      [
        {
          label: "Status",
          operator: "is",
          operatorLabel: "Is",
          propertyId: "database-property-status",
          values: ["Done"],
        },
      ]
    )
    assert.deepEqual(
      model.addableFilterFieldOptions.map((option) => option.value),
      ["name", "database-property-priority"]
    )
    assert.deepEqual(
      model.filterValueOptionsByField["database-property-status"].map(
        (option) => option.value
      ),
      ["Done", "Not started"]
    )
    assert.deepEqual(
      model.filteredItems.map((item) => item.id),
      ["row-1", "row-3"]
    )
    assert.deepEqual(
      model.sortedItems.map((item) => item.id),
      ["row-1", "row-3"]
    )
  })

  test("database view model applies table property order", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/views/database-view-model.tsx"
    )
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status"
    )
    const priorityProperty = createProperty(
      "database-property-priority",
      "property-priority",
      "Priority",
      "number"
    )
    const ownerProperty = createProperty(
      "database-property-owner",
      "property-owner",
      "Owner",
      "person"
    )
    const payload = {
      database: {
        config: {},
        id: "database-1",
        name: "Roadmap",
      },
      properties: [statusProperty, priorityProperty, ownerProperty],
      rows: [],
      values: [],
      views: [
        {
          config: {
            propertyOrder: [
              "database-property-priority",
              "name",
              "database-property-status",
            ],
          },
          id: "view-table",
          name: "Table",
          type: "table",
        },
      ],
    }

    const model = getDatabaseViewModel({
      activeViewId: "view-table",
      payload,
    })

    assert.deepEqual(
      model.visibleProperties.map((property) => property.id),
      [
        "database-property-priority",
        "database-property-status",
        "database-property-owner",
      ]
    )
  })

  test("database view model uses the latest duplicated cell value", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/views/database-view-model.tsx"
    )
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status"
    )
    const payload = {
      database: {
        config: {},
        id: "database-1",
        name: "Roadmap",
      },
      properties: [statusProperty],
      rows: [createRow("row-1", "page-1", "Alpha", 0)],
      values: [
        {
          propertyId: "property-status",
          value: "Not started",
          pageId: "page-1",
        },
        {
          propertyId: "property-status",
          value: "In progress",
          pageId: "page-1",
        },
      ],
      views: [
        {
          config: {},
          id: "view-table",
          name: "Table",
          type: "table",
        },
      ],
    }

    const model = getDatabaseViewModel({
      activeViewId: "view-table",
      payload,
    })

    assert.equal(
      model.propertyValuesByKey["page-1:property-status"],
      "In progress"
    )
  })

  test("database view model keeps name and date kanban group properties", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/views/database-view-model.tsx"
    )
    const dueProperty = createProperty(
      "database-property-due",
      "property-due",
      "Due",
      "date"
    )
    const createdProperty = createProperty(
      "database-property-created",
      "property-created",
      "Created",
      "created_time"
    )
    const payload = {
      database: {
        config: {
          nameColumn: { label: "Task" },
        },
        id: "database-1",
        name: "Roadmap",
      },
      properties: [dueProperty, createdProperty],
      rows: [createRow("row-1", "page-1", "Alpha", 0)],
      values: [
        {
          propertyId: "property-due",
          value: "2026-01-01",
          pageId: "page-1",
        },
      ],
      views: [
        {
          config: { groupPropertyId: "name" },
          id: "view-name-kanban",
          name: "By name",
          type: "kanban",
        },
        {
          config: { groupPropertyId: "property-due" },
          id: "view-date-kanban",
          name: "By due date",
          type: "kanban",
        },
        {
          config: { groupPropertyId: "property-created" },
          id: "view-created-kanban",
          name: "By created time",
          type: "kanban",
        },
      ],
    }

    const nameModel = getDatabaseViewModel({
      activeViewId: "view-name-kanban",
      payload,
    })
    const dateModel = getDatabaseViewModel({
      activeViewId: "view-date-kanban",
      payload,
    })
    const createdModel = getDatabaseViewModel({
      activeViewId: "view-created-kanban",
      payload,
    })

    assert.equal(nameModel.groupProperty?.id, "name")
    assert.equal(nameModel.kanbanGroupProperty?.id, "name")
    assert.deepEqual(nameModel.kanbanOptions, [])
    assert.equal(dateModel.groupProperty?.property.type, "date")
    assert.equal(dateModel.kanbanGroupProperty?.property.type, "date")
    assert.deepEqual(dateModel.kanbanOptions, [])
    assert.equal(createdModel.groupProperty?.property.type, "created_time")
    assert.equal(createdModel.kanbanGroupProperty?.property.type, "created_time")
    assert.deepEqual(
      createdModel.groupableProperties.map((property) => property.property.id),
      ["name", "property-due", "property-created"]
    )
  })

  test("database view model derives conditional color settings", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/views/database-view-model.tsx"
    )
    const statusProperty = createProperty(
      "database-property-status",
      "property-status",
      "Status",
      "status"
    )
    const payload = {
      database: {
        config: {},
        id: "database-1",
        name: "Roadmap",
      },
      properties: [statusProperty],
      rows: [createRow("row-1", "page-1", "Alpha", 0)],
      values: [],
      views: [
        {
          config: {
            conditionalColors: [
              {
                applyTo: "this-property",
                color: "green",
                filter: {
                  id: "conditional-filter-status",
                  operator: "is",
                  propertyId: "database-property-status",
                  values: ["Done"],
                },
                id: "conditional-color-status",
                style: "page-background",
              },
              {
                color: "red",
                filter: {
                  id: "conditional-filter-missing",
                  operator: "is",
                  propertyId: "missing-property",
                  values: ["Blocked"],
                },
                id: "conditional-color-missing",
              },
            ],
          },
          id: "view-table",
          name: "Table",
          type: "table",
        },
      ],
    }

    const model = getDatabaseViewModel({
      activeViewId: "view-table",
      payload,
    })

    assert.deepEqual(
      model.activeConditionalColors.map(({ applyTo, color, filter, id }) => ({
        applyTo,
        color,
        filter: {
          label: filter.label,
          operator: filter.operator,
          propertyId: filter.propertyId,
          propertyType: filter.propertyType,
          values: filter.values,
        },
        id,
      })),
      [
        {
          applyTo: "this-property",
          color: "green",
          filter: {
            label: "Status",
            operator: "is",
            propertyId: "database-property-status",
            propertyType: "status",
            values: ["Done"],
          },
          id: "conditional-color-status",
        },
      ]
    )
  })
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

function createRow(id, pageId, name, position) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id,
    page: {
      createdAt: "2026-01-01T00:00:00.000Z",
      name,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    pageId,
    position,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}
