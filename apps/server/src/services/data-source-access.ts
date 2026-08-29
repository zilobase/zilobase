import { and, eq, isNull } from "drizzle-orm";

import { canAccessDatabaseRecord, type AccessLevel } from "../features/access";
import { db, type Database } from "../infrastructure/database";
import { dataSource, database } from "../infrastructure/database/schema";
import { ServiceMutationError } from "./mutation-error";

type DataSourceReader = Pick<Database, "select">;

export async function getDataSourceRecord(
  dataSourceId: string,
  options?: {
    executor?: DataSourceReader;
    includeDeleted?: boolean;
  },
) {
  const executor = options?.executor ?? db;
  const [exact] = await executor
    .select()
    .from(dataSource)
    .where(
      and(
        eq(dataSource.id, dataSourceId),
        options?.includeDeleted ? undefined : isNull(dataSource.deletedAt),
      ),
    )
    .limit(1);

  return exact;
}

export async function requireDataSourceAccess(
  dataSourceId: string,
  userId: string,
  required: Exclude<AccessLevel, "none">,
  dependencies?: {
    canAccessRecord?: typeof canAccessDatabaseRecord;
    executor?: DataSourceReader;
  },
) {
  const executor = dependencies?.executor ?? db;
  const source = await getDataSourceRecord(dataSourceId, { executor });

  if (!source) {
    throw new ServiceMutationError("Data source not found", 404);
  }

  const [parent] = await executor
    .select()
    .from(database)
    .where(eq(database.id, source.parentDatabaseId))
    .limit(1);

  if (!parent) {
    throw new ServiceMutationError("Data source parent not found", 404);
  }

  const canAccessRecord =
    dependencies?.canAccessRecord ?? canAccessDatabaseRecord;

  if (!(await canAccessRecord(parent, userId, required))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return {
    ...source,
    parentPageId: parent.pageId,
  };
}

export function requireDataSourceEditAccess(
  dataSourceId: string,
  userId: string,
  dependencies?: Parameters<typeof requireDataSourceAccess>[3],
) {
  return requireDataSourceAccess(
    dataSourceId,
    userId,
    "edit",
    dependencies,
  );
}
