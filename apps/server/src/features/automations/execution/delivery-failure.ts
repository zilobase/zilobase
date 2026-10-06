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
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      };
  const rows = await db.update(table).set(values).where(condition).returning({ id: table.id });
  return rows.length > 0;
}
