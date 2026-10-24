import { deriveContentVerification, type ContentVerification } from "@zilobase/features/search";
import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import {
  sourceRecordQuerySchema,
  type SourceRecordQuery,
  type SourceRecordPosition,
  type SourceReadRevision,
} from "@zilobase/features/runtime";
import { db } from "../../../infrastructure/database";
import {
  databaseProperty,
  databaseView,
  databaseRow,
  dataSource,
  page,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { ServerOperationError, type ServerOperationContext } from "../../operations/context";
import { readableDatabase } from "./operations";
import { getAuthorizedDatabaseSourceIds } from "./service";
import { withDatabaseReadSnapshot } from "./snapshot";

const deny = (error: string, status = 422): never => {
  throw new ServerOperationError({ error }, status);
};
const boundedSnapshot = <T>(read: () => Promise<T>) =>
  withDatabaseReadSnapshot(async () => {
    await db.execute(sql`set local statement_timeout = '10000ms'`);
    return read();
  });

export async function authorizeSourceRead(
  context: ServerOperationContext,
  databaseId: string,
  sourceId?: string,
) {
  const readable = await readableDatabase(context, databaseId, false);
  if (readable.viewerType === "public" || !readable.user)
    deny("Source is no longer accessible", 403);
  const allowed = await getAuthorizedDatabaseSourceIds(readable.record, readable.user!.id);
  if (sourceId && !allowed.includes(sourceId)) deny("Source is no longer accessible", 403);
  return { ...readable, allowed };
}

async function metadataScope(
  context: ServerOperationContext,
  input: { databaseId: string; dataSourceId?: string },
) {
  const access = await authorizeSourceRead(context, input.databaseId, input.dataSourceId);
  const [source] = input.dataSourceId
    ? await db
        .select()
        .from(dataSource)
        .where(and(eq(dataSource.id, input.dataSourceId), isNull(dataSource.deletedAt)))
    : [];
  if (input.dataSourceId && (!source || source.workspaceId !== access.record.workspaceId))
    deny("Source unavailable", 403);
  return { access, source, revision: `${access.record.version}:${source?.version ?? "host"}` };
}

/** Reauthorize and check metadata versions before reusing a run-local inspection. */
export async function readDatabaseMetadataRevision(
  context: ServerOperationContext,
  input: { databaseId: string; dataSourceId?: string },
) {
  return boundedSnapshot(async () => (await metadataScope(context, input)).revision);
}

/** Metadata pagination never loads database rows or property values. */
export async function describeDatabaseSource(
  context: ServerOperationContext,
  input: {
    databaseId: string;
    dataSourceId?: string;
    section: "sources" | "properties" | "views";
    after?: string;
    revision?: string;
    limit?: number;
  },
) {
  return boundedSnapshot(async () => {
    const { access, source, revision } = await metadataScope(context, input);
    if (input.revision && input.revision !== revision) deny("SOURCE_CHANGED", 409);
    const limit = Math.min(50, Math.max(1, input.limit ?? 25));
    let entries: Array<Record<string, unknown> & { id: string }>;
    if (input.section === "sources") {
      entries = access.allowed.length
        ? await db
            .select({ id: dataSource.id, name: dataSource.name, version: dataSource.version })
            .from(dataSource)
            .where(
              and(
                inArray(dataSource.id, access.allowed),
                eq(dataSource.workspaceId, access.record.workspaceId),
                input.after ? gt(dataSource.id, input.after) : undefined,
                isNull(dataSource.deletedAt),
              ),
            )
            .orderBy(asc(dataSource.id))
            .limit(limit + 1)
        : [];
    } else {
      if (!source) deny("Select a data source before reading properties or views");
      entries =
        input.section === "properties"
          ? await db
              .select({
                id: pageProperty.id,
                name: pageProperty.name,
                type: pageProperty.type,
                config: pageProperty.config,
              })
              .from(databaseProperty)
              .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
              .where(
                and(
                  eq(databaseProperty.dataSourceId, source!.id),
                  isNull(pageProperty.deletedAt),
                  input.after ? gt(pageProperty.id, input.after) : undefined,
                ),
              )
              .orderBy(asc(pageProperty.id))
              .limit(limit + 1)
          : await db
              .select({
                id: databaseView.id,
                name: databaseView.name,
                type: databaseView.type,
                config: databaseView.config,
              })
              .from(databaseView)
              .where(
                and(
                  eq(databaseView.databaseId, input.databaseId),
                  eq(databaseView.dataSourceId, source!.id),
                  input.after ? gt(databaseView.id, input.after) : undefined,
                ),
              )
              .orderBy(asc(databaseView.id))
              .limit(limit + 1);
    }
    return {
      ...({ verification: deriveContentVerification(access.record) } as {
        verification?: ContentVerification;
      }),
      title: access.record.name,
      revision,
      section: input.section,
      entries: entries.slice(0, limit),
      hasMore: entries.length > limit,
    };
  });
}

async function queryScope(
  context: ServerOperationContext,
  query: SourceRecordQuery,
  expected?: SourceReadRevision,
) {
  const access = await authorizeSourceRead(context, query.databaseId, query.dataSourceId);
  const [source] = await db
    .select()
    .from(dataSource)
    .where(and(eq(dataSource.id, query.dataSourceId), isNull(dataSource.deletedAt)));
  if (!source) deny("Source unavailable", 404);
  if (source!.workspaceId !== access.record.workspaceId) deny("Source unavailable", 403);
  const revision = { database: access.record.version, source: source!.version };
  if (expected && (expected.database !== revision.database || expected.source !== revision.source))
    deny("SOURCE_CHANGED", 409);
  const ids = [...new Set([...query.propertyIds, ...query.filters.map((f) => f.propertyId)])];
  const properties = ids.length
    ? await db
        .select({ id: pageProperty.id, name: pageProperty.name, type: pageProperty.type })
        .from(databaseProperty)
        .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
        .where(
          and(
            eq(databaseProperty.dataSourceId, query.dataSourceId),
            inArray(pageProperty.id, ids),
            isNull(pageProperty.deletedAt),
          ),
        )
    : [];
  if (properties.length !== ids.length)
    deny("A requested property is not available in this source");
  if (
    properties.some(
      (property) =>
        query.propertyIds.includes(property.id) && ["formula", "rollup"].includes(property.type),
    )
  )
    deny("UNSUPPORTED_QUERY: computed property values are not supported by this read operation");
  const conditions: Array<SQL | undefined> = [
    eq(databaseRow.dataSourceId, query.dataSourceId),
    isNull(databaseRow.deletedAt),
    isNull(page.deletedAt),
    eq(page.workspaceId, access.record.workspaceId),
  ];
  if (query.recordId) conditions.push(eq(databaseRow.id, query.recordId));
  if (query.nameContains)
    conditions.push(sql`strpos(lower(${page.name}), lower(${query.nameContains})) > 0`);
  for (const filter of query.filters) {
    const property = properties.find((p) => p.id === filter.propertyId)!;
    if (
      !["text", "number", "checkbox", "date", "select", "status", "url", "email", "phone"].includes(
        property.type,
      )
    )
      deny(`UNSUPPORTED_QUERY: filtering ${property.type} is not supported`);
    // Correlated, parameterized scalar expressions preserve missing values. No raw model SQL.
    const raw = sql`(select v.value from page_property_value v where v.page_id = ${page.id} and v.property_id = ${filter.propertyId})`;
    const text =
      property.type === "date"
        ? sql`coalesce(${raw}->>'start', ${raw}->>'date', ${raw} #>> '{}')`
        : sql`(${raw} #>> '{}')`;
    const value =
      property.type === "number"
        ? sql`case when ${text} ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' then (${text})::numeric end`
        : text;
    if (filter.operator === "is_empty") {
      conditions.push(sql`(${text} is null or ${text} = '')`);
      continue;
    }
    if (filter.operator === "is_not_empty") {
      conditions.push(sql`(${text} is not null and ${text} <> '')`);
      continue;
    }
    if (filter.value === null) deny("Use is_empty or is_not_empty for missing values");
    if (property.type === "number" && typeof filter.value !== "number")
      deny("Numeric filters require a number");
    if (filter.operator === "contains") {
      if (property.type === "number" || property.type === "checkbox")
        deny("UNSUPPORTED_QUERY: contains requires a text property");
      conditions.push(sql`strpos(lower(${text}), lower(${String(filter.value)})) > 0`);
    } else {
      const right = property.type === "number" ? filter.value : String(filter.value);
      switch (filter.operator) {
        case "eq":
          conditions.push(sql`${value} = ${right}`);
          break;
        case "neq":
          conditions.push(sql`(${value} is null or ${value} <> ${right})`);
          break;
        case "gt":
          conditions.push(sql`${value} > ${right}`);
          break;
        case "gte":
          conditions.push(sql`${value} >= ${right}`);
          break;
        case "lt":
          conditions.push(sql`${value} < ${right}`);
          break;
        case "lte":
          conditions.push(sql`${value} <= ${right}`);
          break;
      }
    }
  }
  return { access, revision, properties, conditions };
}

/** Bounded SQL read with a unique tie breaker; independent of saved view filters. */
export async function querySourceRecords(
  context: ServerOperationContext,
  input: SourceRecordQuery,
  position?: SourceRecordPosition,
  expected?: SourceReadRevision,
) {
  const query = sourceRecordQuerySchema.parse(input);
  return boundedSnapshot(async () => {
    const scope = await queryScope(context, query, expected);
    const column = {
      id: databaseRow.id,
      name: page.name,
      createdAt: databaseRow.createdAt,
      updatedAt: databaseRow.updatedAt,
    }[query.sort];
    const sort = query.direction === "asc" ? asc : desc;
    if (position) {
      const value = ["createdAt", "updatedAt"].includes(query.sort)
        ? new Date(position.value)
        : position.value;
      scope.conditions.push(
        query.direction === "asc"
          ? sql`(${column}, ${databaseRow.id}) > (${value}, ${position.id})`
          : sql`(${column}, ${databaseRow.id}) < (${value}, ${position.id})`,
      );
    }
    const found = await db
      .select({
        id: databaseRow.id,
        pageId: page.id,
        name: page.name,
        parentRowId: databaseRow.parentRowId,
        createdAt: databaseRow.createdAt,
        updatedAt: databaseRow.updatedAt,
      })
      .from(databaseRow)
      .innerJoin(page, eq(databaseRow.pageId, page.id))
      .where(and(...scope.conditions))
      .orderBy(sort(column), sort(databaseRow.id))
      .limit(query.limit + 1);
    const records = found.slice(0, query.limit);
    const values =
      records.length && query.propertyIds.length
        ? await db
            .select({
              pageId: pagePropertyValue.pageId,
              propertyId: pagePropertyValue.propertyId,
              value: pagePropertyValue.value,
            })
            .from(pagePropertyValue)
            .where(
              and(
                inArray(
                  pagePropertyValue.pageId,
                  records.map((r) => r.pageId),
                ),
                inArray(pagePropertyValue.propertyId, query.propertyIds),
              ),
            )
        : [];
    return {
      revision: scope.revision,
      properties: scope.properties.filter((p) => query.propertyIds.includes(p.id)),
      records: records.map((r) => ({
        ...r,
        values: Object.fromEntries(
          values.filter((v) => v.pageId === r.pageId).map((v) => [v.propertyId, v.value]),
        ),
      })),
      positions: records.map((r) => ({
        id: r.id,
        value:
          query.sort === "name"
            ? r.name
            : query.sort === "createdAt"
              ? r.createdAt.toISOString()
              : query.sort === "updatedAt"
                ? r.updatedAt.toISOString()
                : r.id,
      })),
      hasMore: found.length > query.limit,
    };
  });
}

export async function aggregateSourceRecords(
  context: ServerOperationContext,
  input: SourceRecordQuery,
  operation: "count" | "sum" | "avg" | "min" | "max",
  propertyId?: string,
) {
  const query = sourceRecordQuerySchema.parse({
    ...input,
    propertyIds: propertyId ? [...new Set([...input.propertyIds, propertyId])] : input.propertyIds,
  });
  return boundedSnapshot(async () => {
    const scope = await queryScope(context, query);
    let expression: SQL = sql`count(*)`;
    if (operation !== "count") {
      if (!propertyId || scope.properties.find((p) => p.id === propertyId)?.type !== "number")
        deny("Aggregation requires a numeric property");
      const raw = sql`(select v.value #>> '{}' from page_property_value v where v.page_id = ${page.id} and v.property_id = ${propertyId})`;
      const number = sql`case when ${raw} ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' then (${raw})::numeric end`;
      expression = {
        sum: sql`sum(${number})`,
        avg: sql`avg(${number})`,
        min: sql`min(${number})`,
        max: sql`max(${number})`,
      }[operation];
    }
    const [result] = await db
      .select({ value: expression, matchingRecords: sql<number>`count(*)::integer` })
      .from(databaseRow)
      .innerJoin(page, eq(databaseRow.pageId, page.id))
      .where(and(...scope.conditions));
    return {
      revision: scope.revision,
      operation,
      propertyId,
      value: result?.value ?? null,
      matchingRecords: result?.matchingRecords ?? 0,
      complete: true,
    };
  });
}
