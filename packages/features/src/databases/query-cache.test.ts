import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  getDataSourcePayloadQueryEntries,
  restoreDatabasePayloadSnapshots,
  updateDataSourcePayloadQueryData,
} from "./query-cache"
import { databaseQueryKey } from "./queries"
import { createTestDatabasePayload } from "./test-helpers"

test("data source cache updates reach every host query displaying the source", () => {
  const queryClient = new QueryClient()
  const ownerKey = databaseQueryKey("database-1")
  const linkedKey = databaseQueryKey("database-2", { viewId: "linked-view" })
  const unrelatedKey = databaseQueryKey("database-3")
  const owner = createTestDatabasePayload()
  const linked = createTestDatabasePayload({
    database: { ...owner.database, id: "database-2" },
  })
  const unrelated = createTestDatabasePayload({
    activeDataSource: { ...owner.activeDataSource!, id: "data-source-2" },
    database: { ...owner.database, id: "database-3" },
  })

  queryClient.setQueryData(ownerKey, owner)
  queryClient.setQueryData(linkedKey, linked)
  queryClient.setQueryData(unrelatedKey, unrelated)

  const snapshots = updateDataSourcePayloadQueryData(
    queryClient,
    "data-source-1",
    (payload) => ({ ...payload, rows: [] }),
  )

  assert.equal(getDataSourcePayloadQueryEntries(queryClient, "data-source-1").length, 2)
  assert.equal(queryClient.getQueryData<typeof owner>(ownerKey)?.rows.length, 0)
  assert.equal(queryClient.getQueryData<typeof linked>(linkedKey)?.rows.length, 0)
  assert.equal(queryClient.getQueryData<typeof unrelated>(unrelatedKey)?.rows.length, 2)

  restoreDatabasePayloadSnapshots(queryClient, snapshots)
  assert.equal(queryClient.getQueryData<typeof owner>(ownerKey)?.rows.length, 2)
  assert.equal(queryClient.getQueryData<typeof linked>(linkedKey)?.rows.length, 2)
})
