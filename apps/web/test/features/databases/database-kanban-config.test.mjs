export function register({ assert, loadModule, test }) {
  test("database kanban config allows new groups only for creatable group types", async () => {
    const {
      canCreateKanbanGroup,
      canMoveRowsAcrossKanbanGroups,
      canUpdateKanbanGroupProperty,
    } = await loadModule(
      "/src/features/databases/views/kanban/database-kanban-config.ts"
    )

    assert.equal(canCreateKanbanGroup(createProperty("name", "text")), true)
    assert.equal(canCreateKanbanGroup(createProperty("property-select", "select")), true)
    assert.equal(
      canCreateKanbanGroup(createProperty("property-multi", "multi_select")),
      true
    )
    assert.equal(canCreateKanbanGroup(createProperty("property-status", "status")), true)
    assert.equal(canCreateKanbanGroup(createProperty("property-text", "text")), true)
    assert.equal(canCreateKanbanGroup(createProperty("property-date", "date")), true)
    assert.equal(
      canCreateKanbanGroup(createProperty("property-checkbox", "checkbox")),
      false
    )
    assert.equal(
      canCreateKanbanGroup(createProperty("property-created", "created_time")),
      false
    )
    assert.equal(
      canCreateKanbanGroup(createProperty("property-edited", "edited_time")),
      false
    )
    assert.equal(canCreateKanbanGroup(createProperty("property-person", "person")), false)
    assert.equal(canCreateKanbanGroup(createProperty("property-files", "files")), false)

    assert.equal(canUpdateKanbanGroupProperty(createProperty("name", "text")), false)
    assert.equal(canMoveRowsAcrossKanbanGroups(createProperty("name", "text")), true)
    assert.equal(
      canMoveRowsAcrossKanbanGroups(createProperty("property-select", "select")),
      true
    )
    assert.equal(
      canMoveRowsAcrossKanbanGroups(createProperty("property-created", "created_time")),
      false
    )
  })

  test("database kanban drag targets card midpoints", async () => {
    const {
      getKanbanCardDropTargetIndex,
      getKanbanExternalDropPosition,
    } = await loadModule(
      "/src/features/databases/views/kanban/database-kanban-card-drag.ts"
    )
    const cards = [
      { getBoundingClientRect: () => ({ height: 40, top: 100 }) },
      { getBoundingClientRect: () => ({ height: 60, top: 140 }) },
    ]
    const column = { querySelectorAll: () => cards }

    assert.equal(getKanbanCardDropTargetIndex(column, 119), 0)
    assert.equal(getKanbanCardDropTargetIndex(column, 120), 1)
    assert.equal(getKanbanCardDropTargetIndex(column, 500), 2)
    assert.equal(
      getKanbanCardDropTargetIndex({ querySelectorAll: () => [] }, 100),
      0
    )

    const allRows = [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }]
    const columnRows = [allRows[0], allRows[2]]
    assert.equal(getKanbanExternalDropPosition(allRows, columnRows, 0), 0)
    assert.equal(getKanbanExternalDropPosition(allRows, columnRows, 1), 2)
    assert.equal(getKanbanExternalDropPosition(allRows, columnRows, 2), 3)
    assert.equal(getKanbanExternalDropPosition(allRows, [], 0), 3)
  })
}

function createProperty(propertyId, type) {
  return {
    id: propertyId === "name" ? "name" : `database-${propertyId}`,
    position: 0,
    property: {
      id: propertyId,
      name: propertyId,
      type,
    },
  }
}
