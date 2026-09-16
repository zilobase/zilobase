import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  applyDataSourceMutationToPageProperties,
  preferNewestPagePropertiesPayload,
  recoverPagePropertiesIfSourceBehind,
} from "./database-realtime-cache"
import {
  pagePropertiesQueryKey,
  type PagePropertiesPayload,
} from "./queries"

const initialPayload = (): PagePropertiesPayload => ({
  presenceTargets: [{
    propertyIds: [],
    rowId: "row-1",
    sourceId: "source-1",
  }],
  properties: [],
  sourceIds: ["source-1"],
  sourceVersions: { "source-1": 4 },
  values: [],
})

function mutation(
  version: number,
  changes: Parameters<typeof applyDataSourceMutationToPageProperties>[1]["changes"],
) {
  return {
    actorId: "user-1",
    areas: ["records" as const],
    changes,
    commandId: `command-${version}`,
    committedAt: "2026-07-14T12:00:00.000Z",
    eventId: `event-${version}`,
    protocolVersion: 3 as const,
    sourceId: "source-1",
    sourceVersion: version,
    type: "database.mutation" as const,
  }
}

test("source events patch the targeted row-page properties cache", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDataSourceMutationToPageProperties(
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
  assert.equal(payload?.sourceVersions?.["source-1"], 5)
  assert.equal(payload?.values[0]?.value, "Done")
})

test("property changes invalidate row-page properties", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData<PagePropertiesPayload>(key, {
    presenceTargets: [{
      propertyIds: ["property-status"],
      rowId: "row-1",
      sourceId: "source-1",
    }],
    sourceIds: ["source-1"],
    sourceVersions: { "source-1": 4 },
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

  applyDataSourceMutationToPageProperties(queryClient, {
    ...mutation(5, { removedPropertyIds: ["column-status"] }),
    areas: ["properties"],
  })
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
})

test("row-page properties invalidate on version gaps and ticket recovery", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDataSourceMutationToPageProperties(
    queryClient,
    mutation(6, {}),
  )
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)

  queryClient.setQueryData(key, initialPayload())
  recoverPagePropertiesIfSourceBehind(queryClient, "source-1", 5)
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
})

test("an older page-property response cannot replace newer realtime data", () => {
  const current = initialPayload()
  current.sourceVersions = { "source-1": 6 }
  const incoming = initialPayload()
  incoming.sourceVersions = { "source-1": 5 }

  assert.equal(preferNewestPagePropertiesPayload(current, incoming), current)
})

test("invalidate-only events refetch page properties without patching them", () => {
  const queryClient = new QueryClient()
  const key = pagePropertiesQueryKey("page-1")
  queryClient.setQueryData(key, initialPayload())

  applyDataSourceMutationToPageProperties(queryClient, {
    ...mutation(5, {}),
    requiresReset: true,
  })

  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
  assert.equal(
    queryClient.getQueryData<PagePropertiesPayload>(key)
      ?.sourceVersions?.["source-1"],
    4,
  )
})
