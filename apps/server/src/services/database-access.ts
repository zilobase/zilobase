import { and, eq, isNull } from "drizzle-orm";

import { canAccessDatabaseInWorkspace } from "../access";
import { db, type Database } from "../db";
import { database } from "../db/schema";
import { ServiceMutationError } from "./mutation-error";

type DatabaseReader = Pick<Database, "select">;

export async function getDatabaseRecord(
  id: string,
  executor: DatabaseReader = db,
) {
  const [record] = await executor
    .select()
    .from(database)
    .where(and(eq(database.id, id), isNull(database.deletedAt)))
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
  const record = await getDatabaseRecord(databaseId, dependencies?.executor);

  if (!record) {
    throw new ServiceMutationError("Database not found", 404);
  }

  const canAccess = dependencies?.canAccess ?? canAccessDatabaseInWorkspace;
  if (!(await canAccess(record.id, record.workspaceId, userId, "edit"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return record;
}
