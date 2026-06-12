export function register({ assert, loadModule, test }) {
  test("database view model derives kanban visibility, sorts, and rows", async () => {
    const { getDatabaseViewModel } = await loadModule(
      "/src/editor/extensions/database/shared/database-view-model.tsx"
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
          workspaceId: "page-1",
        },
        {
          propertyId: "property-priority",
          value: 1,
          workspaceId: "page-2",
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
    assert.equal(model.showPageIconInWHENTitle, false)
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
