import { and, eq, isNull } from "drizzle-orm"
import {
  mailSystemPropertyCatalog,
  normalizeMailViewConfig,
  type MailCustomPropertyType,
  type MailDatabaseSyncConfig,
  type MailViewConfig,
} from "@zilobase/features/mail"

import { requireDatabaseEditAccess } from "../databases/access/database-access"
import { requireDataSourceEditAccess } from "../databases/access/data-source-access"
import { ServiceMutationError } from "../../shared/errors/service-mutation-error"
import { db } from "../../infrastructure/database"
import {
  databaseDataSource,
  databaseProperty,
  mailProperty,
  pageProperty,
} from "../../infrastructure/database/schema"
import { MailViewServiceError } from "./mail-view-errors"

type SourceType = MailCustomPropertyType | (typeof mailSystemPropertyCatalog)[number]["type"]

export async function prepareMailDatabaseSyncConfig(input: {
  bindingId: string
  config: MailViewConfig
  previousConfig?: MailViewConfig
  userId?: string
  workspaceId?: string
}) {
  const config = normalizeMailViewConfig(input.config)
  const sync = config.databaseSync
  if (!sync.enabled) {
    return {
      ...config,
      databaseSync: { ...sync, activatedAt: null, enabled: false },
    }
  }
  if (!input.userId || !input.workspaceId) {
    throw new MailViewServiceError("Database sync requires a workspace member.", 403)
  }
  const databaseId = requiredId(sync.destinationDatabaseId, "Choose a destination database.")
  const dataSourceId = requiredId(sync.destinationDataSourceId, "Choose a destination data source.")
  if (sync.workspaceId && sync.workspaceId !== input.workspaceId) {
    throw new MailViewServiceError("Mail can only sync to the active workspace.", 403)
  }

  try {
    const [databaseRecord, sourceRecord] = await Promise.all([
      requireDatabaseEditAccess(databaseId, input.userId),
      requireDataSourceEditAccess(dataSourceId, input.userId),
    ])
    if (databaseRecord.workspaceId !== input.workspaceId || sourceRecord.workspaceId !== input.workspaceId) {
      throw new MailViewServiceError("Mail can only sync to the active workspace.", 403)
    }
    const [link] = await db.select({ dataSourceId: databaseDataSource.dataSourceId })
      .from(databaseDataSource)
      .where(and(eq(databaseDataSource.databaseId, databaseId), eq(databaseDataSource.dataSourceId, dataSourceId)))
      .limit(1)
    if (!link) throw new MailViewServiceError("The selected data source is not part of this database.", 400)
  } catch (error) {
    if (error instanceof MailViewServiceError) throw error
    if (error instanceof ServiceMutationError) {
      throw new MailViewServiceError(error.message, error.status === 404 ? 404 : 403)
    }
    throw error
  }

  const [customProperties, destinationProperties] = await Promise.all([
    db.select({ id: mailProperty.id, type: mailProperty.type })
      .from(mailProperty)
      .where(eq(mailProperty.bindingId, input.bindingId)),
    db.select({ id: pageProperty.id, type: pageProperty.type })
      .from(databaseProperty)
      .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
      .where(and(eq(databaseProperty.dataSourceId, dataSourceId), isNull(pageProperty.deletedAt))),
  ])
  validateMappings(sync, new Map<string, SourceType>([
    ...mailSystemPropertyCatalog.map((property) => [property.id, property.type] as const),
    ...customProperties.map((property) => [property.id, property.type as MailCustomPropertyType] as const),
  ]), new Map(destinationProperties.map((property) => [property.id, property.type])))

  return {
    ...config,
    databaseSync: {
      ...sync,
      activatedAt: input.previousConfig?.databaseSync.enabled
        ? input.previousConfig.databaseSync.activatedAt ?? new Date().toISOString()
        : new Date().toISOString(),
      destinationDataSourceId: dataSourceId,
      destinationDatabaseId: databaseId,
      enabled: true,
      workspaceId: input.workspaceId,
    },
  }
}

function validateMappings(sync: MailDatabaseSyncConfig, sources: Map<string, SourceType>, destinations: Map<string, string>) {
  if (!sync.mappings.length || sync.mappings.length > 50) {
    throw new MailViewServiceError("Add between 1 and 50 explicit database mappings.", 400)
  }
  if (!sync.mappings.some((mapping) => mapping.sourcePropertyId === "subject" && mapping.destinationPropertyId === "title")) {
    throw new MailViewServiceError("Subject must be mapped to the database title.", 400)
  }
  const sourceIds = new Set<string>()
  const destinationIds = new Set<string>()
  for (const mapping of sync.mappings) {
    if (!mapping.sourcePropertyId || !mapping.destinationPropertyId || sourceIds.has(mapping.sourcePropertyId) || destinationIds.has(mapping.destinationPropertyId)) {
      throw new MailViewServiceError("Each source and destination may be mapped only once.", 400)
    }
    sourceIds.add(mapping.sourcePropertyId)
    destinationIds.add(mapping.destinationPropertyId)
    if (mapping.destinationPropertyId === "title") {
      if (mapping.sourcePropertyId !== "subject") throw new MailViewServiceError("Only Subject can map to the database title.", 400)
      continue
    }
    const sourceType = sources.get(mapping.sourcePropertyId)
    const destinationType = destinations.get(mapping.destinationPropertyId)
    if (!sourceType || !destinationType || !isMailDatabaseMappingCompatible(sourceType, destinationType)) {
      throw new MailViewServiceError("A database mapping uses missing or incompatible properties.", 400)
    }
  }
}

export function isMailDatabaseMappingCompatible(sourceType: SourceType, destinationType: string) {
  if (sourceType === "address") return destinationType === "text" || destinationType === "email"
  if (sourceType === "boolean") return destinationType === "checkbox"
  if (sourceType === "mailbox") return ["text", "select", "multi_select", "status"].includes(destinationType)
  if (sourceType === "select") return ["text", "select", "multi_select", "status"].includes(destinationType)
  return sourceType === destinationType
}

function requiredId(value: string | null, message: string) {
  if (!value?.trim()) throw new MailViewServiceError(message, 400)
  return value
}
