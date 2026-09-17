import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  bootstrapCollectionId,
  createDatabaseClient,
  databaseBootstrapQueryKey,
} from "./index"
import type { DatabaseBootstrapResponse } from  "../core/entities"

const bootstrap: DatabaseBootstrapResponse = {
  database: {
    accessLevel: "edit",
    config: {},
    createdAt: "2026-09-14T00:00:00.000Z",
    id: "database-1",
    name: "Tasks",
    pageId: null,
    updatedAt: "2026-09-14T00:00:00.000Z",
    version: 3,
    workspaceId: "workspace-1",
  },
  dataSources: [{
    config: {},
    configVersion: 1,
    createdAt: "2026-09-14T00:00:00.000Z",
    id: "source-1",
    linkedAt: null,
    name: "Tasks",
    parentDatabaseId: "database-1",
    position: 0,
    updatedAt: "2026-09-14T00:00:00.000Z",
    version: 2,
    workspaceId: "workspace-1",
  }],
  properties: [],
  views: [],
}

test("bootstrap collections share one scoped query and materialize metadata", async () => {
  const calls: string[] = []
  const queryClient = new QueryClient()
  const client = createDatabaseClient({
    apiFetch: async (path) => {
      calls.push(path)
      return bootstrap as never
    },
    queryClient,
    sessionId: "session/one",
  })
  const scope = {
    databaseId: "database-1",
    includeDeleted: true,
    viewId: "view-1",
  }
  const collections = client.getBootstrapCollections(scope)

  await Promise.all([
    collections.database.stateWhenReady(),
    collections.dataSources.stateWhenReady(),
    collections.properties.stateWhenReady(),
    collections.views.stateWhenReady(),
  ])

  assert.deepEqual(calls, [
    "/databases/database-1/bootstrap?viewId=view-1&includeDeleted=1",
  ])
  assert.equal(collections.database.state.get("database-1")?.name, "Tasks")
  assert.equal(collections.dataSources.state.get("source-1")?.version, 2)
  assert.deepEqual(client.bootstrap(scope), {
    data: bootstrap,
    error: null,
    scope,
    status: "success",
  })
  assert.deepEqual(
    databaseBootstrapQueryKey("session/one", scope),
    [
      "database-client-v2",
      "session/one",
      "bootstrap",
      "database-1",
      "view-1",
      true,
    ],
  )
  assert.equal(
    bootstrapCollectionId("session/one", scope, "properties"),
    "database-client-v2:session%2Fone:database-1:view-1:deleted:properties",
  )
  await client.cleanup()
})

test("bootstrap collection failures surface through the facade adapter", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const client = createDatabaseClient({
    apiFetch: async () => {
      throw new Error("bootstrap unavailable")
    },
    queryClient,
    sessionId: "session-error",
  })
  const scope = { databaseId: "database-error" }
  const collections = client.getBootstrapCollections(scope)

  await collections.database.stateWhenReady()
  assert.deepEqual(client.bootstrap(scope), {
    data: undefined,
    error: new Error("bootstrap unavailable"),
    scope,
    status: "error",
  })
  await client.cleanup()
})
