import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  databaseAutomation,
  databaseAutomationDelivery,
  databaseAutomationEventWindow,
  databaseAutomationRun,
  databaseAutomationStepRun,
} from "../../../infrastructure/database/schema";
import { getDatabaseAutomationRetention, type RuntimeEnv } from "../../../shared/config/config";

const CLEANUP_BATCH = 1_000;

export async function cleanupDatabaseAutomationHistory(env: RuntimeEnv, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const retention = getDatabaseAutomationRetention(env);
  const detailCutoff = new Date(now.getTime() - retention.stepDetailDays * 86_400_000);
  const summaryCutoff = new Date(now.getTime() - retention.runSummaryDays * 86_400_000);
  const [stepIds, deliveryIds, runIds, eventWindowIds, automationIds] = await Promise.all([
    db.select({ id: databaseAutomationStepRun.id }).from(databaseAutomationStepRun).where(and(
      inArray(databaseAutomationStepRun.status, ["succeeded", "failed", "skipped"]),
      lt(databaseAutomationStepRun.createdAt, detailCutoff),
    )).orderBy(asc(databaseAutomationStepRun.createdAt)).limit(CLEANUP_BATCH),
    db.select({ id: databaseAutomationDelivery.id }).from(databaseAutomationDelivery).where(and(
      inArray(databaseAutomationDelivery.status, ["succeeded", "failed"]),
      lt(databaseAutomationDelivery.createdAt, detailCutoff),
    )).orderBy(asc(databaseAutomationDelivery.createdAt)).limit(CLEANUP_BATCH),
    db.select({ id: databaseAutomationRun.id }).from(databaseAutomationRun).where(and(
      inArray(databaseAutomationRun.status, ["succeeded", "failed", "skipped", "cancelled"]),
      lt(databaseAutomationRun.createdAt, summaryCutoff),
    )).orderBy(asc(databaseAutomationRun.createdAt)).limit(CLEANUP_BATCH),
    db.select({ id: databaseAutomationEventWindow.id }).from(databaseAutomationEventWindow).where(and(
      inArray(databaseAutomationEventWindow.status, ["completed", "discarded"]),
      isNotNull(databaseAutomationEventWindow.completedAt),
      lt(databaseAutomationEventWindow.completedAt, summaryCutoff),
    )).orderBy(asc(databaseAutomationEventWindow.completedAt)).limit(CLEANUP_BATCH),
    db.select({ id: databaseAutomation.id }).from(databaseAutomation).where(and(
      isNotNull(databaseAutomation.deletedAt),
      lt(databaseAutomation.deletedAt, summaryCutoff),
    )).orderBy(asc(databaseAutomation.deletedAt)).limit(CLEANUP_BATCH),
  ]);
  const deleted = await db.transaction(async (tx) => {
    const steps = stepIds.length ? await tx.delete(databaseAutomationStepRun).where(inArray(databaseAutomationStepRun.id, stepIds.map(({ id }) => id))).returning({ id: databaseAutomationStepRun.id }) : [];
    const deliveries = deliveryIds.length ? await tx.delete(databaseAutomationDelivery).where(inArray(databaseAutomationDelivery.id, deliveryIds.map(({ id }) => id))).returning({ id: databaseAutomationDelivery.id }) : [];
    const runs = runIds.length ? await tx.delete(databaseAutomationRun).where(inArray(databaseAutomationRun.id, runIds.map(({ id }) => id))).returning({ id: databaseAutomationRun.id }) : [];
    const eventWindows = eventWindowIds.length ? await tx.delete(databaseAutomationEventWindow).where(inArray(databaseAutomationEventWindow.id, eventWindowIds.map(({ id }) => id))).returning({ id: databaseAutomationEventWindow.id }) : [];
    const automations = automationIds.length ? await tx.delete(databaseAutomation).where(inArray(databaseAutomation.id, automationIds.map(({ id }) => id))).returning({ id: databaseAutomation.id }) : [];
    return { automations: automations.length, deliveries: deliveries.length, eventWindows: eventWindows.length, runs: runs.length, steps: steps.length };
  });
  return { ...deleted, retention };
}

export async function getDatabaseAutomationOperationalSnapshot(options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const [automations, eventWindows, runs, deliveries] = await Promise.all([
    groupedStatus(databaseAutomation, databaseAutomation.status, databaseAutomation.createdAt),
    groupedStatus(databaseAutomationEventWindow, databaseAutomationEventWindow.status, databaseAutomationEventWindow.openedAt),
    groupedStatus(databaseAutomationRun, databaseAutomationRun.status, databaseAutomationRun.createdAt),
    groupedStatus(databaseAutomationDelivery, databaseAutomationDelivery.status, databaseAutomationDelivery.createdAt),
  ]);
  const oldestQueuedAt = oldestAcross([
    ...eventWindows.filter(({ status }) => ["accumulating", "processing", "ready"].includes(status)),
    ...runs.filter(({ status }) => ["queued", "running"].includes(status)),
    ...deliveries.filter(({ status }) => ["pending", "retrying", "sending"].includes(status)),
  ]);
  const oldestBacklogAgeMs = oldestQueuedAt ? Math.max(0, now.getTime() - oldestQueuedAt.getTime()) : null;
  return {
    automations: withoutDates(automations),
    capturedAt: now.toISOString(),
    deliveries: withoutDates(deliveries),
    eventWindows: withoutDates(eventWindows),
    healthy: oldestBacklogAgeMs === null || oldestBacklogAgeMs < 5 * 60_000,
    oldestBacklogAgeMs,
    runs: withoutDates(runs),
  };
}

async function groupedStatus(table: any, status: any, createdAt: any) {
  return db.select({
    count: sql<number>`count(*)::integer`,
    oldestAt: sql<Date | null>`min(${createdAt})`,
    status,
  }).from(table).groupBy(status) as Promise<Array<{ count: number; oldestAt: Date | null; status: string }>>;
}

function oldestAcross(rows: Array<{ oldestAt: Date | null }>) {
  return rows.reduce<Date | null>((oldest, row) => !row.oldestAt || oldest && oldest <= row.oldestAt ? oldest : row.oldestAt, null);
}

function withoutDates(rows: Array<{ count: number; status: string }>) {
  return rows.map(({ count, status }) => ({ count, status }));
}
