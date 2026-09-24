import assert from "node:assert/strict"
import test from "node:test"

import type { ZilobaseAuthClient } from "../shared/context"
import {
  workspaceInvitationsQueryOptions,
  workspacesQueryOptions,
} from "./queries"

test("workspace auth queries forward TanStack cancellation", async () => {
  const controller = new AbortController()
  const receivedSignals: Array<AbortSignal | undefined> = []
  const auth = {
    listWorkspaceInvitations: async (
      _workspaceId: string,
      signal?: AbortSignal,
    ) => {
      receivedSignals.push(signal)
      return []
    },
    listWorkspaces: async (signal?: AbortSignal) => {
      receivedSignals.push(signal)
      return []
    },
  } as unknown as ZilobaseAuthClient

  await workspacesQueryOptions(auth).queryFn?.({
    signal: controller.signal,
  } as never)
  await workspaceInvitationsQueryOptions(auth, "workspace-1").queryFn?.({
    signal: controller.signal,
  } as never)

  assert.deepEqual(receivedSignals, [controller.signal, controller.signal])
})
