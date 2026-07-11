import type { PagePropertyValue } from "@notelab/features/databases"

export type DatabasePropertyValue = string | string[]

export function toStringArray(value: DatabasePropertyValue): string[] {
  return Array.isArray(value) ? value : value ? [value] : []
}

export function toTrimmedStringArray(value: DatabasePropertyValue): string[] {
  return Array.isArray(value) ? value : value.trim() ? [value] : []
}

export function firstScalarValue(
  value: DatabasePropertyValue | string | null | undefined,
  fallback = ""
): string {
  if (Array.isArray(value)) return value[0] ?? fallback
  return value ?? fallback
}

export function createDatabaseBlockContent(databaseId: string) {
  return createDatabaseContent(createDatabaseBlockAttrs(databaseId))
}

export function createDatabaseSetupBlockContent(databaseId: string) {
  return createDatabaseContent(createDatabaseSetupBlockAttrs(databaseId))
}

function createDatabaseContent(
  attrs: ReturnType<typeof createDatabaseBlockAttrs>,
) {
  return [
    {
      type: "databaseBlock",
      attrs,
    },
    { type: "paragraph" },
  ]
}

export function createDatabaseBlockAttrs(databaseId: string) {
  return {
    databaseId,
    setupMode: false,
  }
}

export function createDatabaseSetupBlockAttrs(databaseId: string) {
  return {
    ...createDatabaseBlockAttrs(databaseId),
    setupMode: true,
    showTitle: true,
  }
}

export function getPropertyValue(
  values: PagePropertyValue[],
  pageId: string,
  propertyId: string,
  propertyType = "text"
): DatabasePropertyValue {
  let value: unknown

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const item = values[index]

    if (item.pageId === pageId && item.propertyId === propertyId) {
      value = item.value
      break
    }
  }

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
    return toStringArray(value)
  }

  if (propertyType === "person") {
    return value
  }

  if (propertyType === "files") {
    return Array.isArray(value) ? value : value.trim() ? value : null
  }

  if (propertyType === "relation") {
    return Array.isArray(value) ? value : value.trim() || null
  }

  if (propertyType === "number") {
    const trimmedValue = firstScalarValue(value).trim()

    if (!trimmedValue) {
      return null
    }

    const numberValue = Number(trimmedValue)

    return Number.isFinite(numberValue) ? numberValue : null
  }

  if (propertyType === "phone") {
    return firstScalarValue(value).trim()
  }

  if (propertyType === "checkbox") {
    const normalizedValue = firstScalarValue(value).trim().toLowerCase()

    return ["1", "checked", "true", "yes"].includes(normalizedValue)
  }

  if (propertyType === "select" || propertyType === "status") {
    return firstScalarValue(value)
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
