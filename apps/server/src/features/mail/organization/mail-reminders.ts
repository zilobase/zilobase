import { and, eq, lte } from "drizzle-orm";
import type { MailReminder } from "@zilobase/features/mail/organization";

import { db } from "../../../infrastructure/database";
import {
  gmailAccount,
  gmailWorkspaceConnection,
  mailReminder,
} from "../../../infrastructure/database/schema";
import { publishMailNotification } from "@zilobase/runtime-adapter/capabilities";
import type { RuntimeEnv } from "../../../shared/config/config";
import { createGmailGateway } from "../provider/gmail-gateway";
import { applyMailboxThreadLabelDelta, commitMailboxRevision } from "../sync/mailbox-store";
import { requestMailSync } from "../sync/mail-sync-coordinator";

type Gateway = Awaited<ReturnType<typeof createGmailGateway>>;

export async function listMailReminders(bindingId: string) {
  const rows = await db
    .select()
    .from(mailReminder)
    .where(and(eq(mailReminder.bindingId, bindingId), eq(mailReminder.status, "pending")));
  return rows.map(serializeReminder);
}

export async function scheduleMailReminder(input: {
  bindingId: string;
  connectionId: string;
  env: RuntimeEnv;
  gateway: Gateway;
  remindAt: Date;
  threadId: string;
  userId: string;
  workspaceId: string;
}) {
  if (
    !Number.isFinite(input.remindAt.getTime()) ||
    input.remindAt.getTime() <= Date.now() ||
    input.remindAt.getTime() > Date.now() + 366 * 86_400_000
  ) {
    throw new MailReminderError("Choose a reminder within the next year.", 400);
  }
  const now = new Date();
  const [existing] = await db
    .select()
    .from(mailReminder)
    .where(
      and(
        eq(mailReminder.bindingId, input.bindingId),
        eq(mailReminder.gmailThreadId, input.threadId),
      ),
    )
    .limit(1);
  const [row] = await db
    .insert(mailReminder)
    .values({
      bindingId: input.bindingId,
      createdAt: now,
      firedAt: null,
      gmailThreadId: input.threadId,
      id: existing?.id ?? crypto.randomUUID(),
      remindAt: input.remindAt,
      status: "pending",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mailReminder.bindingId, mailReminder.gmailThreadId],
      set: { firedAt: null, remindAt: input.remindAt, status: "pending", updatedAt: now },
    })
    .returning();
  let historyId: string | undefined;
  try {
    historyId = (await input.gateway.modifyThread(input.threadId, { removeLabelIds: ["INBOX"] }))
      .historyId;
  } catch (error) {
    if (existing) {
      await db
        .update(mailReminder)
        .set({
          firedAt: existing.firedAt,
          remindAt: existing.remindAt,
          status: existing.status,
          updatedAt: existing.updatedAt,
        })
        .where(eq(mailReminder.id, existing.id));
    } else if (row) {
      await db.delete(mailReminder).where(eq(mailReminder.id, row.id));
    }
    throw error;
  }
  await applyMailboxThreadLabelDelta({
    gmailAccountId: input.connectionId,
    gmailThreadId: input.threadId,
    removeLabelIds: ["INBOX"],
  });
  const revision = await commitMailboxRevision(input.connectionId, {
    threadIds: [input.threadId],
  });
  await publishMailNotification({
    bindingId: input.bindingId,
    connectionId: input.connectionId,
    revision,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  await requestMailSync(input.env, {
    gmailAccountId: input.connectionId,
    historyId,
    reason: "reminder_scheduled",
  });
  return serializeReminder(row!);
}

export async function cancelMailReminder(input: {
  bindingId: string;
  connectionId: string;
  env: RuntimeEnv;
  gateway: Gateway;
  reminderId: string;
  userId: string;
  workspaceId: string;
}) {
  const [existing] = await db
    .select()
    .from(mailReminder)
    .where(
      and(
        eq(mailReminder.bindingId, input.bindingId),
        eq(mailReminder.id, input.reminderId),
        eq(mailReminder.status, "pending"),
      ),
    )
    .limit(1);
  if (!existing) throw new MailReminderError("Mail reminder not found.", 404);
  const historyId = (
    await input.gateway.modifyThread(existing.gmailThreadId, { addLabelIds: ["INBOX"] })
  ).historyId;
  const [row] = await db
    .update(mailReminder)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(mailReminder.id, existing.id), eq(mailReminder.status, "pending")))
    .returning();
  if (!row) throw new MailReminderError("Mail reminder not found.", 404);
  await applyMailboxThreadLabelDelta({
    addLabelIds: ["INBOX"],
    gmailAccountId: input.connectionId,
    gmailThreadId: existing.gmailThreadId,
  });
  const revision = await commitMailboxRevision(input.connectionId, {
    threadIds: [existing.gmailThreadId],
  });
  await publishMailNotification({
    bindingId: input.bindingId,
    connectionId: input.connectionId,
    revision,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  await requestMailSync(input.env, {
    gmailAccountId: input.connectionId,
    historyId,
    reason: "reminder_cancelled",
  });
  return { success: true as const };
}

export async function advanceDueMailReminders(env: RuntimeEnv, limit = 25) {
  const due = await db
    .select({
      account: gmailAccount,
      bindingId: mailReminder.bindingId,
      userId: gmailWorkspaceConnection.userId,
      workspaceId: gmailWorkspaceConnection.workspaceId,
    })
    .from(mailReminder)
    .innerJoin(gmailWorkspaceConnection, eq(mailReminder.bindingId, gmailWorkspaceConnection.id))
    .innerJoin(gmailAccount, eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id))
    .where(
      and(
        eq(mailReminder.status, "pending"),
        lte(mailReminder.remindAt, new Date()),
        eq(gmailAccount.status, "connected"),
      ),
    )
    .limit(Math.max(1, Math.min(limit, 100)));
  const seen = new Set<string>();
  for (const row of due) {
    if (seen.has(row.bindingId)) continue;
    seen.add(row.bindingId);
    try {
      await advanceMailReminders({
        bindingId: row.bindingId,
        connectionId: row.account.id,
        env,
        gateway: await createGmailGateway(env, row.account, { trafficClass: "background" }),
        userId: row.userId,
        workspaceId: row.workspaceId,
      });
    } catch {
      // One mailbox should not block reminders for the others.
    }
  }
}

export async function advanceMailReminders(input: {
  bindingId: string;
  connectionId: string;
  env: RuntimeEnv;
  gateway: Gateway;
  userId: string;
  workspaceId: string;
}) {
  const due = await db
    .select()
    .from(mailReminder)
    .where(
      and(
        eq(mailReminder.bindingId, input.bindingId),
        eq(mailReminder.status, "pending"),
        lte(mailReminder.remindAt, new Date()),
      ),
    );
  const fired: MailReminder[] = [];
  let newestHistoryId: string | undefined;
  for (const reminder of due) {
    const result = await input.gateway.modifyThread(reminder.gmailThreadId, {
      addLabelIds: ["INBOX"],
    });
    if (
      result.historyId &&
      (!newestHistoryId || BigInt(result.historyId) > BigInt(newestHistoryId))
    )
      newestHistoryId = result.historyId;
    await applyMailboxThreadLabelDelta({
      addLabelIds: ["INBOX"],
      gmailAccountId: input.connectionId,
      gmailThreadId: reminder.gmailThreadId,
    });
    const now = new Date();
    const [updated] = await db
      .update(mailReminder)
      .set({ firedAt: now, status: "fired", updatedAt: now })
      .where(and(eq(mailReminder.id, reminder.id), eq(mailReminder.status, "pending")))
      .returning();
    if (updated) fired.push(serializeReminder(updated));
  }
  if (fired.length) {
    const revision = await commitMailboxRevision(input.connectionId, {
      threadIds: fired.map((reminder) => reminder.threadId),
    });
    await publishMailNotification({
      bindingId: input.bindingId,
      connectionId: input.connectionId,
      revision,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
    await requestMailSync(input.env, {
      gmailAccountId: input.connectionId,
      historyId: newestHistoryId,
      reason: "reminder_fired",
    });
  }
  return { fired };
}

function serializeReminder(row: typeof mailReminder.$inferSelect): MailReminder {
  return {
    id: row.id,
    remindAt: row.remindAt.toISOString(),
    status: row.status as MailReminder["status"],
    threadId: row.gmailThreadId,
  };
}

export class MailReminderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
    this.name = "MailReminderError";
  }
}
