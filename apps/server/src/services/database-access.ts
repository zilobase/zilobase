import { and, eq, isNull } from "drizzle-orm";

import {
  canAccessDatabaseRecord,
  type AccessLevel,
} from "../access";
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
  dependencies?: DatabaseAccessDependencies,
) {
  return requireDatabaseAccess(databaseId, userId, "edit", dependencies);
}

type DatabaseAccessDependencies = {
  canAccessRecord?: typeof canAccessDatabaseRecord;
  executor?: DatabaseReader;
};

export async function requireDatabaseAccess(
  databaseId: string,
  userId: string,
  required: Exclude<AccessLevel, "none">,
  dependencies?: DatabaseAccessDependencies,
) {
  const record = await getDatabaseRecord(databaseId, {
    executor: dependencies?.executor,
  });

  if (!record) {
    throw new ServiceMutationError("Database not found", 404);
  }

  const canAccessRecord =
    dependencies?.canAccessRecord ?? canAccessDatabaseRecord;
  if (!(await canAccessRecord(record, userId, required))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return record;
}
