export const AGENT_WORKSPACE_READ_TOOL_NAMES = [
  "searchWorkspace",
  "readWorkspacePage",
  "queryWorkspaceDatabase",
  "readPageComments",
] as const

export type AgentWorkspaceReadToolName =
  (typeof AGENT_WORKSPACE_READ_TOOL_NAMES)[number]

export type AgentToolStatus =
  | "succeeded"
  | "failed"
  | "approval_required"
  | "unavailable"

export type AgentCitation = {
  id: string
  source: "database" | "page" | "page-comment"
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
  return value === "database" || value === "page" || value === "page-comment"
}

function isSafeCitationUrl(value: string) {
  return value.startsWith("/") || /^https:\/\//i.test(value)
}
