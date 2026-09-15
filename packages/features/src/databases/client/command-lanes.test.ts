import assert from "node:assert/strict"
import test from "node:test"

import {
  DatabaseCommandLanes,
  DatabaseDependentCommandCancelledError,
  databaseCommandLane,
} from "./command-lanes"

test("ordering lanes serialize and cancel unsent dependents after a failure", async () => {
  const lanes = new DatabaseCommandLanes()
  let rejectFirst: ((error: Error) => void) | undefined
  let secondStarted = false
  const first = lanes.run("ordering:source-1", true, () =>
    new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    }))
  const second = lanes.run("ordering:source-1", true, async () => {
    secondStarted = true
  })
  const firstResult = assert.rejects(first, /conflict/)
  const secondResult = assert.rejects(
    second,
    DatabaseDependentCommandCancelledError,
  )

  await Promise.resolve()
  assert.equal(secondStarted, false)
  rejectFirst?.(new Error("conflict"))
  await Promise.all([firstResult, secondResult])
  assert.equal(secondStarted, false)

  let retryStarted = false
  await lanes.run("ordering:source-1", true, async () => {
    retryStarted = true
  })
  assert.equal(retryStarted, true)
})

test("independent command lanes begin without waiting for each other", async () => {
  const lanes = new DatabaseCommandLanes()
  const resolvers: Array<() => void> = []
  const started: string[] = []
  const operation = (name: string) => lanes.run(name, false, () =>
    new Promise<void>((resolve) => {
      started.push(name)
      resolvers.push(resolve)
    }))
  const first = operation("cell:source-1:row-1:property-1")
  const second = operation("cell:source-1:row-1:property-2")

  await Promise.resolve()
  assert.deepEqual(started, [
    "cell:source-1:row-1:property-1",
    "cell:source-1:row-1:property-2",
  ])
  for (const resolve of resolvers) resolve()
  await Promise.all([first, second])
})

test("commands map to ordering structural view and cell lanes", () => {
  assert.deepEqual(databaseCommandLane({
    command: {
      afterRowId: null,
      beforeRowId: null,
      rowId: "row-1",
      type: "row.move",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  }), {
    cancelAfterFailure: true,
    key: "ordering:source-1",
  })
  assert.equal(databaseCommandLane({
    command: {
      propertyId: "property-1",
      rowId: "row-1",
      type: "cell.set",
      value: "Done",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  }).key, "cell:source-1:row-1:property-1")
  assert.equal(databaseCommandLane({
    command: {
      patch: { name: "Status" },
      propertyId: "property-1",
      type: "property.update",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  }).key, "structural:source-1")
  assert.equal(databaseCommandLane({
    command: {
      patch: { name: "Board" },
      type: "view.update",
      viewId: "view-1",
    },
    databaseId: "database-1",
  }).key, "view:database-1")
})
