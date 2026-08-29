import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { canAccessDatabaseRecord } from "../access";
import { db } from "../infrastructure/database";
import {
  dataSource,
  database,
  databaseDataSource,
  databaseProperty,
  databaseRow,
  databaseView,
  favorite,
  page,
  pageProperty,
  pagePropertyValue,
} from "../infrastructure/database/schema";
import { getDatabaseRecord } from "./database-access";

type DatabaseRecord = typeof database.$inferSelect;
type PayloadOptions = {
  dataSourceId?: string;
  includeDeleted?: boolean;
  viewId?: string;
};

async function loadDatabasePayload(
  id: string,
  userId: string | undefined,
  existingRecord: DatabaseRecord | undefined,
  options: PayloadOptions | undefined,
  includeRows: boolean,
) {
  const record = existingRecord ?? (await getDatabaseRecord(id, db, options));
  if (!record) return null;

  const [sourceLinks, allViews, favoriteRecords] = await Promise.all([
    db
      .select({ link: databaseDataSource, source: dataSource })
      .from(databaseDataSource)
      .innerJoin(dataSource, eq(databaseDataSource.dataSourceId, dataSource.id))
      .where(
        and(
          eq(databaseDataSource.databaseId, id),
          options?.includeDeleted ? undefined : isNull(dataSource.deletedAt),
        ),
      )
      .orderBy(asc(databaseDataSource.position)),
    db
      .select()
      .from(databaseView)
      .where(eq(databaseView.databaseId, id))
      .orderBy(asc(databaseView.position)),
    userId
      ? db
          .select({ id: favorite.id })
          .from(favorite)
          .where(and(eq(favorite.userId, userId), eq(favorite.databaseId, id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const foreignParentIds = [
    ...new Set(
      sourceLinks
        .map(({ source }) => source.parentDatabaseId)
        .filter((parentId) => parentId !== id),
    ),
  ];
  const foreignParents =
    foreignParentIds.length > 0
      ? await db
          .select()
          .from(database)
          .where(
            and(
              inArray(database.id, foreignParentIds),
              options?.includeDeleted ? undefined : isNull(database.deletedAt),
            ),
          )
      : [];
  const foreignParentsById = new Map(
    foreignParents.map((parent) => [parent.id, parent]),
  );
  const accessibleLinks: typeof sourceLinks = [];

  for (const sourceLink of sourceLinks) {
    if (sourceLink.source.parentDatabaseId === id) {
      accessibleLinks.push(sourceLink);
      continue;
    }

    const parent = foreignParentsById.get(sourceLink.source.parentDatabaseId);
    if (
      parent &&
      userId &&
      (await canAccessDatabaseRecord(parent, userId, "view"))
    ) {
      accessibleLinks.push(sourceLink);
    }
  }

  const accessibleSourceIds = new Set(
    accessibleLinks.map(({ source }) => source.id),
  );
  const views = allViews.filter((view) =>
    accessibleSourceIds.has(view.dataSourceId),
  );
  const requestedView = options?.viewId
    ? views.find((view) => view.id === options.viewId)
    : undefined;
  const requestedSourceId = requestedView?.dataSourceId ?? options?.dataSourceId;
  const activeLink = requestedSourceId
    ? accessibleLinks.find(({ source }) => source.id === requestedSourceId)
    : accessibleLinks[0];

  if (!activeLink) {
    return {
      activeDataSource: null,
      dataSources: [],
      database: {
        ...record,
        dataSourceConfig: null,
        isFavorite: favoriteRecords.length > 0,
      },
      properties: [],
      rows: [],
      values: [],
      views,
    };
  }

  const sourceId = activeLink.source.id;
  const propertiesPromise = db
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.dataSourceId, sourceId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .orderBy(asc(databaseProperty.position));
  const rowsPromise = includeRows
    ? db
        .select({
          row: databaseRow,
          page: {
            createdAt: page.createdAt,
            deletedAt: page.deletedAt,
            hasContent: page.hasContent,
            id: page.id,
            metadata: page.metadata,
            name: page.name,
            updatedAt: page.updatedAt,
          },
        })
        .from(databaseRow)
        .innerJoin(page, eq(databaseRow.pageId, page.id))
        .where(
          and(
            eq(databaseRow.dataSourceId, sourceId),
            options?.includeDeleted ? undefined : isNull(databaseRow.deletedAt),
          ),
        )
        .orderBy(asc(databaseRow.position))
    : Promise.resolve([]);
  const [properties, rows] = await Promise.all([propertiesPromise, rowsPromise]);
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
    activeDataSource: activeLink.source,
    dataSources: accessibleLinks.map(({ link, source }) => ({
      ...source,
      linkedAt: link.createdAt,
      position: link.position,
    })),
    database: {
      ...record,
      dataSourceConfig: activeLink.source.config,
      isFavorite: favoriteRecords.length > 0,
    },
    properties: properties.map(({ column, property }) => ({
      ...column,
      property,
    })),
    rows: rows.map(({ row, page: rowPage }) => ({ ...row, page: rowPage })),
    values,
    views,
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
