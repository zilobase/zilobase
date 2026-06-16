export type DatabasePresenceCollaborator = {
  color: string
  connectedAt: string
  presence: {
    activePropertyId?: string | null
    activeRowId?: string | null
    activeViewId?: string | null
  }
  sessionId: string
  updatedAt: string
  user: {
    email?: string | null
    id: string
    image?: string | null
    name: string
  }
}

export type DatabaseChangedEvent = {
  type: "database.changed"
  clientMutationId?: string
  databaseId: string
  version: number
}

export type DatabaseReadyEvent = {
  type: "realtime.ready"
  databaseId: string
  peers: Array<Omit<DatabasePresenceCollaborator, "color">>
  sessionId: string
}

export type DatabasePresenceUpdateEvent = {
  type: "presence.update"
  collaborator: Omit<DatabasePresenceCollaborator, "color">
  databaseId: string
}

export type DatabasePresenceClearEvent = {
  type: "presence.clear"
  databaseId: string
  sessionId: string
}

export type DatabaseRealtimeEvent =
  | DatabaseChangedEvent
  | DatabaseReadyEvent
  | DatabasePresenceUpdateEvent
  | DatabasePresenceClearEvent

export function getDatabaseRealtimeUrl(
  databaseId: string,
  realtimeBaseUrl: string | undefined,
  currentOrigin: string,
) {
  const baseUrl = realtimeBaseUrl || currentOrigin
  const url = new URL(baseUrl, currentOrigin)

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `/databases/${encodeURIComponent(databaseId)}/realtime`
  url.search = ""

  return url.toString()
}

export function parseDatabaseRealtimeEvent(
  data: unknown,
): DatabaseRealtimeEvent | null {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown

    return parsed && typeof parsed === "object"
      ? (parsed as DatabaseRealtimeEvent)
      : null
  } catch {
    return null
  }
}

export function getDatabaseChangedRefetchDecision({
  clientMutationId,
  currentVersion,
  isOwnMutation,
  version,
}: {
  clientMutationId?: string
  currentVersion: number | null
  isOwnMutation: (clientMutationId: string | undefined) => boolean
  version: number
}) {
  if (version <= (currentVersion ?? 0)) {
    return {
      latestVersion: currentVersion,
      shouldRefetch: false,
    }
  }

  return {
    latestVersion: version,
    shouldRefetch: !isOwnMutation(clientMutationId),
  }
}

export function createCellPresenceByKey(
  collaborators: DatabasePresenceCollaborator[],
) {
  const byKey: Record<string, DatabasePresenceCollaborator[]> = {}

  for (const collaborator of collaborators) {
    const rowId = collaborator.presence.activeRowId
    const propertyId = collaborator.presence.activePropertyId

    if (!rowId || !propertyId) {
      continue
    }

    const key = `${rowId}:${propertyId}`

    byKey[key] = [...(byKey[key] ?? []), collaborator]
  }

  return byKey
}

export function addCollaboratorColor<
  T extends Omit<DatabasePresenceCollaborator, "color">,
>(collaborator: T): DatabasePresenceCollaborator {
  return {
    ...collaborator,
    color: getStableColor(collaborator.user.id || collaborator.sessionId),
  }
}

function getStableColor(value: string) {
  const colors = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#0891b2",
    "#ea580c",
    "#4f46e5",
    "#be123c",
  ]
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }

  return colors[Math.abs(hash) % colors.length]
}
