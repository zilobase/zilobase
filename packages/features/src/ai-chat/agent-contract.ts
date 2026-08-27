export const AGENT_WORKSPACE_READ_TOOL_NAMES = [
  "searchWorkspace",
  "readWorkspacePage",
  "queryWorkspaceDatabase",
  "readPageComments",
] as const

export const AGENT_WORKSPACE_ACTION_TOOL_NAMES = [
  "updateWorkspacePage",
  "createDownloadableArtifact",
] as const

export type AgentWorkspaceReadToolName =
  (typeof AGENT_WORKSPACE_READ_TOOL_NAMES)[number]

export type AgentWorkspaceActionToolName =
  (typeof AGENT_WORKSPACE_ACTION_TOOL_NAMES)[number]

export type AgentToolStatus =
  | "succeeded"
  | "failed"
  | "approval_required"
  | "unavailable"

export type AgentCitation = {
  id: string
  source: "artifact" | "database" | "file" | "page" | "page-comment"
  title: string
  url: string
  excerpt?: string
}

export type AgentActionReceipt = {
  actionId: string
  completedAt: string
  toolName: string
}

export type AgentToolResult<T = unknown> = {
  ok: boolean
  status: AgentToolStatus
  summary: string
  data?: T
  citations?: AgentCitation[]
  receipt?: AgentActionReceipt
  error?: {
    code: string
    retryable: boolean
  }
}

export type AgentResultTable = {
  columns: Array<{ id: string; label: string; type: string }>
  rows: Array<{
    cells: Record<string, string>
    id: string
    pageId?: string
  }>
}

export function readAgentResultTable(output: unknown): AgentResultTable | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null
  const data = (output as { data?: unknown }).data
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const table = (data as { table?: unknown }).table
  if (!table || typeof table !== "object" || Array.isArray(table)) return null
  const raw = table as { columns?: unknown; rows?: unknown }
  if (!Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null

  const columns = raw.columns.flatMap((column) => {
    if (!column || typeof column !== "object" || Array.isArray(column)) return []
    const value = column as Record<string, unknown>
    return typeof value.id === "string" && typeof value.label === "string"
      ? [{ id: value.id, label: value.label, type: typeof value.type === "string" ? value.type : "text" }]
      : []
  }).slice(0, 100)
  if (columns.length === 0) return null

  const columnIds = new Set(columns.map((column) => column.id))
  const rows = raw.rows.flatMap((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return []
    const value = row as Record<string, unknown>
    const rawCells = value.cells
    if (!rawCells || typeof rawCells !== "object" || Array.isArray(rawCells)) return []
    const cells = Object.fromEntries(Object.entries(rawCells).flatMap(([id, cell]) =>
      columnIds.has(id) && typeof cell === "string" ? [[id, cell]] : [],
    ))
    return [{
      cells,
      id: typeof value.id === "string" ? value.id : `row-${index}`,
      ...(typeof value.pageId === "string" ? { pageId: value.pageId } : {}),
    }]
  }).slice(0, 500)
  return { columns, rows }
}

export function isAgentWorkspaceReadToolName(
  toolName: string,
): toolName is AgentWorkspaceReadToolName {
  return (AGENT_WORKSPACE_READ_TOOL_NAMES as readonly string[]).includes(
    toolName,
  )
}

export function readAgentCitations(output: unknown): AgentCitation[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return []
  }

  const citations = (output as { citations?: unknown }).citations

  if (!Array.isArray(citations)) {
    return []
  }

  return citations.flatMap((citation) => {
    if (!citation || typeof citation !== "object" || Array.isArray(citation)) {
      return []
    }

    const record = citation as Record<string, unknown>

    if (
      typeof record.id !== "string" ||
      typeof record.title !== "string" ||
      typeof record.url !== "string" ||
      !isAgentCitationSource(record.source) ||
      !isSafeCitationUrl(record.url)
    ) {
      return []
    }

    return [{
      id: record.id,
      source: record.source,
      title: record.title,
      url: record.url,
      ...(typeof record.excerpt === "string"
        ? { excerpt: record.excerpt }
        : {}),
    }]
  })
}

function isAgentCitationSource(
  value: unknown,
): value is AgentCitation["source"] {
  return value === "artifact" || value === "database" || value === "file" ||
    value === "page" || value === "page-comment"
}

function isSafeCitationUrl(value: string) {
  return value.startsWith("/") || /^https:\/\//i.test(value)
}
