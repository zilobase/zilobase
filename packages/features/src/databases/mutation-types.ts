export type DatabaseChangedArea =
  | "database"
  | "views"
  | "properties"
  | "rows"
  | "values"

export type DatabaseDelta = {
  database?: Record<string, unknown>
  properties?: Array<Record<string, unknown>>
  removedPagePropertyIds?: string[]
  removedPropertyIds?: string[]
  removedViewIds?: string[]
  rows?: Array<Record<string, unknown>>
  values?: Array<{
    createdAt?: string
    id?: string
    propertyId: string
    updatedAt: string
    value: unknown
    pageId: string
  }>
  views?: Array<Record<string, unknown>>
}

export type DatabaseMutationResponse = {
  changed: DatabaseChangedArea[]
  committedAt: string
  databaseId: string
  delta: DatabaseDelta
  mutationId: string
  requiresRefetch?: true
  version: number
}

export function isDatabaseMutationResponse(
  value: unknown,
): value is DatabaseMutationResponse {
  if (!value || typeof value !== "object") {
    return false
  }

  const response = value as DatabaseMutationResponse

  return (
    typeof response.mutationId === "string" &&
    typeof response.databaseId === "string" &&
    typeof response.version === "number" &&
    (response.requiresRefetch === undefined ||
      response.requiresRefetch === true) &&
    response.delta !== undefined &&
    Array.isArray(response.changed)
  )
}
