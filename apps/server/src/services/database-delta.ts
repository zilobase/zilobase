import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../db";
import type { Database } from "../db";
import {
  databaseProperty,
  databaseRow,
  databaseView,
  page,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";

type DatabaseReader = Pick<Database, "select">;

export type DatabaseChangedArea =
  | "database"
  | "views"
  | "properties"
  | "rows"
  | "values";

export type DatabaseDelta = {
  database?: Record<string, unknown>;
  properties?: Array<Record<string, unknown>>;
  removedPagePropertyIds?: string[];
  removedPropertyIds?: string[];
  removedViewIds?: string[];
  views?: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  values?: Array<{
    createdAt?: string;
    id?: string;
    propertyId: string;
    updatedAt: string;
    value: unknown;
    pageId: string;
  }>;
};

export type DatabaseMutationResponse = {
  changed: DatabaseChangedArea[];
  committedAt: string;
  databaseId: string;
  delta: DatabaseDelta;
  mutationId: string;
  requiresRefetch?: true;
  version: number;
};

export type DatabaseRealtimeMutationEvent = DatabaseMutationResponse & {
  actorId: string;
  protocolVersion: 1;
  type: "database.mutation";
};

export const MAX_DATABASE_REALTIME_DELTA_BYTES = 64 * 1024;

export function prepareDatabaseRealtimeDelta(delta: DatabaseDelta) {
  const encoded = new TextEncoder().encode(JSON.stringify(delta));

  return encoded.byteLength <= MAX_DATABASE_REALTIME_DELTA_BYTES
    ? { requiresRefetch: false, value: delta }
    : { requiresRefetch: true, value: {} };
}

export const propertyPositionDelta = (
  propertyIds: string[],
): DatabaseDelta => ({
  properties: propertyIds.map((id, position) => ({
    id,
    position,
  })),
});

export const rowPositionDelta = (rowIds: string[]): DatabaseDelta => ({
  rows: rowIds.map((id, position) => ({
    id,
    position,
  })),
});

export const toMutationResponse = (
  event: {
    actorId: string;
    changed: DatabaseChangedArea[];
    committedAt: string;
    databaseId: string;
    mutationId: string;
    requiresRefetch?: true;
    version: number;
  },
  delta: DatabaseDelta,
): DatabaseMutationResponse => ({
  changed: event.changed,
  committedAt: event.committedAt,
  databaseId: event.databaseId,
  delta,
  mutationId: event.mutationId,
  ...(event.requiresRefetch ? { requiresRefetch: true as const } : {}),
  version: event.version,
});

export async function fetchDatabasePropertyDelta(
  databaseId: string,
  databasePropertyId: string,
  executor: DatabaseReader = db,
) {
  const [property] = await executor
    .select({
      column: databaseProperty,
      property: pageProperty,
    })
    .from(databaseProperty)
    .innerJoin(
      pageProperty,
      eq(databaseProperty.propertyId, pageProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.id, databasePropertyId),
        eq(databaseProperty.databaseId, databaseId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .limit(1);

  if (!property) {
    return null;
  }

  return {
    properties: [
      {
        ...property.column,
        property: property.property,
      },
    ],
  } satisfies DatabaseDelta;
}

export async function fetchDatabaseViewDelta(
  viewId: string,
  executor: DatabaseReader = db,
) {
  const [view] = await executor
    .select()
    .from(databaseView)
    .where(eq(databaseView.id, viewId))
    .limit(1);

  if (!view) {
    return null;
  }

  return {
    views: [view],
  } satisfies DatabaseDelta;
}

export async function fetchDatabaseRowDelta(
  rowId: string,
  executor: DatabaseReader = db,
) {
  const [row] = await executor
    .select({
      page: {
        createdAt: page.createdAt,
        id: page.id,
        metadata: page.metadata,
        name: page.name,
        updatedAt: page.updatedAt,
      },
      row: databaseRow,
    })
    .from(databaseRow)
    .innerJoin(page, eq(databaseRow.pageId, page.id))
    .where(and(eq(databaseRow.id, rowId), isNull(databaseRow.deletedAt)))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    rows: [
      {
        ...row.row,
        page: row.page,
      },
    ],
  } satisfies DatabaseDelta;
}

export async function fetchDatabaseValuesForPage(
  pageId: string,
  propertyIds: string[],
) {
  if (propertyIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(pagePropertyValue)
    .where(
      and(
        eq(pagePropertyValue.pageId, pageId),
        inArray(pagePropertyValue.propertyId, propertyIds),
      ),
    );
}
