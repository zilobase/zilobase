import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../db";
import {
  database,
  databaseProperty,
  databaseRow,
  databaseView,
  favorite,
  page,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";
import { getDatabaseRecord } from "./database-access";

type DatabaseRecord = typeof database.$inferSelect;
type PayloadOptions = { includeDeleted?: boolean };

async function loadDatabasePayload(
  id: string,
  userId: string | undefined,
  existingRecord: DatabaseRecord | undefined,
  options: PayloadOptions | undefined,
  includeRows: boolean,
) {
  const record =
    existingRecord ??
    (await getDatabaseRecord(id, db, options));

  if (!record) {
    return null;
  }

  const propertiesPromise = db
    .select({
      column: databaseProperty,
      property: pageProperty,
    })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.databaseId, id),
        isNull(pageProperty.deletedAt),
      ),
    )
    .orderBy(asc(databaseProperty.position));
  const viewsPromise = db
    .select()
    .from(databaseView)
    .where(eq(databaseView.databaseId, id))
    .orderBy(asc(databaseView.position));
  const rowsPromise = includeRows
    ? db
        .select({
          row: databaseRow,
          page: {
            createdAt: page.createdAt,
            deletedAt: page.deletedAt,
            id: page.id,
            name: page.name,
            metadata: page.metadata,
            updatedAt: page.updatedAt,
          },
        })
        .from(databaseRow)
        .innerJoin(page, eq(databaseRow.pageId, page.id))
        .where(
          and(
            eq(databaseRow.databaseId, id),
            options?.includeDeleted ? undefined : isNull(databaseRow.deletedAt),
          ),
        )
        .orderBy(asc(databaseRow.position))
    : Promise.resolve([]);
  const favoritesPromise = userId
    ? db
        .select({ id: favorite.id })
        .from(favorite)
        .where(and(eq(favorite.userId, userId), eq(favorite.databaseId, id)))
        .limit(1)
    : Promise.resolve([]);

  const [properties, views, rows, favoriteRecords] = await Promise.all([
    propertiesPromise,
    viewsPromise,
    rowsPromise,
    favoritesPromise,
  ]);
  const pageIds = rows.map(({ row }) => row.pageId);
  const propertyIds = properties.map(({ property }) => property.id);
  const values =
    pageIds.length > 0 && propertyIds.length > 0
      ? await db
          .select()
          .from(pagePropertyValue)
          .where(
            and(
              inArray(pagePropertyValue.pageId, pageIds),
              inArray(pagePropertyValue.propertyId, propertyIds),
            ),
          )
      : [];

  return {
    database: { ...record, isFavorite: favoriteRecords.length > 0 },
    properties: properties.map(({ column, property }) => ({
      ...column,
      property,
    })),
    views,
    rows: rows.map(({ row, page: rowPage }) => ({
      ...row,
      page: rowPage,
    })),
    values,
  };
}

export function getDatabasePayload(
  id: string,
  userId?: string,
  existingRecord?: DatabaseRecord,
  options?: PayloadOptions,
) {
  return loadDatabasePayload(id, userId, existingRecord, options, true);
}

export function getDatabaseSchemaPayload(
  id: string,
  userId?: string,
  existingRecord?: DatabaseRecord,
  options?: PayloadOptions,
) {
  return loadDatabasePayload(id, userId, existingRecord, options, false);
}
