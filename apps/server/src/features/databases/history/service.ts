import { and, asc, eq, gt, sql } from "drizzle-orm"
import {
  databaseMutationEventV2Schema,
  type DatabaseMutationEventV2,
  type DatabaseMutationFeedResponse,
} from "@zilobase/features/databases/contracts"

import { db, type Database } from "../../../infrastructure/database"
import {
  database,
  databaseCommandReceipt,
  databaseMutationEvent,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"

export const DATABASE_MUTATION_FEED_LIMIT = 500
const DATABASE_MUTATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
const DATABASE_MUTATION_MINIMUM_EVENTS = 10_000

type HistoryReader = Pick<Database, "select">

function eventFromRow(row: typeof databaseMutationEvent.$inferSelect) {
  return databaseMutationEventV2Schema.parse({
    actorId: row.actorId,
    areas: row.areas,
    changes: row.changes,
    commandId: row.commandId,
    committedAt: row.committedAt.toISOString(),
    databaseId: row.databaseId,
    dataSourceId: row.dataSourceId,
    eventId: row.id,
    protocolVersion: 2,
    ...(row.requiresReset ? { requiresReset: true as const } : {}),
    type: "database.mutation",
    version: row.version,
  })
}

export async function getDatabaseMutationFeed(
  input: {
    afterVersion: number
    databaseId: string
    limit?: number
  },
  executor: HistoryReader = db,
): Promise<DatabaseMutationFeedResponse> {
  if (!Number.isSafeInteger(input.afterVersion) || input.afterVersion < 0) {
    throw new ServiceMutationError("afterVersion must be a non-negative integer", 400)
  }
  const limit = input.limit ?? DATABASE_MUTATION_FEED_LIMIT
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DATABASE_MUTATION_FEED_LIMIT) {
    throw new ServiceMutationError("limit must be between 1 and 500", 400)
  }

  const [host] = await executor.select({ version: database.version }).from(database)
    .where(eq(database.id, input.databaseId)).limit(1)
  if (!host) throw new ServiceMutationError("Database not found", 404)
  if (input.afterVersion === host.version) {
    return { events: [], hasMore: false, latestVersion: host.version, resetRequired: false }
  }
  if (input.afterVersion > host.version) {
    return { events: [], hasMore: false, latestVersion: host.version, resetRequired: true }
  }

  const rows = await executor.select().from(databaseMutationEvent).where(and(
    eq(databaseMutationEvent.databaseId, input.databaseId),
    gt(databaseMutationEvent.version, input.afterVersion),
  )).orderBy(asc(databaseMutationEvent.version)).limit(limit + 1)

  const window = rows.slice(0, limit)
  let expected = input.afterVersion + 1
  for (const row of window) {
    if (row.version !== expected) {
      return { events: [], hasMore: false, latestVersion: host.version, resetRequired: true }
    }
    expected += 1
  }
  if (window.length === 0 || window.some(({ requiresReset }) => requiresReset)) {
    return { events: [], hasMore: false, latestVersion: host.version, resetRequired: true }
  }

  let events: DatabaseMutationEventV2[]
  try {
    events = window.map(eventFromRow)
  } catch {
    return { events: [], hasMore: false, latestVersion: host.version, resetRequired: true }
  }
  const hasMore = rows.length > limit
  if (!hasMore && events.at(-1)?.version !== host.version) {
    return { events: [], hasMore: false, latestVersion: host.version, resetRequired: true }
  }
  return { events, hasMore, latestVersion: host.version, resetRequired: false }
}

export async function pruneDatabaseMutationHistory(
  executor: Pick<Database, "delete" | "execute"> = db,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - DATABASE_MUTATION_RETENTION_MS)
  await executor.execute(sql`
    delete from ${databaseMutationEvent} as candidate
    where candidate.committed_at < ${cutoff}
      and candidate.id not in (
        select retained.id
        from ${databaseMutationEvent} as retained
        where retained.database_id = candidate.database_id
        order by retained.version desc
        limit ${DATABASE_MUTATION_MINIMUM_EVENTS}
      )
  `)
  await executor.delete(databaseCommandReceipt)
    .where(sql`${databaseCommandReceipt.expiresAt} < ${now}`)
}
