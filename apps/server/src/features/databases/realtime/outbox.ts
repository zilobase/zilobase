import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import type { DataSourceMutationEventV3 } from "@zilobase/features/databases/contracts";
import { recordDatabaseGauge } from "../observability";
import { db, type Database } from "../../../infrastructure/database";
import {
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";
import { getRuntimeAdapter } from "../../../infrastructure/runtime/runtime-adapter";
import { dataSourceMutationEventFromJournalRow } from "./journal-event";

const DELIVERY_LEASE_MS = 2 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 8;

export async function publishCommittedDataSourceMutations(
  env: RuntimeEnv,
  events: readonly DataSourceMutationEventV3[],
  executor: Pick<Database, "delete"> = db,
) {
  const publish = getRuntimeAdapter().publishDatabaseMutation;
  if (!publish) return events.map(({ eventId }) => eventId);

  const retryEventIds: string[] = [];
  for (const event of events) {
    try {
      await publish({ env, event });
      await executor.delete(databaseRealtimeOutbox)
        .where(eq(databaseRealtimeOutbox.eventId, event.eventId));
    } catch (error) {
      retryEventIds.push(event.eventId);
      console.warn(JSON.stringify({
        error: error instanceof Error ? error.name : "UnknownError",
        event: "database_realtime_hot_publish_failed",
        eventId: event.eventId,
        sourceId: event.sourceId,
        sourceVersion: event.sourceVersion,
      }));
    }
  }
  return retryEventIds;
}

export async function drainDatabaseRealtimeOutbox(
  env: RuntimeEnv,
  options?: { database?: typeof db; limit?: number; outboxId?: string },
) {
  const executor = options?.database ?? db;
  const publish = getRuntimeAdapter().publishDatabaseMutation;

  if (!publish) {
    recordDatabaseGauge("outbox_backlog", 0);
    recordDatabaseGauge("outbox_oldest_age_ms", 0);
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
      .orderBy(
        asc(databaseRealtimeOutbox.nextAttemptAt),
        asc(databaseRealtimeOutbox.id),
      )
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
    const journalEvent = journalById.get(entry.eventId);
    try {
      if (!journalEvent) {
        throw new Error("Database mutation journal event is unavailable");
      }
      if (journalEvent.streamKind !== "source") {
        deleteIds.push(entry.id);
        delivered += 1;
        continue;
      }
      await publish({
        env,
        event: dataSourceMutationEventFromJournalRow(journalEvent),
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
        sourceId: journalEvent?.sourceId ?? null,
        error: error instanceof Error ? error.message : String(error),
        event: discard
          ? "database_realtime_publish_discarded"
          : "database_realtime_publish_failed",
        eventId: entry.eventId,
        version: journalEvent?.version ?? null,
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
      oldestReadyAt: sql<Date | null>`min(${databaseRealtimeOutbox.nextAttemptAt})`,
    })
    .from(databaseRealtimeOutbox);
  const oldestReadyAt = health?.oldestReadyAt
    ? new Date(health.oldestReadyAt).getTime()
    : attemptedAt.getTime();

  const result = {
    backlog: health?.backlog ?? 0,
    delivered,
    discarded,
    failed,
    maxAttempts: health?.maxAttempts ?? 0,
    oldestAgeMs: Math.max(0, attemptedAt.getTime() - oldestReadyAt),
  };
  recordDatabaseGauge("outbox_backlog", result.backlog);
  recordDatabaseGauge("outbox_oldest_age_ms", result.oldestAgeMs);
  return result;
}

function retryAt(attempts: number, from: Date) {
  const delay = Math.min(
    60 * 60 * 1000,
    60 * 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6),
  );

  return new Date(from.getTime() + delay);
}

export type {
  DatabaseMutationEventV2,
  DataSourceMutationEventV3,
} from "@zilobase/features/databases/contracts";
