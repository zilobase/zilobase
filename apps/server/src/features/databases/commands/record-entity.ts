import { and, eq } from "drizzle-orm"
import {
  databaseRecordEntitySchema,
  type DatabaseRecordEntity,
} from "@zilobase/features/databases/contracts"

import type { DatabaseCommandContext } from "./framework"
import {
  databaseProperty,
  databaseRow,
  page,
  pagePropertyValue,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"

const timestamp = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value
const nullableTimestamp = (value: Date | string | null) =>
  value === null ? null : timestamp(value)

export async function getDatabaseRecordEntity(
  transaction: DatabaseCommandContext["transaction"],
  dataSourceId: string,
  rowId: string,
): Promise<DatabaseRecordEntity> {
  const [record] = await transaction
    .select({ page, row: databaseRow })
    .from(databaseRow)
    .innerJoin(page, eq(page.id, databaseRow.pageId))
    .where(and(
      eq(databaseRow.id, rowId),
      eq(databaseRow.dataSourceId, dataSourceId),
    ))
    .limit(1)
  if (!record) throw new ServiceMutationError("Row not found", 404)

  const values = await transaction
    .select({ value: pagePropertyValue })
    .from(pagePropertyValue)
    .innerJoin(databaseProperty, and(
      eq(databaseProperty.propertyId, pagePropertyValue.propertyId),
      eq(databaseProperty.dataSourceId, dataSourceId),
    ))
    .where(eq(pagePropertyValue.pageId, record.row.pageId))

  return databaseRecordEntitySchema.parse({
    createdAt: timestamp(record.row.createdAt),
    dataSourceId: record.row.dataSourceId,
    id: record.row.id,
    orderKey: record.row.orderKey,
    page: {
      createdAt: timestamp(record.page.createdAt),
      deletedAt: nullableTimestamp(record.page.deletedAt),
      hasContent: record.page.hasContent,
      id: record.page.id,
      metadata: record.page.metadata ?? null,
      name: record.page.name,
      updatedAt: timestamp(record.page.updatedAt),
    },
    pageId: record.row.pageId,
    parentRowId: record.row.parentRowId ?? null,
    updatedAt: timestamp(record.row.updatedAt),
    valuesByPropertyId: Object.fromEntries(values.map(({ value }) => [
      value.propertyId,
      {
        createdAt: timestamp(value.createdAt),
        id: value.id,
        pageId: value.pageId,
        propertyId: value.propertyId,
        updatedAt: timestamp(value.updatedAt),
        value: value.value,
      },
    ])),
  })
}
