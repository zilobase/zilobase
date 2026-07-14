import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  applyDatabaseMutationToPageProperties,
  preferNewestPagePropertiesPayload,
  recoverPagePropertiesIfBehind,
} from "./database-realtime-cache"
import {
  pagePropertiesQueryKey,
  type PagePropertiesPayload,
} from "./queries"

const initialPayload = (): PagePropertiesPayload => ({
  databaseIds: ["database-1"],
  databaseVersions: { "database-1": 4 },
  presenceTargets: [{
    databaseId: "database-1",
    propertyIds: [],
    rowId: "row-1",
  }],
  properties: [],
  values: [],
})

function mutation(
  version: number,
  delta: Parameters<typeof applyDatabaseMutationToPageProperties>[1]["delta"],
) {
  return {
    changed: ["properties" as const, "values" as const],
    committedAt: "2026-07-14T12:00:00.000Z",
    databaseId: "database-1",
    delta,
    mutationId: `mutation-${version}`,
    version,
  }
}

test("database events patch the targeted row-page properties cache", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDatabaseMutationToPageProperties(
    queryClient,
    mutation(5, {
      properties: [{
        id: "column-status",
        property: {
          createdAt: "2026-07-14T12:00:00.000Z",
          id: "property-status",
          name: "Status",
          type: "status",
          updatedAt: "2026-07-14T12:00:00.000Z",
          workspaceId: "workspace-1",
        },
      }],
      values: [{
        pageId: "page-1",
        propertyId: "property-status",
        updatedAt: "2026-07-14T12:00:00.000Z",
        value: "Done",
      }],
    }),
  )

  const payload = queryClient.getQueryData<PagePropertiesPayload>(key)
  assert.equal(payload?.databaseVersions?.["database-1"], 5)
  assert.equal(payload?.properties[0]?.name, "Status")
  assert.equal(payload?.values[0]?.value, "Done")
  assert.deepEqual(payload?.presenceTargets?.[0]?.propertyIds, [
    "property-status",
  ])
})

test("database events remove properties and their values from row pages", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData<PagePropertiesPayload>(key, {
    databaseIds: ["database-1"],
    databaseVersions: { "database-1": 4 },
    presenceTargets: [{
      databaseId: "database-1",
      propertyIds: ["property-status"],
      rowId: "row-1",
    }],
    properties: [{
      createdAt: "2026-07-14T12:00:00.000Z",
      id: "property-status",
      name: "Status",
      type: "status",
      updatedAt: "2026-07-14T12:00:00.000Z",
      workspaceId: "workspace-1",
    }],
    values: [{
      createdAt: "2026-07-14T12:00:00.000Z",
      id: "value-1",
      pageId: "page-1",
      propertyId: "property-status",
      updatedAt: "2026-07-14T12:00:00.000Z",
      value: "Done",
    }],
  })

  applyDatabaseMutationToPageProperties(
    queryClient,
    mutation(5, { removedPagePropertyIds: ["property-status"] }),
  )

  const payload = queryClient.getQueryData<PagePropertiesPayload>(key)
  assert.deepEqual(payload?.properties, [])
  assert.deepEqual(payload?.values, [])
  assert.deepEqual(payload?.presenceTargets?.[0]?.propertyIds, [])
})

test("row-page properties invalidate on version gaps and ticket recovery", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDatabaseMutationToPageProperties(
    queryClient,
    mutation(6, { values: [] }),
  )
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)

  queryClient.setQueryData(key, initialPayload())
  recoverPagePropertiesIfBehind(queryClient, "database-1", 5)
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
})

test("an older page-property response cannot replace newer realtime data", () => {
  const current = initialPayload()
  current.databaseVersions = { "database-1": 6 }
  const incoming = initialPayload()
  incoming.databaseVersions = { "database-1": 5 }

  assert.equal(preferNewestPagePropertiesPayload(current, incoming), current)
})

test("invalidate-only events refetch page properties without patching them", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDatabaseMutationToPageProperties(queryClient, {
    ...mutation(5, {}),
    requiresRefetch: true,
  })

  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
  assert.equal(
    queryClient.getQueryData<PagePropertiesPayload>(key)
      ?.databaseVersions?.["database-1"],
    4,
  )
})
