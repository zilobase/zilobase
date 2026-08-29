export function register({ assert, loadModule, test }) {
  test("drag payload helpers support DOMStringList-like transfer types", async () => {
    const { hasDragType } = await loadModule("/src/features/editor/drag-drop/drag-drop.ts")
    const types = {
      0: "text/plain",
      1: "application/x-zilobase-test",
      length: 2,
    }

    assert.equal(
      hasDragType({ types }, "application/x-zilobase-test"),
      true,
    )
    assert.equal(hasDragType({ types }, "text/html"), false)
    assert.equal(hasDragType(null, "text/plain"), false)
  })

  test("drag payload helpers round trip validated JSON", async () => {
    const { readDragPayload, writeDragPayload } = await loadModule(
      "/src/features/editor/drag-drop/drag-drop.ts",
    )
    const values = new Map()
    const transfer = {
      getData: (type) => values.get(type) ?? "",
      setData: (type, value) => values.set(type, value),
    }
    const payload = { id: "row-1" }
    const isPayload = (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof value.id === "string"

    writeDragPayload(transfer, "application/x-zilobase-test", payload)

    assert.deepEqual(
      readDragPayload(
        transfer,
        "application/x-zilobase-test",
        isPayload,
      ),
      payload,
    )
  })

  test("drag payload helpers use fallback only when transfer data is absent", async () => {
    const { readDragPayload } = await loadModule("/src/features/editor/drag-drop/drag-drop.ts")
    const fallback = { id: "active-row" }
    const isPayload = (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof value.id === "string"

    assert.deepEqual(readDragPayload(null, "test", isPayload, fallback), fallback)
    assert.equal(
      readDragPayload(
        { getData: () => JSON.stringify({ id: 42 }) },
        "test",
        isPayload,
        fallback,
      ),
      null,
    )
    assert.equal(
      readDragPayload(
        { getData: () => "not-json" },
        "test",
        isPayload,
        fallback,
      ),
      null,
    )
  })
}
