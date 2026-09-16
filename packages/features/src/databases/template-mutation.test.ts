import assert from "node:assert/strict"
import test from "node:test"
import { createMutationTestRuntime } from "../shared/mutation-runtime.test"
import { pagesNavRootQueryKey } from "../pages/queries"
import type { DatabaseCommandRequest } from "./contracts-v2"
import { useApplyDatabaseTemplate } from "./mutation-hooks"
import { createTestDatabasePayload, setTestDatabaseClientState } from "./test-helpers"

test("template application uses the idempotent source command and refreshes navigation", async () => {
  const original = createTestDatabasePayload()
  original.database.accessLevel = "edit"
  const source = {
    config: {}, configVersion: 1, createdAt: original.dataSources[0]!.createdAt,
    id: "data-source-1", linkedAt: original.dataSources[0]!.linkedAt ?? null,
    name: "Projects", parentDatabaseId: "database-1", position: 0,
    updatedAt: original.dataSources[0]!.updatedAt, version: 1, workspaceId: "org-1",
  }
  const { linkedAt: _linkedAt, position: _position, ...sourcePatch } = source
  const { mutation, queryClient } = createMutationTestRuntime(useApplyDatabaseTemplate, async <T>(url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest
    assert.equal(url, "/databases/database-1/data-sources/data-source-1/commands")
    assert.equal(request.protocolVersion, 2)
    assert.equal(request.command.type, "template.apply")
    return {
      commandId: request.commandId,
      event: { actorId: "user-1", areas: ["source"], changes: { source: sourcePatch }, commandId: request.commandId, committedAt: source.updatedAt, eventId: "event-1", protocolVersion: 3, sourceId: "data-source-1", sourceVersion: 1, type: "database.mutation" },
      result: { dataSource: source },
    } as T
  })
  const navKey = pagesNavRootQueryKey("org-1")
  setTestDatabaseClientState(queryClient, original)
  queryClient.setQueryData(navKey, { pages: [], databases: [], placements: [] })
  try {
    const updated = await mutation.mutateAsync({ databaseId: "data-source-1", config: {}, name: "Projects", properties: [], rows: [] })
    assert.equal(updated.dataSource.version, 1)
    assert.equal(queryClient.getQueryState(navKey)?.isInvalidated, true)
  } finally { queryClient.clear() }
})
