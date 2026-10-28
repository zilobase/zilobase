import { verificationPropertyValues } from "../../pages/verification-values";
import type {
  DatabaseBootstrapResponse,
  DatabaseHostEntity,
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DatabaseRecordWindowResponse,
  DatabaseViewEntity,
  DataSourceEntity,
  PagePropertyValueEntity,
} from "@zilobase/features/runtime";
import {
  databaseOrderKeyAtPosition,
  databaseViewQueryHash,
  evaluateDatabaseRecordsForView,
  getDatabaseInitialPageSize,
  getDatabaseTitleSource,
  parseDatabaseOrderKey,
} from "@zilobase/features/runtime";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseDataSource,
  databaseProperty,
  databaseRow,
  databaseView,
  dataSource,
  page,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import {
  canAccessDatabaseRecord,
  getEffectiveDatabaseAccessForRecord,
} from "../../access/effective-access";
import { getDatabaseRecord, requireDatabaseAccess } from "../access/database-access";
import { getDatabaseExportPayload } from "../mutations/payload";
import { withDatabaseReadSnapshot } from "./snapshot";

type DatabaseRecord = typeof database.$inferSelect;
type AccessLevel = DatabaseHostEntity["accessLevel"];
type DatabaseExportPayload = NonNullable<Awaited<ReturnType<typeof getDatabaseExportPayload>>>;
type SourceRecord = typeof dataSource.$inferSelect & {
  linkedAt: Date | null;
  position: number;
};
type ViewRecord = typeof databaseView.$inferSelect;
type PropertyRecord = {
  column: typeof databaseProperty.$inferSelect;
  property: typeof pageProperty.$inferSelect;
};
type RowRecord = {
  page: Pick<
    typeof page.$inferSelect,
    | "createdAt"
    | "deletedAt"
    | "hasContent"
    | "id"
    | "metadata"
    | "name"
    | "updatedAt"
    | "verifiedAt"
    | "verifiedById"
    | "verificationExpiresAt"
    | "verificationUpdatedAt"
  >;
  row: typeof databaseRow.$inferSelect;
};

type DatabaseReadModel = {
  dataSources: DataSourceEntity[];
  properties: DatabasePropertyEntity[];
  records: DatabaseRecordEntity[];
  views: DatabaseViewEntity[];
};

type ReadDependencies = {
  getPayload: typeof getDatabaseExportPayload;
  loadReadModel: typeof loadDatabaseReadModel;
  requireAccess: typeof requireDatabaseAccess;
  readSnapshot?: typeof withDatabaseReadSnapshot;
  reloadRecord?: (id: string) => Promise<DatabaseRecord | undefined>;
};

const defaultDependencies: ReadDependencies = {
  getPayload: getDatabaseExportPayload,
  loadReadModel: loadDatabaseReadModel,
  requireAccess: requireDatabaseAccess,
  readSnapshot: withDatabaseReadSnapshot,
  reloadRecord: (id) => getDatabaseRecord(id, { includeDeleted: true }),
};

export const DATABASE_RECORD_WINDOW_LIMITS = [10, 25, 50, 100] as const;
export const MAX_DATABASE_RECORD_WINDOW_LIMIT = 1_001;

export class DatabaseWindowStaleError extends ServiceMutationError {
  readonly code = "WINDOW_STALE" as const;

  constructor(readonly currentSnapshot: string) {
    super("The database record window is stale", 409);
    this.name = "DatabaseWindowStaleError";
  }
}

export class DatabaseViewQueryChangedError extends ServiceMutationError {
  readonly code = "VIEW_QUERY_CHANGED" as const;

  constructor() {
    super("The saved database view query has changed", 409);
    this.name = "DatabaseViewQueryChangedError";
  }
}

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableTimestamp(value: Date | string | null | undefined) {
  return value == null ? null : timestamp(value);
}

function sourceEntity(source: SourceRecord): DataSourceEntity {
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
  };
}

function viewEntity(view: ViewRecord): DatabaseViewEntity {
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
  };
}

function propertyEntity({ column, property }: PropertyRecord): DatabasePropertyEntity {
  return {
    createdAt: timestamp(column.createdAt),
    dataSourceId: column.dataSourceId,
    id: column.id,
    position: column.position,
    property: {
      config: property.config ?? null,
      deletedAt: nullableTimestamp(property.deletedAt),
      createdAt: timestamp(property.createdAt),
      id: property.id,
      name: property.name,
      type: property.type,
      updatedAt: timestamp(property.updatedAt),
      workspaceId: property.workspaceId,
    },
    propertyId: column.propertyId,
    updatedAt: timestamp(column.updatedAt),
    visible: column.visible,
    width: column.width ?? null,
  };
}

function hostEntity(record: DatabaseRecord, accessLevel: AccessLevel): DatabaseHostEntity {
  return {
    accessLevel,
    config: record.config ?? null,
    createdAt: timestamp(record.createdAt),
    deletedAt: nullableTimestamp(record.deletedAt),
    id: record.id,
    name: record.name,
    pageId: record.pageId,
    updatedAt: timestamp(record.updatedAt),
    version: record.version,
    workspaceId: record.workspaceId,
  };
}

function valueEntity(value: typeof pagePropertyValue.$inferSelect): PagePropertyValueEntity {
  return {
    createdAt: timestamp(value.createdAt),
    id: value.id,
    pageId: value.pageId,
    propertyId: value.propertyId,
    updatedAt: timestamp(value.updatedAt),
    value: value.value,
  };
}

function recordEntity(
  entry: RowRecord,
  position: number,
  values: Array<typeof pagePropertyValue.$inferSelect>,
  properties: PropertyRecord[],
): DatabaseRecordEntity {
  const { page: rowPage, row } = entry;
  return {
    createdAt: timestamp(row.createdAt),
    dataSourceId: row.dataSourceId,
    id: row.id,
    orderKey: row.orderKey ?? databaseOrderKeyAtPosition(position),
    page: {
      createdAt: timestamp(rowPage.createdAt),
      deletedAt: nullableTimestamp(rowPage.deletedAt),
      hasContent: rowPage.hasContent,
      id: rowPage.id,
      metadata: rowPage.metadata ?? null,
      name: rowPage.name,
      updatedAt: timestamp(rowPage.updatedAt),
    },
    pageId: row.pageId,
    parentRowId: row.parentRowId ?? null,
    updatedAt: timestamp(row.updatedAt),
    valuesByPropertyId: Object.fromEntries(
      [
        ...values.filter((value) => value.pageId === row.pageId).map(valueEntity),
        ...verificationPropertyValues(
          rowPage,
          properties
            .filter(({ column }) => column.dataSourceId === row.dataSourceId)
            .map(({ property }) => property),
        ),
      ].map((value) => [value.propertyId, value]),
    ),
  };
}

async function loadAccessibleSourceLinks(input: {
  includeDeleted?: boolean;
  authorizeForeignParents?: (records: DatabaseRecord[]) => Promise<ReadonlySet<string>>;
  records: DatabaseRecord[];
  userId?: string;
}) {
  if (!input.records.length) return [];
  const sourceLinks = await db
    .select({ link: databaseDataSource, source: dataSource })
    .from(databaseDataSource)
    .innerJoin(dataSource, eq(databaseDataSource.dataSourceId, dataSource.id))
    .where(
      and(
        inArray(
          databaseDataSource.databaseId,
          input.records.map((record) => record.id),
        ),
        input.includeDeleted ? undefined : isNull(dataSource.deletedAt),
      ),
    )
    .orderBy(asc(databaseDataSource.position), asc(dataSource.id));
  const foreignParentIds = [
    ...new Set(
      sourceLinks
        .filter(({ source, link }) => source.parentDatabaseId !== link.databaseId)
        .map(({ source }) => source.parentDatabaseId),
    ),
  ];
  const foreignParents = foreignParentIds.length
    ? await db
        .select()
        .from(database)
        .where(
          and(
            inArray(database.id, foreignParentIds),
            input.includeDeleted ? undefined : isNull(database.deletedAt),
          ),
        )
    : [];
  const foreignParentsById = new Map(foreignParents.map((parent) => [parent.id, parent]));
  const authorizedParents = input.authorizeForeignParents
    ? await input.authorizeForeignParents(foreignParents)
    : null;
  const accessibleLinks: typeof sourceLinks = [];
  const permissions = new Map<string, Promise<boolean>>();
  for (const link of sourceLinks) {
    if (link.source.parentDatabaseId === link.link.databaseId) {
      accessibleLinks.push(link);
      continue;
    }
    const parent = foreignParentsById.get(link.source.parentDatabaseId);
    if (parent && authorizedParents) {
      if (authorizedParents.has(parent.id)) accessibleLinks.push(link);
      continue;
    }
    if (parent && input.userId) {
      let allowed = permissions.get(parent.id);
      if (!allowed) {
        allowed = canAccessDatabaseRecord(parent, input.userId, "view");
        permissions.set(parent.id, allowed);
      }
      if (await allowed) accessibleLinks.push(link);
    }
  }

  return accessibleLinks;
}

export async function getAuthorizedDatabaseSourceIds(record: DatabaseRecord, userId: string) {
  return (await loadAccessibleSourceLinks({ records: [record], userId })).map(
    ({ source }) => source.id,
  );
}

/** Batch search headings without loading properties or records. Hosts must already be authorized. */
export async function getDatabaseTitleSourcesService(
  records: DatabaseRecord[],
  userId: string,
  authorizeForeignParents?: (records: DatabaseRecord[]) => Promise<ReadonlySet<string>>,
) {
  if (!records.length) return new Map<string, DataSourceEntity | null>();
  const [links, views] = await Promise.all([
    loadAccessibleSourceLinks({ records, userId, authorizeForeignParents }),
    db
      .select({
        id: databaseView.id,
        databaseId: databaseView.databaseId,
        dataSourceId: databaseView.dataSourceId,
        position: databaseView.position,
      })
      .from(databaseView)
      .where(
        inArray(
          databaseView.databaseId,
          records.map((record) => record.id),
        ),
      ),
  ]);
  return new Map(
    records.map((record) => {
      const sources = links
        .filter(({ link }) => link.databaseId === record.id)
        .map(({ source, link }) =>
          sourceEntity({ ...source, position: link.position, linkedAt: link.createdAt }),
        );
      const allowedIds = new Set(sources.map((source) => source.id));
      return [
        record.id,
        getDatabaseTitleSource(
          sources,
          views.filter(
            (view) => view.databaseId === record.id && allowedIds.has(view.dataSourceId),
          ),
        ),
      ] as const;
    }),
  );
}

async function loadDatabaseReadModel(input: {
  dataSourceId?: string;
  includeDeleted?: boolean;
  record: DatabaseRecord;
  userId?: string;
}): Promise<DatabaseReadModel> {
  const [accessibleLinks, storedViews] = await Promise.all([
    loadAccessibleSourceLinks({ ...input, records: [input.record] }),
    db
      .select()
      .from(databaseView)
      .where(eq(databaseView.databaseId, input.record.id))
      .orderBy(asc(databaseView.position), asc(databaseView.id)),
  ]);

  const accessibleSourceIds = accessibleLinks.map(({ source }) => source.id);
  const requestedSourceIds = input.dataSourceId
    ? accessibleSourceIds.filter((id) => id === input.dataSourceId)
    : accessibleSourceIds;
  const properties = requestedSourceIds.length
    ? await db
        .select({ column: databaseProperty, property: pageProperty })
        .from(databaseProperty)
        .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
        .where(
          and(
            inArray(databaseProperty.dataSourceId, requestedSourceIds),
            isNull(pageProperty.deletedAt),
          ),
        )
        .orderBy(asc(databaseProperty.position), asc(databaseProperty.id))
    : [];

  const rows =
    input.dataSourceId && requestedSourceIds.length
      ? await db
          .select({
            page: {
              verifiedAt: page.verifiedAt,
              verifiedById: page.verifiedById,
              verificationExpiresAt: page.verificationExpiresAt,
              verificationUpdatedAt: page.verificationUpdatedAt,
              createdAt: page.createdAt,
              deletedAt: page.deletedAt,
              hasContent: page.hasContent,
              id: page.id,
              metadata: page.metadata,
              name: page.name,
              updatedAt: page.updatedAt,
            },
            row: databaseRow,
          })
          .from(databaseRow)
          .innerJoin(page, eq(databaseRow.pageId, page.id))
          .where(
            and(
              eq(databaseRow.dataSourceId, input.dataSourceId),
              input.includeDeleted ? undefined : isNull(databaseRow.deletedAt),
            ),
          )
          .orderBy(asc(databaseRow.orderKey), asc(databaseRow.id))
      : [];
  const pageIds = rows.map(({ row }) => row.pageId);
  const propertyIds = properties.map(({ property }) => property.id);
  const values =
    pageIds.length && propertyIds.length
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
    dataSources: accessibleLinks.map(({ link, source }) =>
      sourceEntity({
        ...source,
        linkedAt: link.createdAt,
        position: link.position,
      }),
    ),
    properties: properties.map(propertyEntity),
    records: rows.map((entry, position) => recordEntity(entry, position, values, properties)),
    views: storedViews
      .filter((view) => accessibleSourceIds.includes(view.dataSourceId))
      .map(viewEntity),
  };
}

async function resolveReadRecord(
  input: {
    databaseId: string;
    existingRecord?: DatabaseRecord;
    userId?: string;
  },
  dependencies: ReadDependencies,
) {
  if (input.existingRecord) {
    // Route authorization may predate the read transaction. Refresh its version
    // and metadata inside the same snapshot as sources, properties and records.
    if (!dependencies.reloadRecord) return input.existingRecord;
    const record = await dependencies.reloadRecord(input.databaseId);
    if (!record) throw new ServiceMutationError("Database not found", 404);
    return record;
  }
  if (!input.userId) throw new ServiceMutationError("Unauthorized", 401);
  return dependencies.requireAccess(input.databaseId, input.userId, "view");
}

async function resolveAccessLevel(
  record: DatabaseRecord,
  userId: string | undefined,
  explicit: AccessLevel | undefined,
): Promise<AccessLevel> {
  if (explicit !== undefined) return explicit;
  if (!userId) return null;
  const access = await getEffectiveDatabaseAccessForRecord(record, userId);
  return access === "none" ? null : access === "comment" ? "view" : access;
}

export async function getDatabaseBootstrapService(
  input: {
    accessLevel?: AccessLevel;
    databaseId: string;
    existingRecord?: DatabaseRecord;
    includeDeleted?: boolean;
    userId?: string;
    viewId?: string;
  },
  dependencies: ReadDependencies = defaultDependencies,
): Promise<DatabaseBootstrapResponse> {
  const read = async () => {
    const record = await resolveReadRecord(input, dependencies);
    const model = await dependencies.loadReadModel({
      includeDeleted: input.includeDeleted,
      record,
      userId: input.userId,
    });
    if (input.viewId && !model.views.some((view) => view.id === input.viewId)) {
      throw new ServiceMutationError("Database view not found", 404);
    }

    return {
      database: hostEntity(
        record,
        await resolveAccessLevel(record, input.userId, input.accessLevel),
      ),
      dataSources: model.dataSources,
      properties: model.properties,
      views: model.views,
    };
  };
  return dependencies.readSnapshot ? dependencies.readSnapshot(read) : read();
}

export async function getDatabaseExportService(
  input: {
    dataSourceId?: string;
    rowLimit?: number;
    databaseId: string;
    existingRecord?: DatabaseRecord;
    userId?: string;
  },
  dependencies: ReadDependencies = defaultDependencies,
): Promise<DatabaseExportPayload> {
  const read = async () => {
    const record = await resolveReadRecord(input, dependencies);
    const payload = await dependencies.getPayload(
      record.id,
      input.userId,
      record,
      input.dataSourceId || input.rowLimit !== undefined
        ? {
            ...(input.dataSourceId ? { dataSourceId: input.dataSourceId } : {}),
            ...(input.rowLimit === undefined ? {} : { rowLimit: input.rowLimit }),
          }
        : undefined,
    );
    if (!payload) throw new ServiceMutationError("Database not found", 404);
    if (input.dataSourceId && payload.activeDataSource?.id !== input.dataSourceId) {
      throw new ServiceMutationError("Database data source not found", 404);
    }
    return payload;
  };
  return dependencies.readSnapshot ? dependencies.readSnapshot(read) : read();
}

function windowSnapshot(input: {
  databaseVersion: number;
  dataSourceVersion: number;
  view: DatabaseViewEntity | null;
}) {
  return Buffer.from(
    JSON.stringify({
      databaseVersion: input.databaseVersion,
      dataSourceVersion: input.dataSourceVersion,
      viewId: input.view?.id ?? null,
      viewRevision: input.view ? timestamp(input.view.updatedAt) : null,
    }),
  ).toString("base64url");
}

function validateWindowLimit(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DATABASE_RECORD_WINDOW_LIMIT) {
    throw new ServiceMutationError(
      `limit must be between 1 and ${MAX_DATABASE_RECORD_WINDOW_LIMIT}`,
      400,
    );
  }
}

export async function getDatabaseRecordWindowService(
  input: {
    databaseId: string;
    dataSourceId: string;
    existingRecord?: DatabaseRecord;
    includeDeleted?: boolean;
    limit?: number;
    now?: Date;
    offset?: number;
    snapshot?: string;
    expectedQueryHash?: string;
    timezone?: string;
    userId?: string;
    viewId?: string;
  },
  dependencies: ReadDependencies = defaultDependencies,
): Promise<DatabaseRecordWindowResponse> {
  const read = async () => {
    const record = await resolveReadRecord(input, dependencies);
    const model = await dependencies.loadReadModel({
      dataSourceId: input.dataSourceId,
      includeDeleted: input.includeDeleted,
      record,
      userId: input.userId,
    });
    const source = model.dataSources.find((item) => item.id === input.dataSourceId);
    if (!source) {
      throw new ServiceMutationError("Data source not found", 404);
    }
    const view = input.viewId
      ? (model.views.find((item) => item.id === input.viewId) ?? null)
      : null;
    if (input.viewId && (!view || view.dataSourceId !== source.id)) {
      throw new ServiceMutationError("Database view not found", 404);
    }

    const offset = input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new ServiceMutationError("offset must be a non-negative integer", 400);
    }
    const limit = input.limit ?? getDatabaseInitialPageSize(view?.config ?? record.config);
    validateWindowLimit(limit);

    const queryHash = databaseViewQueryHash(view?.config ?? record.config, input.includeDeleted);
    if (input.expectedQueryHash !== undefined && input.expectedQueryHash !== queryHash)
      throw new DatabaseViewQueryChangedError();

    const snapshot = windowSnapshot({
      databaseVersion: record.version,
      dataSourceVersion: source.version,
      view,
    });
    if (input.snapshot && input.snapshot !== snapshot) {
      throw new DatabaseWindowStaleError(snapshot);
    }

    const records = model.records
      .filter((record) => input.includeDeleted || !record.page.deletedAt)
      .sort((left, right) => {
        const order = parseDatabaseOrderKey(left.orderKey) - parseDatabaseOrderKey(right.orderKey);
        return order < 0n ? -1 : order > 0n ? 1 : left.id.localeCompare(right.id);
      });
    const evaluated = evaluateDatabaseRecordsForView({
      config: view?.config ?? record.config,
      now: input.now,
      properties: model.properties,
      records,
      timezone: input.timezone,
    });
    const requested = evaluated.slice(offset, offset + limit + 1);

    return {
      queryHash,
      databaseVersion: record.version,
      dataSourceVersion: source.version,
      hasMore: requested.length > limit,
      offset,
      records: requested.slice(0, limit),
      snapshot,
      totalCount: evaluated.length,
    };
  };
  return dependencies.readSnapshot ? dependencies.readSnapshot(read) : read();
}
