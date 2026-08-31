import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  applyNavigationDeltaToCache,
  isNavigationRealtimeEvent,
} from "./navigation-realtime"
import { pagesQueryKey, type PageNavigationPayload } from "./queries"

const page = {
  createdAt: "2026-08-31T00:00:00.000Z",
  id: "page-1",
  name: "Created",
  type: "pageblock",
  updatedAt: "2026-08-31T00:00:00.000Z",
  url: "#",
  workspaceId: "workspace-1",
}

test("applies local navigation deltas to loaded snapshots", () => {
  const client = new QueryClient()
  const key = pagesQueryKey("workspace-1")
  client.setQueryData<PageNavigationPayload>(key, {
    databases: [], pages: [], placements: [],
  })
  assert.equal(applyNavigationDeltaToCache(client, "workspace-1", {
    upsertPages: [page],
  }), true)
  assert.deepEqual(client.getQueryData<PageNavigationPayload>(key)?.pages, [page])
})

test("invalidates navigation when no snapshot is loaded", () => {
  const client = new QueryClient()
  const key = pagesQueryKey("workspace-1")
  client.getQueryCache().build(client, {
    queryFn: async () => ({ databases: [], pages: [], placements: [] }),
    queryKey: key,
  })
  assert.equal(applyNavigationDeltaToCache(client, "workspace-1", {
    upsertPages: [page],
  }), false)
  assert.equal(client.getQueryState(key)?.isInvalidated, true)
})

test("accepts metadata-only navigation events", () => {
  assert.equal(isNavigationRealtimeEvent({
    committedAt: "2026-08-31T00:00:00.000Z",
    eventId: "event-1",
    protocolVersion: 1,
    type: "navigation.invalidate",
    workspaceId: "workspace-1",
  }), true)
  assert.equal(isNavigationRealtimeEvent({
    eventId: "event-1",
    pageId: "private-page",
    protocolVersion: 1,
    type: "navigation.invalidate",
    workspaceId: "workspace-1",
  }), false)
})
