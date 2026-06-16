export type WorkspaceChangedEvent = {
  type: "workspace.changed"
  actorId: string
  changed: Array<"metadata" | "name">
  committedAt: string
  mutationId: string
  organizationId: string
  workspaceId: string
}

export type WorkspaceRealtimeEvent = WorkspaceChangedEvent

export function getWorkspaceRealtimeUrl(
  workspaceId: string,
  realtimeBaseUrl: string | undefined,
  currentOrigin: string,
) {
  const baseUrl = realtimeBaseUrl || currentOrigin
  const url = new URL(baseUrl, currentOrigin)

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `/workspaces/${encodeURIComponent(workspaceId)}/realtime`
  url.search = ""

  return url.toString()
}

export function parseWorkspaceRealtimeEvent(
  data: unknown,
): WorkspaceRealtimeEvent | null {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown

    return parsed && typeof parsed === "object"
      ? (parsed as WorkspaceRealtimeEvent)
      : null
  } catch {
    return null
  }
}

