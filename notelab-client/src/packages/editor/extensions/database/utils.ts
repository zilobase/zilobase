import type { DatabaseCell } from "@/features/databases/queries"

export type DatabaseCellValue = string | string[]

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

export function getCellValue(
  cells: DatabaseCell[],
  rowId: string,
  propertyId: string
): DatabaseCellValue {
  const value = cells.find(
    (cell) => cell.rowId === rowId && cell.propertyId === propertyId
  )?.value

  if (typeof value === "string") {
    return value
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

  if (value && typeof value === "object" && "options" in value) {
    const options = (value as { options?: unknown }).options

    if (Array.isArray(options)) {
      return options.filter((item): item is string => typeof item === "string")
    }
  }

  return ""
}
