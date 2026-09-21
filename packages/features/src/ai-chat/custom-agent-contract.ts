import type {
  AiAgentProfileDetail,
  AiAgentProfileRole,
  AiAgentProfileSummary,
  McpConnectionSummary,
} from "./mcp-contract"

export type CustomAgentRole = AiAgentProfileRole
export type CustomAgentSummary = AiAgentProfileSummary
export type CustomAgentDetail = AiAgentProfileDetail

export type CustomAgentDefinition = {
  name: string
  description: string
  icon: unknown | null
  cover: string | null
  iconPosition: "inline" | "top"
  instructions: string
  defaultModel: string
  safeExecutionPreferences: Record<string, unknown>
  triggers: CustomAgentTriggerDefinition[]
}

export type CustomAgentRevision = {
  id: string
  agentId: string
  version: number
  definition: CustomAgentDefinition
  definitionHash: string
  createdByUserId: string | null
  sourceMessageId: string | null
  createdAt: string
}

export type CustomAgentResourceAccess = {
  resourceType: "page" | "database"
  resourceId: string
  name: string
  icon: unknown | null
  accessLevel: "view" | "comment" | "edit"
  inherited: boolean
  eligibleEditorCount: number
}

export type CustomAgentTriggerKind =
  | "manual"
  | "schedule"
  | "database"
  | "comment"
  | "mention"
  | "meeting"
  | "webhook"
  | "slack"
  | "connector"

export type CustomAgentTriggerDefinition = {
  id: string
  kind: CustomAgentTriggerKind
  label: string
  config: Record<string, unknown>
  status: "active" | "paused" | "degraded" | "disabled"
}

export type CustomAgentTrigger = CustomAgentTriggerDefinition & {
  revisionId: string
  nextRunAt: string | null
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export type CustomAgentChatIntent =
  | "configure"
  | "run"
  | "configure_and_run"
  | "clarify"

export type CustomAgentConversationMessage = {
  id: string
  agentId: string
  authorUserId: string | null
  role: "user" | "assistant" | "system"
  kind: "message" | "revision" | "run" | "approval"
  parts: unknown[]
  sequence: number
  runId: string | null
  revisionId: string | null
  status: "pending" | "completed" | "failed" | "cancelled"
  createdAt: string
}

export type CustomAgentRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"

export type CustomAgentRun = {
  id: string
  agentId: string
  revisionId: string
  triggerId: string | null
  triggerKind: CustomAgentTriggerKind
  initiatedByUserId: string | null
  status: CustomAgentRunStatus
  outputSummary: string | null
  errorCode: string | null
  errorSummary: string | null
  attempts: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
}

export type CustomAgentRunEvent = {
  id: string
  runId: string
  sequence: number
  type: string
  visibility: "shared" | "editor"
  payload: Record<string, unknown>
  createdAt: string
}

export type CustomAgentWorkspace = {
  agent: CustomAgentDetail
  currentRevision: CustomAgentRevision
  resources: CustomAgentResourceAccess[]
  triggers: CustomAgentTrigger[]
  connections: McpConnectionSummary[]
}
