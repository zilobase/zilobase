export const DATABASE_CONFIG_TOOL_NAMES = [
  "createPage",
  "createDatabase",
  "embedDatabaseInPage",
  "linkDatabaseInPage",
  "createDatabaseProperty",
  "updateDatabaseProperty",
  "createDatabaseView",
  "updateDatabaseView",
  "updateDatabase",
  "createDatabaseRow",
  "setDatabaseCellValue",
] as const

export type DatabaseConfigToolName =
  (typeof DATABASE_CONFIG_TOOL_NAMES)[number]

export type DatabaseConfigToolOutput = {
  hints?: string[]
  ids: Record<string, string>
  ok: true
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

  if (record.ok !== true || !record.ids || typeof record.ids !== "object") {
    return null
  }

  return record.ids
}