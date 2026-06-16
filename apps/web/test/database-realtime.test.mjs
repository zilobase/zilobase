import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const featuresRealtimeUtilsPath = join(
  testDir,
  "../../../packages/features/src/databases/realtime-utils.ts",
)

export function register({ assert, loadModule, test }) {
  test("database realtime URL uses the API origin and WebSocket protocol", async () => {
    const { getDatabaseRealtimeUrl } = await loadModule(featuresRealtimeUtilsPath)

    assert.equal(
      getDatabaseRealtimeUrl(
        "database id/with spaces",
        "https://api.notelab.local?ignored=true",
        "http://localhost:5173",
      ),
      "wss://api.notelab.local/databases/database%20id%2Fwith%20spaces/realtime",
    )
    assert.equal(
      getDatabaseRealtimeUrl(
        "database-1",
        undefined,
        "http://localhost:5173",
      ),
      "ws://localhost:5173/databases/database-1/realtime",
    )
  })

  test("database realtime changed events refetch only for newer remote mutations", async () => {
    const { getDatabaseChangedRefetchDecision } = await loadModule(
      featuresRealtimeUtilsPath,
    )
    const ownMutationIds = new Set(["own-mutation"])

    assert.deepEqual(
      getDatabaseChangedRefetchDecision({
        currentVersion: 8,
        isOwnMutation: (clientMutationId) =>
          Boolean(clientMutationId && ownMutationIds.has(clientMutationId)),
        version: 8,
      }),
      { latestVersion: 8, shouldRefetch: false },
    )
    assert.deepEqual(
      getDatabaseChangedRefetchDecision({
        clientMutationId: "own-mutation",
        currentVersion: 8,
        isOwnMutation: (clientMutationId) =>
          Boolean(clientMutationId && ownMutationIds.has(clientMutationId)),
        version: 9,
      }),
      { latestVersion: 9, shouldRefetch: false },
    )
    assert.deepEqual(
      getDatabaseChangedRefetchDecision({
        clientMutationId: "remote-mutation",
        currentVersion: 9,
        isOwnMutation: (clientMutationId) =>
          Boolean(clientMutationId && ownMutationIds.has(clientMutationId)),
        version: 10,
      }),
      { latestVersion: 10, shouldRefetch: true },
    )
  })

  test("database realtime indexes cell presence by row and property", async () => {
    const { addCollaboratorColor, createCellPresenceByKey } = await loadModule(
      featuresRealtimeUtilsPath,
    )
    const collaboratorA = addCollaboratorColor(
      createCollaborator({
        activePropertyId: "property-1",
        activeRowId: "row-1",
        sessionId: "session-a",
        userId: "user-a",
      }),
    )
    const collaboratorB = addCollaboratorColor(
      createCollaborator({
        activePropertyId: "property-1",
        activeRowId: "row-1",
        sessionId: "session-b",
        userId: "user-b",
      }),
    )
    const collaboratorWithoutCell = addCollaboratorColor(
      createCollaborator({
        activePropertyId: null,
        activeRowId: "row-2",
        sessionId: "session-c",
        userId: "user-c",
      }),
    )
    const collaboratorOnNameCell = addCollaboratorColor(
      createCollaborator({
        activePropertyId: "name",
        activeRowId: "row-2",
        sessionId: "session-d",
        userId: "user-d",
      }),
    )

    assert.deepEqual(
      Object.fromEntries(
        Object.entries(
          createCellPresenceByKey([
            collaboratorA,
            collaboratorB,
            collaboratorWithoutCell,
            collaboratorOnNameCell,
          ]),
        ).map(([key, collaborators]) => [
          key,
          collaborators.map((collaborator) => collaborator.sessionId),
        ]),
      ),
      {
        "row-1:property-1": ["session-a", "session-b"],
        "row-2:name": ["session-d"],
      },
    )
    assert.match(collaboratorA.color, /^#[0-9a-f]{6}$/)
  })

  test("database realtime parses JSON events and ignores malformed frames", async () => {
    const { parseDatabaseRealtimeEvent } = await loadModule(featuresRealtimeUtilsPath)

    assert.deepEqual(
      parseDatabaseRealtimeEvent(
        JSON.stringify({
          databaseId: "database-1",
          type: "database.changed",
          version: 7,
        }),
      ),
      {
        databaseId: "database-1",
        type: "database.changed",
        version: 7,
      },
    )
    assert.equal(parseDatabaseRealtimeEvent("{bad json"), null)
    assert.equal(parseDatabaseRealtimeEvent(new ArrayBuffer(0)), null)
  })
}

function createCollaborator({
  activePropertyId,
  activeRowId,
  sessionId,
  userId,
}) {
  return {
    connectedAt: "2026-06-17T00:00:00.000Z",
    presence: {
      activePropertyId,
      activeRowId,
      activeViewId: "view-1",
    },
    sessionId,
    updatedAt: "2026-06-17T00:00:01.000Z",
    user: {
      id: userId,
      name: userId,
    },
  }
}
