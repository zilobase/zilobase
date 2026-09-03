import { and, asc, eq, inArray, lte, sql } from "drizzle-orm"
import type { NavigationRealtimeInvalidateEvent } from "@zilobase/features/pages/navigation-realtime"

import { db } from "../../../infrastructure/database"
import { navigationRealtimeOutbox } from "../../../infrastructure/database/schema"
import { getRuntimeAdapter } from "../../../infrastructure/runtime/runtime-adapter"
import type { RuntimeEnv } from "../../../shared/config/config"
import { createBackgroundTask } from "../../../infrastructure/background/contracts"
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
const MAX_ATTEMPTS = 8
const LEASE_MS = 2 * 60 * 1000

export function enqueueNavigationInvalidation(
  tx: Transaction,
  workspaceId: string,
  options?: { committedAt?: Date; eventId?: string },
) {
  const row = {
    committedAt: options?.committedAt ?? new Date(),
    id: options?.eventId ?? crypto.randomUUID(),
    workspaceId,
  }
  return tx.insert(navigationRealtimeOutbox).values(row).then(() => row)
}

export async function publishNavigationInvalidation(
  event: NavigationRealtimeInvalidateEvent,
  env: RuntimeEnv,
  executor = db,
) {
  const publish = getRuntimeAdapter().publishNavigationInvalidation
  if (!publish) return false
  try {
    await publish({ env, event })
    await executor.delete(navigationRealtimeOutbox)
      .where(eq(navigationRealtimeOutbox.id, event.eventId))
  } catch (error) {
    const attemptedAt = new Date()
    await executor.update(navigationRealtimeOutbox).set({
      attempts: 1,
      lastAttemptAt: attemptedAt,
      nextAttemptAt: retryAt(1, attemptedAt),
    }).where(eq(navigationRealtimeOutbox.id, event.eventId))
    await dispatchBackgroundTasks(env, [createBackgroundTask({
      availableAt: retryAt(1, attemptedAt),
      env,
      kind: "realtime.navigation",
      resourceId: event.eventId,
    })])
    throw error
  }
  return true
}

export async function drainNavigationRealtimeOutbox(
  env: RuntimeEnv,
  options?: { database?: typeof db; limit?: number; outboxId?: string },
) {
  const executor = options?.database ?? db
  const publish = getRuntimeAdapter().publishNavigationInvalidation
  if (!publish) return emptyHealth()
  const attemptedAt = new Date()
  const entries = await executor.transaction(async (tx) => {
    const ready = await tx.select().from(navigationRealtimeOutbox)
      .where(and(
        options?.outboxId ? eq(navigationRealtimeOutbox.id, options.outboxId) : undefined,
        lte(navigationRealtimeOutbox.nextAttemptAt, sql`CURRENT_TIMESTAMP`),
      ))
      .orderBy(asc(navigationRealtimeOutbox.committedAt))
      .limit(Math.min(Math.max(options?.limit ?? 100, 1), 500))
      .for("update", { skipLocked: true })
    if (!ready.length) return ready
    await tx.update(navigationRealtimeOutbox).set({
      attempts: sql`${navigationRealtimeOutbox.attempts} + 1`,
      lastAttemptAt: attemptedAt,
      nextAttemptAt: new Date(attemptedAt.getTime() + LEASE_MS),
    }).where(inArray(navigationRealtimeOutbox.id, ready.map((row) => row.id)))
    return ready.map((row) => ({ ...row, attempts: row.attempts + 1 }))
  })

  const delivered: string[] = []
  const discarded: string[] = []
  const retries = new Map<number, string[]>()
  for (const entry of entries) {
    try {
      await publish({ env, event: toNavigationRealtimeEvent(entry) })
      delivered.push(entry.id)
    } catch (error) {
      if (entry.attempts >= MAX_ATTEMPTS) discarded.push(entry.id)
      else retries.set(entry.attempts, [...(retries.get(entry.attempts) ?? []), entry.id])
      console.error(JSON.stringify({
        attempts: entry.attempts,
        error: error instanceof Error ? error.message : String(error),
        event: "navigation_realtime_publish_failed",
        eventId: entry.id,
        workspaceId: entry.workspaceId,
      }))
    }
  }
  const deleteIds = [...delivered, ...discarded]
  if (deleteIds.length) await executor.delete(navigationRealtimeOutbox)
    .where(inArray(navigationRealtimeOutbox.id, deleteIds))
  for (const [attempts, ids] of retries) {
    await executor.update(navigationRealtimeOutbox)
      .set({ nextAttemptAt: retryAt(attempts, attemptedAt) })
      .where(inArray(navigationRealtimeOutbox.id, ids))
  }
  const [health] = await executor.select({
    backlog: sql<number>`count(*)::int`,
    maxAttempts: sql<number>`coalesce(max(${navigationRealtimeOutbox.attempts}), 0)::int`,
    oldestCommittedAt: sql<Date | null>`min(${navigationRealtimeOutbox.committedAt})`,
  }).from(navigationRealtimeOutbox)
  return {
    backlog: health?.backlog ?? 0,
    delivered: delivered.length,
    discarded: discarded.length,
    failed: entries.length - delivered.length,
    maxAttempts: health?.maxAttempts ?? 0,
    oldestAgeMs: Math.max(0, attemptedAt.getTime() - (health?.oldestCommittedAt?.getTime() ?? attemptedAt.getTime())),
  }
}

export function toNavigationRealtimeEvent(entry: { committedAt: Date; id: string; workspaceId: string }): NavigationRealtimeInvalidateEvent {
  return {
    committedAt: entry.committedAt.toISOString(),
    eventId: entry.id,
    protocolVersion: 1,
    type: "navigation.invalidate",
    workspaceId: entry.workspaceId,
  }
}

export async function publishCommittedNavigationInvalidation(
  row: { committedAt: Date; id: string; workspaceId: string },
  env: RuntimeEnv | undefined,
) {
  if (!env) return false
  try {
    return await publishNavigationInvalidation(toNavigationRealtimeEvent(row), env)
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      event: "navigation_realtime_immediate_publish_failed",
      eventId: row.id,
      workspaceId: row.workspaceId,
    }))
    return false
  }
}

function retryAt(attempts: number, from: Date) {
  return new Date(from.getTime() + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6)))
}

function emptyHealth() {
  return { backlog: 0, delivered: 0, discarded: 0, failed: 0, maxAttempts: 0, oldestAgeMs: 0 }
}
