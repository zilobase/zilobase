import assert from "node:assert/strict"
import test from "node:test"

import { createMutationTestRuntime } from  "../../shared/mutation-runtime.test"
import type {
  DatabaseCommandRequest,
  DatabaseViewEntity,
} from  "../core/entities"
import { useAddDatabaseView, useUpdateDatabaseView } from  "./mutation-hooks"

const view: DatabaseViewEntity = {
  config: {},
  createdAt: "2026-09-08T00:00:00.000Z",
  databaseId: "database-1",
  dataSourceId: "data-source-1",
  id: "view-1",
  name: "Board",
  position: 0,
  type: "kanban",
  updatedAt: "2026-09-08T00:00:00.000Z",
}

function commandApi(
  inspect: (request: DatabaseCommandRequest, path: string) => void,
) {
  let version = 0
  return async <T>(path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest
    inspect(request, path)
    version += 1
    return {
      commandId: request.commandId,
      event: {
        actorId: "user-1",
        areas: ["views"],
        changes: { views: [view] },
        commandId: request.commandId,
        committedAt: "2026-09-08T00:00:00.000Z",
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        eventId: `event-${version}`,
        protocolVersion: 2,
        type: "database.mutation",
        version,
      },
      result: view,
    } as T
  }
}

test("view updates use the host command endpoint", async () => {
  const sent: DatabaseCommandRequest[] = []
  const { mutation, queryClient } = createMutationTestRuntime(
    useUpdateDatabaseView,
    commandApi((request, path) => {
      sent.push(request)
      assert.equal(path, "/databases/database-1/commands")
    }),
  )
  try {
    const result = await mutation.mutateAsync({
      databaseId: "database-1",
      databaseViewId: "view-1",
      name: "Board",
    })
    assert.equal(result.id, "view-1")
    assert.deepEqual(sent[0]?.command, {
      patch: { name: "Board" },
      type: "view.update",
      viewId: "view-1",
    })
  } finally {
    queryClient.clear()
  }
})

test("view creation uses neighbor-based v2 commands", async () => {
  const sent: DatabaseCommandRequest[] = []
  const { mutation, queryClient } = createMutationTestRuntime(
    useAddDatabaseView,
    commandApi((request) => sent.push(request)),
  )
  try {
    await mutation.mutateAsync({
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      name: "Board",
      type: "kanban",
    })
    assert.deepEqual(sent[0]?.command, {
      afterViewId: null,
      beforeViewId: null,
      config: null,
      dataSourceId: "data-source-1",
      name: "Board",
      type: "view.create",
      viewType: "kanban",
    })
  } finally {
    queryClient.clear()
  }
})
