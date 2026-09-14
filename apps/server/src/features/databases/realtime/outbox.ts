import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";
import { getRuntimeAdapter } from "../../../infrastructure/runtime/runtime-adapter";
import { databaseMutationEventFromJournalRow } from "./journal-event";

const DELIVERY_LEASE_MS = 2 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 8;

export async function drainDatabaseRealtimeOutbox(
  env: RuntimeEnv,
  options?: { database?: typeof db; limit?: number; outboxId?: string },
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
      .where(and(
        options?.outboxId ? eq(databaseRealtimeOutbox.id, options.outboxId) : undefined,
        lte(databaseRealtimeOutbox.nextAttemptAt, sql`CURRENT_TIMESTAMP`),
      ))
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
  const journalIds = entries.flatMap((entry) => entry.eventId ? [entry.eventId] : []);
  const journalEvents = journalIds.length > 0
    ? await executor.select().from(databaseMutationEvent)
        .where(inArray(databaseMutationEvent.id, journalIds))
    : [];
  const journalById = new Map(journalEvents.map((event) => [event.id, event]));
  let delivered = 0;
  let discarded = 0;
  let failed = 0;
  const deleteIds: string[] = [];
  const retryIdsByAttempts = new Map<number, string[]>();

  for (const entry of entries) {
    try {
      const journalEvent = entry.eventId ? journalById.get(entry.eventId) : undefined;
      if (!journalEvent) {
        throw new Error("Database mutation journal event is unavailable");
      }
      await publish({
        env,
        event: databaseMutationEventFromJournalRow(journalEvent),
      });
      deleteIds.push(entry.id);
      delivered += 1;
    } catch (error) {
      failed += 1;
      const discard = entry.attempts >= MAX_DELIVERY_ATTEMPTS;

      if (discard) {
        deleteIds.push(entry.id);
        discarded += 1;
      } else {
        retryIdsByAttempts.set(entry.attempts, [
          ...(retryIdsByAttempts.get(entry.attempts) ?? []),
          entry.id,
        ]);
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

  if (deleteIds.length > 0) {
    await executor
      .delete(databaseRealtimeOutbox)
      .where(inArray(databaseRealtimeOutbox.id, deleteIds));
  }

  for (const [attempts, retryIds] of retryIdsByAttempts) {
    await executor
      .update(databaseRealtimeOutbox)
      .set({ nextAttemptAt: retryAt(attempts, attemptedAt) })
      .where(inArray(databaseRealtimeOutbox.id, retryIds));
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

function retryAt(attempts: number, from: Date) {
  const delay = Math.min(
    60 * 60 * 1000,
    60 * 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6),
  );

  return new Date(from.getTime() + delay);
}

export type { DatabaseMutationEventV2 } from "@zilobase/features/databases/contracts";
