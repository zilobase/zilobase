import assert from "node:assert/strict"
import test from "node:test"

import { createMutationTestRuntime } from "../shared/mutation-runtime.test"
import { useCreateMeeting } from "./hooks"
import type { MeetingResponse } from "./contracts"

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

test("meeting creation remains pending through list reconciliation", async () => {
  const refresh = Promise.withResolvers<void>()
  const payload = {
    meeting: { id: "meeting-1" },
  } as MeetingResponse
  const { mutation, queryClient } = createMutationTestRuntime(
    useCreateMeeting,
    async <T>() => payload as T,
  )
  queryClient.invalidateQueries = () => refresh.promise
  let settled = false
  const completion = mutation.mutateAsync({
    pageId: "page-1",
    workspaceId: "workspace-1",
  }).then((result) => {
    settled = true
    return result
  })

  try {
    await tick()
    assert.equal(settled, false)
    refresh.resolve()
    assert.equal(await completion, payload)
    assert.equal(settled, true)
  } finally {
    refresh.resolve()
    queryClient.clear()
  }
})
