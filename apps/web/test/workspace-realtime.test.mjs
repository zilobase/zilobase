import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const featuresRealtimeUtilsPath = join(
  testDir,
  "../../../packages/features/src/workspaces/realtime-utils.ts",
)

export function register({ assert, loadModule, test }) {
  test("workspace realtime URL uses the API origin and WebSocket protocol", async () => {
    const { getWorkspaceRealtimeUrl } = await loadModule(featuresRealtimeUtilsPath)

    assert.equal(
      getWorkspaceRealtimeUrl(
        "workspace id/with spaces",
        "https://api.notelab.local?ignored=true",
        "http://localhost:5173",
      ),
      "wss://api.notelab.local/workspaces/workspace%20id%2Fwith%20spaces/realtime",
    )
    assert.equal(
      getWorkspaceRealtimeUrl(
        "workspace-1",
        undefined,
        "http://localhost:5173",
      ),
      "ws://localhost:5173/workspaces/workspace-1/realtime",
    )
  })

  test("workspace realtime parses saved name and metadata change events", async () => {
    const { parseWorkspaceRealtimeEvent } = await loadModule(
      featuresRealtimeUtilsPath,
    )
    const event = {
      actorId: "user-1",
      changed: ["name", "metadata"],
      committedAt: "2026-06-17T00:00:00.000Z",
      mutationId: "mutation-1",
      organizationId: "organization-1",
      type: "workspace.changed",
      workspaceId: "workspace-1",
    }

    assert.deepEqual(
      parseWorkspaceRealtimeEvent(JSON.stringify(event)),
      event,
    )
    assert.equal(parseWorkspaceRealtimeEvent("{bad json"), null)
    assert.equal(parseWorkspaceRealtimeEvent(new ArrayBuffer(0)), null)
  })

  test("workspace realtime parses comment change events", async () => {
    const { parseWorkspaceRealtimeEvent } = await loadModule(
      featuresRealtimeUtilsPath,
    )
    const event = {
      actorId: "user-1",
      changed: ["message.created"],
      committedAt: "2026-06-17T00:00:00.000Z",
      mutationId: "mutation-1",
      organizationId: "organization-1",
      threadId: "thread-1",
      type: "comments.changed",
      workspaceId: "workspace-1",
    }

    assert.deepEqual(
      parseWorkspaceRealtimeEvent(JSON.stringify(event)),
      event,
    )
  })
}
