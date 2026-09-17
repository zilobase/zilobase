export const databasePropertyTypes = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "files",
  "checkbox",
  "url",
  "phone",
  "email",
  "relation",
  "rollup",
  "formula",
  "button",
  "id",
  "place",
  "verification",
  "created_time",
  "edited_time",
] as const

export type DatabasePropertyType = (typeof databasePropertyTypes)[number]

const databasePropertyTypeSet = new Set<string>(databasePropertyTypes)

export function isDatabasePropertyType(
  type: string
): type is DatabasePropertyType {
  return databasePropertyTypeSet.has(type)
}

export function normalizeDatabasePropertyType(
  type: unknown,
  fallback = "text"
): DatabasePropertyType | null {
  if (type !== undefined && type !== null && typeof type !== "string") {
    return null
  }

  const value = type && type.trim() ? type.trim().toLowerCase() : fallback

  return isDatabasePropertyType(value) ? value : null
}

export function isReadOnlyPropertyType(type: string) {
  return type === "created_time" || type === "edited_time"
}

export function isSelectLikePropertyType(type: string) {
  return type === "select" || type === "multi_select" || type === "status"
}

export function shouldClearValuesForPropertyTypeChange(
  previousType: string,
  nextType: string
) {
  if (previousType === "date" && isSelectLikePropertyType(nextType)) {
    return true
  }

  if (nextType === "files") {
    return previousType !== "files"
  }

  if (nextType === "person") {
    return previousType !== "person"
  }

  return isReadOnlyPropertyType(nextType)
}
