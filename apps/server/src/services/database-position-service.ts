import { sql } from "drizzle-orm";

import {
  databaseProperty,
  databaseRow,
  pageItemPlacement,
} from "../db/schema";
import type { SqlExecutor } from "./database-commit";

export const hasDuplicateValues = (values: string[]) =>
  new Set(values).size !== values.length;

const getPositionValuesSql = (ids: string[]) =>
  sql.join(
    ids.map((id, position) => sql`(${id}::text, ${position}::integer)`),
    sql`, `,
  );

export async function updateDatabasePropertyPositions(
  executor: SqlExecutor,
  databaseId: string,
  propertyIds: string[],
  updatedAt: Date,
) {
  if (propertyIds.length === 0) {
    return;
  }

  await executor.execute(sql`
    update ${databaseProperty}
    set "position" = positions.position,
        "updated_at" = ${updatedAt}
    from (values ${getPositionValuesSql(propertyIds)}) as positions(id, position)
    where ${databaseProperty.id} = positions.id
      and ${databaseProperty.dataSourceId} = ${databaseId}
      and ${databaseProperty.position} <> positions.position
  `);
}

export async function updateDatabaseRowPositions(
  executor: SqlExecutor,
  databaseId: string,
  rowIds: string[],
  updatedAt: Date,
) {
  if (rowIds.length === 0) {
    return;
  }

  await executor.execute(sql`
    update ${databaseRow}
    set "position" = positions.position,
        "updated_at" = ${updatedAt}
    from (values ${getPositionValuesSql(rowIds)}) as positions(id, position)
    where ${databaseRow.id} = positions.id
      and ${databaseRow.dataSourceId} = ${databaseId}
      and ${databaseRow.position} <> positions.position
  `);
}

export async function updateDatabaseRowPlacementPositions(
  executor: SqlExecutor,
  databaseId: string,
  rowIds: string[],
  updatedAt: Date,
) {
  if (rowIds.length === 0) {
    return;
  }

  await executor.execute(sql`
    update ${pageItemPlacement}
    set "position" = positions.position,
        "updated_at" = ${updatedAt}
    from (values ${getPositionValuesSql(rowIds)}) as positions(id, position)
    where ${pageItemPlacement.sourceRowId} = positions.id
      and ${pageItemPlacement.parentKind} = 'database'
      and ${pageItemPlacement.parentId} = ${databaseId}
      and ${pageItemPlacement.placementKind} = 'database_row'
      and ${pageItemPlacement.deletedAt} is null
      and ${pageItemPlacement.position} <> positions.position
  `);
}

export async function incrementDatabaseRowPlacementPositions(
  executor: SqlExecutor,
  databaseId: string,
  fromPosition: number,
  updatedAt: Date,
) {
  await executor.execute(sql`
    update ${pageItemPlacement}
    set "position" = ${pageItemPlacement.position} + 1,
        "updated_at" = ${updatedAt}
    where ${pageItemPlacement.parentKind} = 'database'
      and ${pageItemPlacement.parentId} = ${databaseId}
      and ${pageItemPlacement.placementKind} = 'database_row'
      and ${pageItemPlacement.deletedAt} is null
      and ${pageItemPlacement.position} >= ${fromPosition}
  `);
}
