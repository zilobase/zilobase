import type {
  DatabaseBootstrapResponse,
  DatabaseHostEntity,
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DatabaseRecordWindowResponse,
  DatabaseViewEntity,
  DataSourceEntity,
  PagePropertyValueEntity,
} from "@zilobase/features/databases/contracts"
import {
  databaseOrderKeyAtPosition,
  parseDatabaseOrderKey,
} from "@zilobase/features/databases/order-key"
import {
  evaluateDatabaseRecordsForView,
  getDatabaseInitialPageSize,
} from "@zilobase/features/databases/view-evaluation"

import { getEffectiveDatabaseAccessForRecord } from "../../access"
import type { database } from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import { requireDatabaseAccess } from "../access/database-access"
import { getDatabasePayload, getDatabaseSchemaPayload } from "../core/payload"

type DatabaseRecord = typeof database.$inferSelect
type AccessLevel = DatabaseHostEntity["accessLevel"]
type LegacyPayload = NonNullable<Awaited<ReturnType<typeof getDatabasePayload>>>
type LegacyProperty = LegacyPayload["properties"][number]
type LegacySource = LegacyPayload["dataSources"][number]
type LegacyView = LegacyPayload["views"][number]
type LegacyRow = LegacyPayload["rows"][number]
type LegacyValue = LegacyPayload["values"][number]

type ReadDependencies = {
  getPayload: typeof getDatabasePayload
  getSchemaPayload: typeof getDatabaseSchemaPayload
  requireAccess: typeof requireDatabaseAccess
}

const defaultDependencies: ReadDependencies = {
  getPayload: getDatabasePayload,
  getSchemaPayload: getDatabaseSchemaPayload,
  requireAccess: requireDatabaseAccess,
}

export const DATABASE_RECORD_WINDOW_LIMITS = [10, 25, 50, 100] as const
export const MAX_DATABASE_RECORD_WINDOW_LIMIT = 1_001

export class DatabaseWindowStaleError extends ServiceMutationError {
  readonly code = "WINDOW_STALE" as const

  constructor(readonly currentSnapshot: string) {
    super("The database record window is stale", 409)
    this.name = "DatabaseWindowStaleError"
  }
}

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

function nullableTimestamp(value: Date | string | null | undefined) {
  return value == null ? null : timestamp(value)
}

function sourceEntity(source: LegacySource): DataSourceEntity {
  return {
    config: source.config ?? null,
    configVersion: source.configVersion,
    createdAt: timestamp(source.createdAt),
    id: source.id,
    linkedAt: nullableTimestamp(source.linkedAt),
    name: source.name,
    parentDatabaseId: source.parentDatabaseId,
    position: source.position ?? 0,
    updatedAt: timestamp(source.updatedAt),
    version: source.version,
    workspaceId: source.workspaceId,
  }
}

function viewEntity(view: LegacyView): DatabaseViewEntity {
  return {
    config: view.config ?? null,
    createdAt: timestamp(view.createdAt),
    databaseId: view.databaseId,
    dataSourceId: view.dataSourceId,
    id: view.id,
    name: view.name,
    position: view.position,
    type: view.type,
    updatedAt: timestamp(view.updatedAt),
  }
}

function propertyEntity(property: LegacyProperty): DatabasePropertyEntity {
  return {
    createdAt: timestamp(property.createdAt),
    dataSourceId: property.dataSourceId,
    id: property.id,
    position: property.position,
    property: {
      config: property.property.config ?? null,
      createdAt: timestamp(property.property.createdAt),
      id: property.property.id,
      name: property.property.name,
      type: property.property.type,
      updatedAt: timestamp(property.property.updatedAt),
      workspaceId: property.property.workspaceId,
    },
    propertyId: property.propertyId,
    updatedAt: timestamp(property.updatedAt),
    visible: property.visible,
    width: property.width ?? null,
  }
}

function hostEntity(
  record: LegacyPayload["database"],
  accessLevel: AccessLevel,
): DatabaseHostEntity {
  return {
    accessLevel,
    config: record.config ?? null,
    createdAt: timestamp(record.createdAt),
    id: record.id,
    name: record.name,
    pageId: record.pageId,
    updatedAt: timestamp(record.updatedAt),
    version: record.version,
    workspaceId: record.workspaceId,
  }
}

function valueEntity(value: LegacyValue): PagePropertyValueEntity {
  return {
    createdAt: timestamp(value.createdAt),
    id: value.id,
    pageId: value.pageId,
    propertyId: value.propertyId,
    updatedAt: timestamp(value.updatedAt),
    value: value.value,
  }
}

function recordEntity(
  row: LegacyRow,
  position: number,
  values: LegacyValue[],
): DatabaseRecordEntity {
  return {
    createdAt: timestamp(row.createdAt),
    dataSourceId: row.dataSourceId,
    id: row.id,
    orderKey: row.orderKey ?? databaseOrderKeyAtPosition(position),
    page: {
      createdAt: timestamp(row.page.createdAt),
      deletedAt: nullableTimestamp(row.page.deletedAt),
      hasContent: row.page.hasContent,
      id: row.page.id,
      metadata: row.page.metadata ?? null,
      name: row.page.name,
      updatedAt: timestamp(row.page.updatedAt),
    },
    pageId: row.pageId,
    parentRowId: row.parentRowId ?? null,
    updatedAt: timestamp(row.updatedAt),
    valuesByPropertyId: Object.fromEntries(
      values
        .filter((value) => value.pageId === row.pageId)
        .map((value) => [value.propertyId, valueEntity(value)]),
    ),
  }
}

async function resolveReadRecord(
  input: {
    databaseId: string
    existingRecord?: DatabaseRecord
    userId?: string
  },
  dependencies: ReadDependencies,
) {
  if (input.existingRecord) return input.existingRecord
  if (!input.userId) throw new ServiceMutationError("Unauthorized", 401)
  return dependencies.requireAccess(input.databaseId, input.userId, "view")
}

async function resolveAccessLevel(
  record: DatabaseRecord,
  userId: string | undefined,
  explicit: AccessLevel | undefined,
): Promise<AccessLevel> {
  if (explicit !== undefined) return explicit
  if (!userId) return null
  const access = await getEffectiveDatabaseAccessForRecord(record, userId)
  return access === "none" ? null : access === "comment" ? "view" : access
}

export async function getDatabaseBootstrapService(
  input: {
    accessLevel?: AccessLevel
    databaseId: string
    existingRecord?: DatabaseRecord
    includeDeleted?: boolean
    userId?: string
    viewId?: string
  },
  dependencies: ReadDependencies = defaultDependencies,
): Promise<DatabaseBootstrapResponse> {
  const record = await resolveReadRecord(input, dependencies)
  const base = await dependencies.getSchemaPayload(
    record.id,
    input.userId,
    record,
    {
      includeDeleted: input.includeDeleted,
      viewId: input.viewId,
    },
  )
  if (!base) throw new ServiceMutationError("Database not found", 404)
  if (input.viewId && !base.views.some((view) => view.id === input.viewId)) {
    throw new ServiceMutationError("Database view not found", 404)
  }

  const sourcePayloads = await Promise.all(
    base.dataSources.map((source) =>
      source.id === base.activeDataSource?.id
        ? Promise.resolve(base)
        : dependencies.getSchemaPayload(
            record.id,
            input.userId,
            record,
            { dataSourceId: source.id, includeDeleted: input.includeDeleted },
          ),
    ),
  )
  const properties = new Map<string, DatabasePropertyEntity>()
  for (const payload of sourcePayloads) {
    for (const property of payload?.properties ?? []) {
      properties.set(property.id, propertyEntity(property))
    }
  }

  return {
    database: hostEntity(
      base.database,
      await resolveAccessLevel(record, input.userId, input.accessLevel),
    ),
    dataSources: base.dataSources.map(sourceEntity),
    properties: [...properties.values()],
    views: base.views.map(viewEntity),
  }
}

export async function getDatabaseExportService(
  input: {
    dataSourceId?: string
    databaseId: string
    existingRecord?: DatabaseRecord
    userId?: string
  },
  dependencies: ReadDependencies = defaultDependencies,
): Promise<LegacyPayload> {
  const record = await resolveReadRecord(input, dependencies)
  const payload = await dependencies.getPayload(
    record.id,
    input.userId,
    record,
    input.dataSourceId ? { dataSourceId: input.dataSourceId } : undefined,
  )
  if (!payload) throw new ServiceMutationError("Database not found", 404)
  if (
    input.dataSourceId &&
    payload.activeDataSource?.id !== input.dataSourceId
  ) {
    throw new ServiceMutationError("Database data source not found", 404)
  }
  return payload
}

function windowSnapshot(input: {
  databaseVersion: number
  dataSourceVersion: number
  view: LegacyView | null
}) {
  return Buffer.from(JSON.stringify({
    databaseVersion: input.databaseVersion,
    dataSourceVersion: input.dataSourceVersion,
    viewId: input.view?.id ?? null,
    viewRevision: input.view ? timestamp(input.view.updatedAt) : null,
  })).toString("base64url")
}

function validateWindowLimit(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_DATABASE_RECORD_WINDOW_LIMIT
  ) {
    throw new ServiceMutationError(
      `limit must be between 1 and ${MAX_DATABASE_RECORD_WINDOW_LIMIT}`,
      400,
    )
  }
}

export async function getDatabaseRecordWindowService(
  input: {
    databaseId: string
    dataSourceId: string
    existingRecord?: DatabaseRecord
    includeDeleted?: boolean
    limit?: number
    now?: Date
    offset?: number
    snapshot?: string
    timezone?: string
    userId?: string
    viewId?: string
  },
  dependencies: ReadDependencies = defaultDependencies,
): Promise<DatabaseRecordWindowResponse> {
  const record = await resolveReadRecord(input, dependencies)
  const payload = await dependencies.getPayload(
    record.id,
    input.userId,
    record,
    {
      dataSourceId: input.dataSourceId,
      includeDeleted: input.includeDeleted,
      viewId: input.viewId,
    },
  )
  if (!payload) throw new ServiceMutationError("Database not found", 404)

  const source = payload.dataSources.find((item) => item.id === input.dataSourceId)
  if (!source || payload.activeDataSource?.id !== source.id) {
    throw new ServiceMutationError("Data source not found", 404)
  }
  const view = input.viewId
    ? payload.views.find((item) => item.id === input.viewId) ?? null
    : null
  if (input.viewId && (!view || view.dataSourceId !== source.id)) {
    throw new ServiceMutationError("Database view not found", 404)
  }

  const offset = input.offset ?? 0
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ServiceMutationError("offset must be a non-negative integer", 400)
  }
  const limit = input.limit ?? getDatabaseInitialPageSize(
    view?.config ?? payload.database.config,
  )
  validateWindowLimit(limit)

  const snapshot = windowSnapshot({
    databaseVersion: payload.database.version,
    dataSourceVersion: source.version,
    view,
  })
  if (input.snapshot && input.snapshot !== snapshot) {
    throw new DatabaseWindowStaleError(snapshot)
  }

  const properties = payload.properties.map(propertyEntity)
  const records = payload.rows
    .map((row, position) => recordEntity(row, position, payload.values))
    .sort((left, right) => {
      const order = parseDatabaseOrderKey(left.orderKey) -
        parseDatabaseOrderKey(right.orderKey)
      return order < 0n ? -1 : order > 0n ? 1 : left.id.localeCompare(right.id)
    })
  const evaluated = evaluateDatabaseRecordsForView({
    config: view?.config ?? payload.database.config,
    now: input.now,
    properties,
    records,
    timezone: input.timezone,
  })
  const requested = evaluated.slice(offset, offset + limit + 1)

  return {
    databaseVersion: payload.database.version,
    dataSourceVersion: source.version,
    hasMore: requested.length > limit,
    offset,
    records: requested.slice(0, limit),
    snapshot,
    totalCount: evaluated.length,
  }
}
