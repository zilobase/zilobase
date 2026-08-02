import { asc, eq, inArray, lte, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../config";
import { db } from "../db";
import { databaseRealtimeOutbox } from "../db/schema";
import { getRuntimeAdapter } from "../runtime-adapter";
import type {
  DatabaseChangedArea,
  DatabaseDelta,
  DatabaseRealtimeMutationEvent,
} from "./database-delta";

type StoredRealtimeEvent = {
  actorId: string;
  changed: DatabaseChangedArea[];
  committedAt: Date;
  databaseId: string;
  delta: DatabaseDelta;
  id: string;
  requiresRefetch: boolean;
  version: number;
};

const DELIVERY_LEASE_MS = 2 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 8;

export async function publishDatabaseRealtimeEvent(
  event: DatabaseRealtimeMutationEvent,
  env: RuntimeEnv,
  executor = db,
) {
  const publish = getRuntimeAdapter().publishDatabaseMutation;

  if (!publish) return false;

  try {
    await publish({ env, event });
    await executor
      .delete(databaseRealtimeOutbox)
      .where(eq(databaseRealtimeOutbox.id, event.mutationId));
  } catch (error) {
    const attemptedAt = new Date();
    await executor
      .update(databaseRealtimeOutbox)
      .set({
        attempts: 1,
        lastAttemptAt: attemptedAt,
        nextAttemptAt: retryAt(1, attemptedAt),
      })
      .where(eq(databaseRealtimeOutbox.id, event.mutationId));
    throw error;
  }

  return true;
}

export async function drainDatabaseRealtimeOutbox(
  env: RuntimeEnv,
  options?: { database?: typeof db; limit?: number },
) {
  const executor = options?.database ?? db;
  const publish = getRuntimeAdapter().publishDatabaseMutation;

  if (!publish) {
    return {
      backlog: 0,
      delivered: 0,
      discarded: 0,
      failed: 0,
      maxAttempts: 0,
      oldestAgeMs: 0,
    };
  }

  const attemptedAt = new Date();
  const entries = await executor.transaction(async (tx) => {
    const ready = await tx
      .select()
      .from(databaseRealtimeOutbox)
      .where(lte(databaseRealtimeOutbox.nextAttemptAt, sql`CURRENT_TIMESTAMP`))
      .orderBy(asc(databaseRealtimeOutbox.committedAt))
      .limit(Math.min(Math.max(options?.limit ?? 100, 1), 500))
      .for("update", { skipLocked: true });

    if (ready.length === 0) return ready;

    await tx
      .update(databaseRealtimeOutbox)
      .set({
        attempts: sql`${databaseRealtimeOutbox.attempts} + 1`,
        lastAttemptAt: attemptedAt,
        nextAttemptAt: new Date(attemptedAt.getTime() + DELIVERY_LEASE_MS),
      })
      .where(inArray(databaseRealtimeOutbox.id, ready.map(({ id }) => id)));

    return ready.map((entry) => ({
      ...entry,
      attempts: entry.attempts + 1,
      lastAttemptAt: attemptedAt,
    }));
  });
  let delivered = 0;
  let discarded = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await publish({ env, event: toRealtimeEvent(entry as StoredRealtimeEvent) });
      await executor
        .delete(databaseRealtimeOutbox)
        .where(eq(databaseRealtimeOutbox.id, entry.id));
      delivered += 1;
    } catch (error) {
      failed += 1;
      const discard = entry.attempts >= MAX_DELIVERY_ATTEMPTS;

      if (discard) {
        await executor
          .delete(databaseRealtimeOutbox)
          .where(eq(databaseRealtimeOutbox.id, entry.id));
        discarded += 1;
      } else {
        await executor
          .update(databaseRealtimeOutbox)
          .set({ nextAttemptAt: retryAt(entry.attempts, attemptedAt) })
          .where(eq(databaseRealtimeOutbox.id, entry.id));
      }
      console.error(JSON.stringify({
        attempts: entry.attempts,
        databaseId: entry.databaseId,
        error: error instanceof Error ? error.message : String(error),
        event: discard
          ? "database_realtime_publish_discarded"
          : "database_realtime_publish_failed",
        mutationId: entry.id,
        version: entry.version,
      }));
    }
  }

  const [health] = await executor
    .select({
      backlog: sql<number>`count(*)::int`,
      maxAttempts: sql<number>`coalesce(max(${databaseRealtimeOutbox.attempts}), 0)::int`,
      oldestCommittedAt: sql<Date | null>`min(${databaseRealtimeOutbox.committedAt})`,
    })
    .from(databaseRealtimeOutbox);
  const oldestCommittedAt = health?.oldestCommittedAt
    ? new Date(health.oldestCommittedAt).getTime()
    : attemptedAt.getTime();

  return {
    backlog: health?.backlog ?? 0,
    delivered,
    discarded,
    failed,
    maxAttempts: health?.maxAttempts ?? 0,
    oldestAgeMs: Math.max(0, attemptedAt.getTime() - oldestCommittedAt),
  };
}

function toRealtimeEvent(
  entry: StoredRealtimeEvent,
): DatabaseRealtimeMutationEvent {
  return {
    actorId: entry.actorId,
    changed: entry.changed,
    committedAt: entry.committedAt.toISOString(),
    databaseId: entry.databaseId,
    delta: entry.delta,
    mutationId: entry.id,
    protocolVersion: 1,
    ...(entry.requiresRefetch ? { requiresRefetch: true as const } : {}),
    type: "database.mutation",
    version: entry.version,
  };
}

function retryAt(attempts: number, from: Date) {
  const delay = Math.min(
    60 * 60 * 1000,
    60 * 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6),
  );

  return new Date(from.getTime() + delay);
}

export type { DatabaseRealtimeMutationEvent } from "./database-delta";
