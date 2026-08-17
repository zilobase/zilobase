import assert from "node:assert/strict"
import test from "node:test"

import { meetingKeys, meetingQueryOptions } from "./queries"

test("meeting query keys are hierarchical and scoped by meeting", () => {
  assert.deepEqual(meetingKeys.detail("meeting-1"), [
    "meetings",
    "detail",
    "meeting-1",
  ])
  assert.notDeepEqual(
    meetingKeys.detail("meeting-1"),
    meetingKeys.detail("meeting-2"),
  )
})

test("meeting detail queries forward cancellation and use a bounded stale time", async () => {
  const calls: unknown[] = []
  const options = meetingQueryOptions(async (path, init) => {
    calls.push({ init, path })
    return { meeting: { id: "meeting-1" } } as never
  }, "meeting-1")
  const controller = new AbortController()

  await options.queryFn?.({ signal: controller.signal } as never)
  assert.deepEqual(calls, [
    {
      init: { signal: controller.signal },
      path: "/meetings/meeting-1",
    },
  ])
  assert.equal(options.staleTime, 30_000)
})
