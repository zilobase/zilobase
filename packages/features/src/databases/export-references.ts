import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import { resolveDatabaseBootstrap, type DatabaseBootstrapReference } from "./cache-references";
import {
  databaseBootstrapResponseSchema,
  databaseRecordEntitySchema,
  databaseHostEntitySchema,
  dataSourceEntitySchema,
  databasePropertyEntitySchema,
  databaseViewEntitySchema,
  pagePropertyValueEntitySchema,
} from "./core/entities";
import { valueIdentity } from "./schema/cache-entities";
import type { DatabaseExportPayload, DatabaseRow } from "./core/export-payload";

export type DatabaseExportReference = {
  bootstrap: DatabaseBootstrapReference;
  activeSourceId: string | null;
  rows: Array<{
    id: string;
    context: Pick<
      DatabaseRow,
      "position" | "createdById" | "lastEditedById" | "deletedById" | "deletedAt"
    >;
  }>;
  valueIds: string[];
  rowCount?: number;
  rowsPagination?: DatabaseExportPayload["rowsPagination"];
};

export function normalizeDatabaseExportReference(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  databaseId: string,
  input: DatabaseExportPayload,
): DatabaseExportReference {
  const bootstrap = databaseBootstrapResponseSchema.parse({
    database: databaseHostEntitySchema
      .strip()
      .parse({ ...input.database, accessLevel: input.database.accessLevel ?? null }),
    dataSources: input.dataSources.map((source) => dataSourceEntitySchema.strip().parse(source)),
    properties: input.properties.map((binding) =>
      databasePropertyEntitySchema.strip().parse({
        ...binding,
        property: databasePropertyEntitySchema.shape.property.strip().parse(binding.property),
      }),
    ),
    views: input.views.map((view) => databaseViewEntitySchema.strip().parse(view)),
  });
  const values = z.array(pagePropertyValueEntitySchema.strip()).parse(input.values);
  const records = input.rows.map((row) =>
    databaseRecordEntitySchema.parse({
      id: row.id,
      dataSourceId: row.dataSourceId,
      pageId: row.pageId,
      parentRowId: row.parentRowId,
      orderKey: row.orderKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      page: databaseRecordEntitySchema.shape.page.strip().parse(row.page),
      valuesByPropertyId: Object.fromEntries(
        values
          .filter((value) => value.pageId === row.pageId)
          .map((value) => [value.propertyId, value]),
      ),
    }),
  );
  const rowPages = new Set(records.map((record) => record.pageId));
  const propertyIds = new Set(bootstrap.properties.map((binding) => binding.propertyId));
  if (values.some((value) => !rowPages.has(value.pageId) || !propertyIds.has(value.propertyId)))
    throw new Error("Export value scope mismatch");
  if (
    input.activeDataSource &&
    !bootstrap.dataSources.some((source) => source.id === input.activeDataSource?.id)
  )
    throw new Error("Export active source mismatch");
  const contexts = input.rows.map((row) => ({
    id: row.id,
    context: {
      position: z.number().finite().parse(row.position),
      createdById: row.createdById,
      lastEditedById: row.lastEditedById,
      deletedById: row.deletedById,
      deletedAt: row.deletedAt,
    },
  }));
  const owner = sharedClient(client).resolve(
    read,
    bootstrap.database.workspaceId,
    read.identity.viewer.kind === "public" ? { kind: "public", id: databaseId } : undefined,
  );
  const prepared = owner.databases.prepareBootstrap(databaseId, bootstrap);
  const versions = Object.fromEntries(
    bootstrap.dataSources.map((source) => [source.id, source.version]),
  );
  owner.session.ingest([...prepared.inputs, ...owner.databases.prepareRecords(records, versions)]);
  prepared.authorize();
  const membership = prepared.membership;
  return {
    bootstrap: {
      cacheId: owner.session.id,
      databaseId,
      databaseVersion: membership.version,
      accessLevel: membership.accessLevel,
      sourceIds: membership.sourceIds,
      bindingIds: membership.bindingIds,
      viewIds: membership.viewIds,
      includeDeleted: false,
    },
    activeSourceId: input.activeDataSource?.id ?? null,
    rows: contexts,
    valueIds: values.map((value) => valueIdentity(value.pageId, value.propertyId)),
    rowCount: input.rowCount,
    rowsPagination: input.rowsPagination,
  };
}

/** Each complete context/export read captures one synchronous publication revision. */
export function resolveDatabaseExportReference(
  client: QueryClient,
  reference: DatabaseExportReference | null | undefined,
): DatabaseExportPayload | undefined {
  if (!reference) return undefined;
  const owner = sharedClient(client).get(reference.bootstrap.cacheId);
  if (!owner) return undefined;
  return owner.session.snapshot(() => {
    const bootstrap = resolveDatabaseBootstrap(client, reference.bootstrap);
    if (!bootstrap) return undefined;
    return {
      ...bootstrap,
      activeDataSource:
        bootstrap.dataSources.find((source) => source.id === reference.activeSourceId) ?? null,
      rows: reference.rows.flatMap(({ id, context }) => {
        const record = owner.databases.resolveRecord(id);
        return record ? [{ ...context, ...record }] : [];
      }),
      values: [
        ...new Set([
          ...reference.valueIds,
          ...reference.rows.flatMap(({ id }) => {
            const record = owner.databases.records.get(id);
            return record
              ? bootstrap.properties
                  .filter((binding) => binding.dataSourceId === record.dataSourceId)
                  .map((binding) => valueIdentity(record.pageId, binding.propertyId))
              : [];
          }),
        ]),
      ].flatMap((id) => {
        const value = owner.databases.values.get(id);
        return value
          ? [{ ...pagePropertyValueEntitySchema.strip().parse({ ...value, id: value.valueId }) }]
          : [];
      }),
      rowCount: reference.rowCount,
      rowsPagination: reference.rowsPagination,
    };
  }).value;
}
