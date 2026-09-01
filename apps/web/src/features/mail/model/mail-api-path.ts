export function mailApiBasePath(workspaceId?: string | null) {
  return `/workspaces/${encodeURIComponent(workspaceId ?? "_missing_workspace_")}/mail`
}
