import assert from "node:assert/strict"
import test from "node:test"

import {
  meetingKeys,
  meetingQueryOptions,
  meetingTranscriptQueryOptions,
  workspaceMeetingsQueryOptions,
} from "./queries"

test("meeting query keys are hierarchical and scoped by meeting", () => {
  assert.deepEqual(meetingKeys.list("workspace-1"), [
    "meetings",
    "list",
    "workspace-1",
  ])
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

test("live transcript queries poll with their own scoped cache key", () => {
  const options = meetingTranscriptQueryOptions(async () => ({
    segments: [],
  }), "meeting-1", true)
  assert.deepEqual(options.queryKey, [
    "meetings",
    "detail",
    "meeting-1",
    "transcript",
  ])
  assert.equal(options.refetchInterval, 2_000)
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
