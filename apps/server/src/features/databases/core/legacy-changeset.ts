import {
  databaseHostEntitySchema,
  databasePropertyEntitySchema,
  databaseRecordEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
  type DatabaseChangedAreaV2,
  type DatabaseMutationChanges,
} from "@zilobase/features/databases/contracts"

import type { DatabaseChangedArea, DatabaseDelta } from "../realtime/delta"

const areaMap: Record<DatabaseChangedArea, DatabaseChangedAreaV2> = {
  dataSource: "dataSources",
  database: "databases",
  properties: "properties",
  rows: "records",
  values: "records",
  views: "views",
}

function parsedArray<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T } }, value: unknown) {
  if (value === undefined) return { present: false, value: undefined as T | undefined }
  const parsed = schema.safeParse(value)
  return { present: true, value: parsed.success ? parsed.data : undefined }
}

/**
 * Adapts old producer deltas without ever publishing partial entities as v2.
 * Complete legacy payloads are retained; partial payloads become a scoped reset.
 */
export function buildLegacyDatabaseChangeset(input: {
  changed: DatabaseChangedArea[]
  delta: DatabaseDelta
}) {
  const areas = [...new Set(input.changed.map((area) => areaMap[area]))]
  const changes: DatabaseMutationChanges = {}
  let requiresReset = false

  const databases = parsedArray(databaseHostEntitySchema.array(),
    input.delta.database === undefined ? undefined : [input.delta.database])
  if (databases.value) changes.databases = databases.value
  else if (databases.present) requiresReset = true

  const sources = parsedArray(dataSourceEntitySchema.array(),
    input.delta.dataSource === undefined ? undefined : [input.delta.dataSource])
  if (sources.value) changes.dataSources = sources.value
  else if (sources.present) requiresReset = true

  const views = parsedArray(databaseViewEntitySchema.array(), input.delta.views)
  if (views.value) changes.views = views.value
  else if (views.present) requiresReset = true

  const properties = parsedArray(databasePropertyEntitySchema.array(), input.delta.properties)
  if (properties.value) changes.properties = properties.value
  else if (properties.present) requiresReset = true

  const records = parsedArray(databaseRecordEntitySchema.array(), input.delta.rows)
  if (records.value) changes.records = records.value
  else if (records.present) requiresReset = true

  if (input.delta.removedViewIds?.length) {
    changes.removedViewIds = input.delta.removedViewIds
  }
  if (input.delta.removedPropertyIds?.length) {
    changes.removedPropertyIds = input.delta.removedPropertyIds
  }
  if (input.delta.removedRowIds?.length) {
    changes.removedRecordIds = input.delta.removedRowIds
  }
  if (input.delta.values !== undefined) requiresReset = true

  const represented = new Set<DatabaseChangedAreaV2>([
    ...(changes.databases ? ["databases" as const] : []),
    ...(changes.dataSources ? ["dataSources" as const] : []),
    ...(changes.views || changes.removedViewIds ? ["views" as const] : []),
    ...(changes.properties || changes.removedPropertyIds ? ["properties" as const] : []),
    ...(changes.records || changes.removedRecordIds ? ["records" as const] : []),
  ])
  if (areas.some((area) => !represented.has(area))) requiresReset = true

  const bytes = new TextEncoder().encode(JSON.stringify(changes)).byteLength
  if (bytes > 64 * 1_024) return { areas, changes: {}, requiresReset: true as const }
  return { areas, changes, ...(requiresReset ? { requiresReset: true as const } : {}) }
}
