import { and, eq } from "drizzle-orm"
import {
  databaseHostEntitySchema,
  databasePropertyEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
} from "@zilobase/features/databases/contracts"

import type { DatabaseCommandContext } from "./framework"
import {
  dataSource,
  database,
  databaseDataSource,
  databaseProperty,
  databaseView,
  pageProperty,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"

type EntityReadContext = Pick<DatabaseCommandContext, "transaction">

const timestamp = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value

export async function getDatabaseHostEntity(context: EntityReadContext, databaseId: string) {
  const [host] = await context.transaction.select().from(database)
    .where(eq(database.id, databaseId)).limit(1)
  if (!host) throw new ServiceMutationError("Database not found", 404)
  return databaseHostEntitySchema.parse({
    accessLevel: null,
    config: host.config ?? null,
    createdAt: timestamp(host.createdAt),
    id: host.id,
    name: host.name,
    pageId: host.pageId,
    updatedAt: timestamp(host.updatedAt),
    version: host.version,
    workspaceId: host.workspaceId,
  })
}

export async function getDataSourceEntity(
  context: EntityReadContext,
  databaseId: string,
  dataSourceId: string,
) {
  const [record] = await context.transaction
    .select({ link: databaseDataSource, source: dataSource })
    .from(dataSource)
    .leftJoin(databaseDataSource, and(
      eq(databaseDataSource.databaseId, databaseId),
      eq(databaseDataSource.dataSourceId, dataSource.id),
    ))
    .where(eq(dataSource.id, dataSourceId))
    .limit(1)
  if (!record) throw new ServiceMutationError("Data source not found", 404)
  return dataSourceEntitySchema.parse({
    config: record.source.config ?? null,
    configVersion: record.source.configVersion,
    createdAt: timestamp(record.source.createdAt),
    id: record.source.id,
    linkedAt: record.link ? timestamp(record.link.createdAt) : null,
    name: record.source.name,
    parentDatabaseId: record.source.parentDatabaseId,
    position: record.link?.position ?? 0,
    updatedAt: timestamp(record.source.updatedAt),
    version: record.source.version,
    workspaceId: record.source.workspaceId,
  })
}

export async function getDatabaseViewEntity(context: EntityReadContext, viewId: string) {
  const [view] = await context.transaction.select().from(databaseView)
    .where(eq(databaseView.id, viewId)).limit(1)
  if (!view) throw new ServiceMutationError("Database view not found", 404)
  return databaseViewEntitySchema.parse({
    ...view,
    config: view.config ?? null,
    createdAt: timestamp(view.createdAt),
    updatedAt: timestamp(view.updatedAt),
  })
}

export async function getDatabasePropertyEntity(
  context: EntityReadContext,
  databasePropertyId: string,
) {
  const [record] = await context.transaction
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .where(eq(databaseProperty.id, databasePropertyId))
    .limit(1)
  if (!record) throw new ServiceMutationError("Property not found", 404)
  return databasePropertyEntitySchema.parse({
    createdAt: timestamp(record.column.createdAt),
    dataSourceId: record.column.dataSourceId,
    id: record.column.id,
    position: record.column.position,
    property: {
      config: record.property.config ?? null,
      createdAt: timestamp(record.property.createdAt),
      id: record.property.id,
      name: record.property.name,
      type: record.property.type,
      updatedAt: timestamp(record.property.updatedAt),
      workspaceId: record.property.workspaceId,
    },
    propertyId: record.column.propertyId,
    updatedAt: timestamp(record.column.updatedAt),
    visible: record.column.visible,
    width: record.column.width ?? null,
  })
}
