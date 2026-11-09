import { and, eq, lt } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  workspaceActionChange,
  workspaceActionReceipt,
} from "../../infrastructure/database/schema";
import type { ActionChange } from "./database-port";
import type { ActionReceiptKey, ActionReceiptStore } from "./receipts";

const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

function keyCondition(key: ActionReceiptKey) {
  return and(
    eq(workspaceActionReceipt.invocationId, key.invocationId),
    eq(workspaceActionReceipt.callId, key.callId),
    eq(workspaceActionReceipt.opIndex, key.opIndex),
  );
}

/** PostgreSQL receipts shared by every API and background instance. */
export const databaseReceiptStore: ActionReceiptStore = {
  async get(key) {
    const [row] = await db.select().from(workspaceActionReceipt).where(keyCondition(key)).limit(1);
    return row
      ? { kind: row.kind, request: row.request, status: row.status, result: row.result }
      : null;
  },
  async savePending(key, receipt) {
    await db
      .insert(workspaceActionReceipt)
      .values({ ...key, kind: receipt.kind, request: receipt.request })
      .onConflictDoNothing();
  },
  async complete(key, result) {
    await db
      .update(workspaceActionReceipt)
      .set({ status: "completed", result, completedAt: new Date() })
      .where(keyCondition(key));
  },
};

/** Persists an invocation's changes once; replays insert nothing new. */
export async function recordActionChanges(input: {
  invocationId: string;
  workspaceId: string;
  userId: string;
  changes: ActionChange[];
}) {
  if (!input.changes.length) return;
  await db
    .insert(workspaceActionChange)
    .values(
      input.changes.map((change) => ({
        id: `${input.invocationId}:${change.callId}:${change.opIndex}`,
        invocationId: input.invocationId,
        callId: change.callId,
        opIndex: change.opIndex,
        workspaceId: input.workspaceId,
        userId: input.userId,
        kind: change.kind,
        commandType: change.commandType,
        databaseId: change.databaseId,
        dataSourceId: change.dataSourceId,
        summary: { event: change.ack.event, result: change.ack.result },
        inverse: change.inverse,
      })),
    )
    .onConflictDoNothing();
}

/** Maintenance: receipts outlive delivery retries, matching database command receipts. */
export async function pruneActionReceipts(now = new Date()) {
  await db
    .delete(workspaceActionReceipt)
    .where(lt(workspaceActionReceipt.createdAt, new Date(now.getTime() - RECEIPT_RETENTION_MS)));
}
