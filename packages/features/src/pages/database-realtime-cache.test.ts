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
  changes: Parameters<typeof applyDatabaseMutationToPageProperties>[1]["changes"],
) {
  return {
    actorId: "user-1",
    areas: ["records" as const],
    changes,
    commandId: `command-${version}`,
    committedAt: "2026-07-14T12:00:00.000Z",
    databaseId: "database-1",
    dataSourceId: "source-1",
    eventId: `event-${version}`,
    protocolVersion: 2 as const,
    type: "database.mutation" as const,
    version,
  }
}

test("database events patch the targeted row-page properties cache", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDatabaseMutationToPageProperties(
    queryClient,
    mutation(5, { records: [{
      createdAt: "2026-07-14T12:00:00.000Z",
      dataSourceId: "source-1",
      id: "row-1",
      orderKey: "1024.0000000000",
      page: { createdAt: "2026-07-14T12:00:00.000Z", deletedAt: null, hasContent: false, id: "page-1", metadata: {}, name: "Row", updatedAt: "2026-07-14T12:00:00.000Z" },
      pageId: "page-1",
      parentRowId: null,
      updatedAt: "2026-07-14T12:00:00.000Z",
      valuesByPropertyId: { "property-status": { createdAt: "2026-07-14T12:00:00.000Z", id: "value-1", pageId: "page-1", propertyId: "property-status", updatedAt: "2026-07-14T12:00:00.000Z", value: "Done" } },
    }] }),
  )

  const payload = queryClient.getQueryData<PagePropertiesPayload>(key)
  assert.equal(payload?.databaseVersions?.["database-1"], 5)
  assert.equal(payload?.values[0]?.value, "Done")
})

test("property changes invalidate row-page properties", () => {
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

  applyDatabaseMutationToPageProperties(queryClient, {
    ...mutation(5, { removedPropertyIds: ["column-status"] }),
    areas: ["properties"],
  })
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
})

test("row-page properties invalidate on version gaps and ticket recovery", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDatabaseMutationToPageProperties(
    queryClient,
    mutation(6, {}),
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
    requiresReset: true,
  })

  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
  assert.equal(
    queryClient.getQueryData<PagePropertiesPayload>(key)
      ?.databaseVersions?.["database-1"],
    4,
  )
})
