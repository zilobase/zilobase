import type { AgentCitation } from "./agent-contract"

export const DATABASE_CONFIG_TOOL_NAMES = [
  "buildDatabaseFromBlueprint",
  "createPage",
  "createDatabase",
  "embedDatabaseInPage",
  "linkDatabaseInPage",
  "createDatabaseProperty",
  "updateDatabaseProperty",
  "createDatabaseView",
  "updateDatabaseView",
  "updateDataSource",
  "createDatabaseRow",
  "setDatabaseCellValue",
] as const

export type DatabaseConfigToolName =
  (typeof DATABASE_CONFIG_TOOL_NAMES)[number]

export type DatabaseConfigToolOutput = {
  citations?: AgentCitation[]
  data?: unknown
  error?: {
    code: string
    retryable: boolean
  }
  hints?: string[]
  ids: Record<string, string>
  ok: boolean
  receipt?: {
    actionId: string
    completedAt: string
    toolName: string
  }
  status: "failed" | "succeeded"
  summary: string
}

export function isDatabaseConfigToolName(
  toolName: string,
): toolName is DatabaseConfigToolName {
  return (DATABASE_CONFIG_TOOL_NAMES as readonly string[]).includes(toolName)
}

export function readDatabaseConfigToolIds(output: unknown) {
  if (!output || typeof output !== "object") {
    return null
  }

  const record = output as DatabaseConfigToolOutput

  if (!record.ids || typeof record.ids !== "object") {
    return null
  }

  return record.ids
}
