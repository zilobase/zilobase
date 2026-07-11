export function register({ assert, loadModule, test }) {
  test("database kanban config allows new groups only for creatable group types", async () => {
    const {
      canCreateKanbanGroup,
      canMoveRowsAcrossKanbanGroups,
      canUpdateKanbanGroupProperty,
    } = await loadModule(
      "/src/editor/extensions/database/views/kanban/database-kanban-config.ts"
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
