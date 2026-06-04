import type { WorkspacePropertyValue } from "@/features/databases/queries"

export type DatabasePropertyValue = string | string[]

export function createDatabaseBlockContent(databaseId: string) {
  return [
    {
      type: "databaseBlock",
      attrs: createDatabaseBlockAttrs(databaseId),
    },
    { type: "paragraph" },
  ]
}

export function createDatabaseBlockAttrs(databaseId: string) {
  return {
    databaseId,
  }
}

export function getPropertyValue(
  values: WorkspacePropertyValue[],
  workspaceId: string,
  propertyId: string,
  propertyType = "text"
): DatabasePropertyValue {
  const value = values.find(
    (item) => item.workspaceId === workspaceId && item.propertyId === propertyId
  )?.value

  return parsePropertyValue(value, propertyType)
}

export function parsePropertyValue(
  value: unknown,
  propertyType = "text"
): DatabasePropertyValue {
  if (typeof value === "string") {
    return value
  }

  if (
    typeof value === "number" &&
    (propertyType === "number" ||
      propertyType === "phone" ||
      propertyType === "text")
  ) {
    return Number.isFinite(value) ? String(value) : ""
  }

  if (typeof value === "boolean" && propertyType === "checkbox") {
    return value ? "true" : "false"
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }

  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text

    if (typeof text === "string") {
      return text
    }

    if (Array.isArray(text)) {
      return text.filter((item): item is string => typeof item === "string")
    }
  }

  if (value && typeof value === "object" && propertyType === "date") {
    const date = (value as { date?: unknown; end?: unknown; start?: unknown })
      .date
    const end = (value as { date?: unknown; end?: unknown; start?: unknown }).end
    const start = (value as { date?: unknown; end?: unknown; start?: unknown })
      .start

    if (typeof date === "string") {
      return date
    }

    if (typeof start === "string") {
      return typeof end === "string" && end ? [start, end] : start
    }
  }

  if (value && typeof value === "object" && "options" in value) {
    const options = (value as { options?: unknown }).options

    if (Array.isArray(options)) {
      return options.filter((item): item is string => typeof item === "string")
    }
  }

  return ""
}

export function serializePropertyValue(
  propertyType: string,
  value: DatabasePropertyValue
) {
  if (propertyType === "multi_select") {
    return Array.isArray(value) ? value : value ? [value] : []
  }

  if (propertyType === "person") {
    return value
  }

  if (propertyType === "number") {
    const nextValue = Array.isArray(value) ? value[0] : value
    const trimmedValue = nextValue.trim()

    if (!trimmedValue) {
      return null
    }

    const numberValue = Number(trimmedValue)

    return Number.isFinite(numberValue) ? numberValue : null
  }

  if (propertyType === "phone") {
    const nextValue = Array.isArray(value) ? value[0] : value

    return nextValue.trim()
  }

  if (propertyType === "checkbox") {
    const nextValue = Array.isArray(value) ? value[0] : value
    const normalizedValue = nextValue.trim().toLowerCase()

    return ["1", "checked", "true", "yes"].includes(normalizedValue)
  }

  if (propertyType === "select" || propertyType === "status") {
    return Array.isArray(value) ? (value[0] ?? "") : value
  }

  if (propertyType === "date") {
    if (Array.isArray(value)) {
      const start = value[0]?.trim() ?? ""
      const end = value[1]?.trim() ?? ""

      return start && end ? { end, start } : start || null
    }

    const nextValue = value

    return nextValue.trim() || null
  }

  return Array.isArray(value) ? value.join(", ") : value
}
