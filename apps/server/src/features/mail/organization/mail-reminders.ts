import { and, eq, lte, sql } from "drizzle-orm";
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
  gateway: Gateway;
  remindAt: Date;
  threadId: string;
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
  try {
    await input.gateway.modifyThread(input.threadId, { removeLabelIds: ["INBOX"] });
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
  return serializeReminder(row!);
}

export async function cancelMailReminder(input: {
  bindingId: string;
  gateway: Gateway;
  reminderId: string;
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
  await input.gateway.modifyThread(existing.gmailThreadId, { addLabelIds: ["INBOX"] });
  const [row] = await db
    .update(mailReminder)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(mailReminder.id, existing.id), eq(mailReminder.status, "pending")))
    .returning();
  if (!row) throw new MailReminderError("Mail reminder not found.", 404);
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
  for (const reminder of due) {
    await input.gateway.modifyThread(reminder.gmailThreadId, { addLabelIds: ["INBOX"] });
    const now = new Date();
    const [updated] = await db
      .update(mailReminder)
      .set({ firedAt: now, status: "fired", updatedAt: now })
      .where(and(eq(mailReminder.id, reminder.id), eq(mailReminder.status, "pending")))
      .returning();
    if (updated) fired.push(serializeReminder(updated));
  }
  if (fired.length) {
    const [account] = await db
      .update(gmailAccount)
      .set({ mailboxRevision: sql`${gmailAccount.mailboxRevision} + 1`, updatedAt: new Date() })
      .where(eq(gmailAccount.id, input.connectionId))
      .returning({ revision: gmailAccount.mailboxRevision });
    if (account)
      await publishMailNotification({
        bindingId: input.bindingId,
        connectionId: input.connectionId,
        revision: account.revision,
        userId: input.userId,
        workspaceId: input.workspaceId,
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
