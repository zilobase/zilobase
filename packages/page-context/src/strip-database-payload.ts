import type { DatabaseContextPayload } from "./types"

type DatabaseRowLike = {
  id: string
  page?: {
    name?: string
  }
  pageId: string
  position: number
}

type DatabaseValueLike = {
  propertyId: string
  value: unknown
  pageId: string
}

type DatabasePayloadLike = {
  database: {
    id: string
    name: string
    pageId: string | null
    config?: unknown
  }
  properties: DatabaseContextPayload["properties"]
  views: DatabaseContextPayload["views"]
  rows?: DatabaseRowLike[]
  rowCount?: number | string
  values?: DatabaseValueLike[]
}

function normalizeRowCount(payload: DatabasePayloadLike) {
  const { rowCount, rows } = payload

  if (typeof rowCount === "number" && Number.isFinite(rowCount)) {
    return rowCount
  }

  if (typeof rowCount === "string" && rowCount.trim().length > 0) {
    const parsed = Number(rowCount)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return rows?.length ?? 0
}

function toDatabaseRows(rows: DatabaseRowLike[] | undefined) {
  return (rows ?? []).map((row) => ({
    id: row.id,
    pageId: row.pageId,
    position: row.position,
    name: row.page?.name?.trim() || "Untitled",
  }))
}

function toDatabaseValues(values: DatabaseValueLike[] | undefined) {
  return (values ?? []).map((value) => ({
    propertyId: value.propertyId,
    value: value.value,
    pageId: value.pageId,
  }))
}

export function stripDatabasePayload(
  payload: DatabasePayloadLike,
): DatabaseContextPayload {
  const rows = toDatabaseRows(payload.rows)

  return {
    database: {
      id: payload.database.id,
      name: payload.database.name,
      pageId: payload.database.pageId,
      config: payload.database.config,
    },
    properties: payload.properties,
    views: payload.views,
    rowCount: normalizeRowCount(payload),
    rows,
    values: toDatabaseValues(payload.values),
  }
}
