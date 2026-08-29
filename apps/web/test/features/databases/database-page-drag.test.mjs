export function register({ assert, loadModule, test }) {
  test("database page drag uses one validated payload contract", async () => {
    const {
      getDatabasePageDragPayload,
      hasDatabasePageDragPayload,
      setDatabasePageDragPayload,
    } = await loadModule(
      "/src/features/editor/extensions/database/interactions/database-page-drop.ts"
    )
    const values = new Map()
    const dataTransfer = {
      effectAllowed: "none",
      get types() {
        return [...values.keys()]
      },
      getData: (type) => values.get(type) ?? "",
      setData: (type, value) => values.set(type, value),
    }
    const payload = {
      databaseId: "database-1",
      pageId: "page-1",
      rowId: "row-1",
      title: "Project plan",
    }

    setDatabasePageDragPayload(dataTransfer, payload)

    assert.equal(dataTransfer.effectAllowed, "copyMove")
    assert.equal(dataTransfer.getData("text/plain"), payload.title)
    assert.equal(hasDatabasePageDragPayload(dataTransfer), true)
    assert.deepEqual(getDatabasePageDragPayload(dataTransfer), payload)
  })

  test("database page drag rejects malformed payloads", async () => {
    const { getDatabasePageDragPayload } = await loadModule(
      "/src/features/editor/extensions/database/interactions/database-page-drop.ts"
    )
    const dataTransfer = {
      getData: () => JSON.stringify({ pageId: 42 }),
    }

    assert.equal(getDatabasePageDragPayload(dataTransfer), null)
  })

  test("database page drops target row midpoints", async () => {
    const { getDatabasePageDropPosition } = await loadModule(
      "/src/features/editor/drag-drop/database-page-drop-target.ts",
    )
    const rows = [
      {
        getBoundingClientRect: () => ({ top: 100 }),
        offsetHeight: 40,
      },
      {
        getBoundingClientRect: () => ({ top: 140 }),
        offsetHeight: 60,
      },
    ]
    const databaseElement = { querySelectorAll: () => rows }

    assert.equal(getDatabasePageDropPosition(databaseElement, 119), 0)
    assert.equal(getDatabasePageDropPosition(databaseElement, 120), 1)
    assert.equal(getDatabasePageDropPosition(databaseElement, 170), 2)
  })

  test("database page drops target the start of an empty table", async () => {
    const { getDatabasePageDropPosition } = await loadModule(
      "/src/features/editor/drag-drop/database-page-drop-target.ts",
    )
    const databaseElement = { querySelectorAll: () => [] }

    assert.equal(getDatabasePageDropPosition(databaseElement, 500), 0)
  })
}
