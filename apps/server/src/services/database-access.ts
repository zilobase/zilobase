import { and, eq, isNull } from "drizzle-orm";

import { canAccessDatabaseInWorkspace } from "../access";
import { db, type Database } from "../db";
import { database } from "../db/schema";
import { ServiceMutationError } from "./mutation-error";

type DatabaseReader = Pick<Database, "select">;
type GetDatabaseRecordOptions = {
  executor?: DatabaseReader;
  includeDeleted?: boolean;
};

export function getDatabaseRecord(
  id: string,
  options?: GetDatabaseRecordOptions,
): Promise<typeof database.$inferSelect | undefined>;
export function getDatabaseRecord(
  id: string,
  executor: DatabaseReader,
  options?: GetDatabaseRecordOptions,
): Promise<typeof database.$inferSelect | undefined>;
export async function getDatabaseRecord(
  id: string,
  executorOrOptions: DatabaseReader | GetDatabaseRecordOptions = db,
  explicitOptions?: GetDatabaseRecordOptions,
) {
  const executor =
    "select" in executorOrOptions
      ? executorOrOptions
      : (executorOrOptions.executor ?? db);
  const options =
    "select" in executorOrOptions ? explicitOptions : executorOrOptions;
  const [record] = await executor
    .select()
    .from(database)
    .where(
      and(
        eq(database.id, id),
        options?.includeDeleted ? undefined : isNull(database.deletedAt),
      ),
    )
    .limit(1);

  return record;
}

export async function requireDatabaseEditAccess(
  databaseId: string,
  userId: string,
  dependencies?: {
    canAccess?: typeof canAccessDatabaseInWorkspace;
    executor?: DatabaseReader;
  },
) {
  const record = dependencies?.executor
    ? await getDatabaseRecord(databaseId, dependencies.executor)
    : await getDatabaseRecord(databaseId);

  if (!record) {
    throw new ServiceMutationError("Database not found", 404);
  }

  const canAccess = dependencies?.canAccess ?? canAccessDatabaseInWorkspace;
  if (!(await canAccess(record.id, record.workspaceId, userId, "edit"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return record;
}
