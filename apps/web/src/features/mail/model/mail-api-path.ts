export function mailApiBasePath(workspaceId?: string | null) {
  return workspaceId && workspaceId !== "legacy"
    ? `/workspaces/${encodeURIComponent(workspaceId)}/mail`
    : "/mail"
}
