import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  databaseAutomationRun,
  databaseAutomationEventWindow,
} from "../../../infrastructure/database/schema";

export async function failAutomationDelivery(resourceId: string, window: boolean) {
  const table = window ? databaseAutomationEventWindow : databaseAutomationRun;
  const [row] = await db
    .select({ status: table.status, leaseExpiresAt: table.leaseExpiresAt })
    .from(table)
    .where(eq(table.id, resourceId))
    .limit(1);
  const active = window ? ["accumulating", "ready", "processing"] : ["queued", "running"];
  if (!row || !active.includes(row.status)) return true;
  if (row.leaseExpiresAt && row.leaseExpiresAt > new Date()) return false;
  const condition = and(
    eq(table.id, resourceId),
    inArray(table.status, active),
    or(isNull(table.leaseExpiresAt), lte(table.leaseExpiresAt, sql`current_timestamp`)),
  );
  const values = window
    ? {
        status: "discarded",
        terminalReason: "TRANSPORT_RETRIES_EXHAUSTED",
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      }
    : {
        status: "failed",
        errorCode: "TRANSPORT_RETRIES_EXHAUSTED",
        errorSummary: "Background delivery exhausted.",
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      };
  const rows = await db.update(table).set(values).where(condition).returning({ id: table.id });
  return rows.length > 0;
}

export async function prepareAutomationReplay(resourceId: string, window: boolean) {
  const { databaseAutomation, databaseAutomationDelivery, databaseRow } =
    await import("../../../infrastructure/database/schema");
  if (window) {
    const [row] = await db
      .select()
      .from(databaseAutomationEventWindow)
      .where(eq(databaseAutomationEventWindow.id, resourceId))
      .for("update");
    if (!row || row.status !== "discarded" || row.terminalReason !== "TRANSPORT_RETRIES_EXHAUSTED")
      throw new Error("REPLAY_WINDOW_INELIGIBLE");
    const [record] = await db
      .select()
      .from(databaseRow)
      .where(and(eq(databaseRow.id, row.rowId), isNull(databaseRow.deletedAt)))
      .limit(1);
    if (!record) throw new Error("REPLAY_WINDOW_SOURCE_UNAVAILABLE");
    await db
      .update(databaseAutomationEventWindow)
      .set({
        status: "ready",
        nextAttemptAt: new Date(),
        terminalReason: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(databaseAutomationEventWindow.id, resourceId));
    return;
  }
  const [run] = await db
    .select()
    .from(databaseAutomationRun)
    .where(eq(databaseAutomationRun.id, resourceId))
    .for("update");
  if (!run || run.status !== "failed" || run.errorCode !== "TRANSPORT_RETRIES_EXHAUSTED")
    throw new Error("REPLAY_AUTOMATION_INELIGIBLE");
  const [active] = await db
    .select()
    .from(databaseAutomation)
    .where(
      and(
        eq(databaseAutomation.id, run.automationId),
        eq(databaseAutomation.status, "active"),
        isNull(databaseAutomation.deletedAt),
      ),
    )
    .limit(1);
  const [uncertain] = await db
    .select()
    .from(databaseAutomationDelivery)
    .where(
      and(
        eq(databaseAutomationDelivery.runId, resourceId),
        eq(databaseAutomationDelivery.status, "sending"),
      ),
    )
    .limit(1);
  if (uncertain) throw new Error("REPLAY_UNCERTAIN_WRITE_REQUIRES_REVIEW");
  if (!active) throw new Error("REPLAY_AUTOMATION_UNAVAILABLE");
  await db
    .update(databaseAutomationRun)
    .set({
      status: "queued",
      availableAt: new Date(),
      finishedAt: null,
      errorCode: null,
      errorSummary: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(databaseAutomationRun.id, resourceId));
}
