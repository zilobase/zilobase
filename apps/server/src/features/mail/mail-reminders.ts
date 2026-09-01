import { and, eq, lte, sql } from "drizzle-orm"
import type { MailReminder } from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import { gmailAccount, mailReminder } from "../../infrastructure/database/schema"
import { publishMailNotification } from "../../infrastructure/runtime/runtime-adapter"
import type { RuntimeEnv } from "../../shared/config/config"
import type { createGmailGateway } from "./gmail-gateway"

type Gateway = Awaited<ReturnType<typeof createGmailGateway>>

export async function listMailReminders(bindingId: string) {
  const rows = await db.select().from(mailReminder).where(and(eq(mailReminder.bindingId, bindingId), eq(mailReminder.status, "pending")))
  return rows.map(serializeReminder)
}

export async function scheduleMailReminder(input: { bindingId: string; gateway: Gateway; remindAt: Date; threadId: string }) {
  if (!Number.isFinite(input.remindAt.getTime()) || input.remindAt.getTime() <= Date.now() || input.remindAt.getTime() > Date.now() + 366 * 86_400_000) {
    throw new MailReminderError("Choose a reminder within the next year.", 400)
  }
  await input.gateway.modifyThread(input.threadId, { removeLabelIds: ["INBOX"] })
  const now = new Date()
  const [row] = await db.insert(mailReminder).values({
    bindingId: input.bindingId,
    createdAt: now,
    firedAt: null,
    gmailThreadId: input.threadId,
    id: crypto.randomUUID(),
    remindAt: input.remindAt,
    status: "pending",
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [mailReminder.bindingId, mailReminder.gmailThreadId],
    set: { firedAt: null, remindAt: input.remindAt, status: "pending", updatedAt: now },
  }).returning()
  return serializeReminder(row!)
}

export async function cancelMailReminder(bindingId: string, reminderId: string) {
  const [row] = await db.update(mailReminder).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(mailReminder.bindingId, bindingId), eq(mailReminder.id, reminderId), eq(mailReminder.status, "pending"))).returning()
  if (!row) throw new MailReminderError("Mail reminder not found.", 404)
  return { success: true as const }
}

export async function advanceMailReminders(input: { bindingId: string; connectionId: string; env: RuntimeEnv; gateway: Gateway; userId: string; workspaceId: string }) {
  const due = await db.select().from(mailReminder).where(and(eq(mailReminder.bindingId, input.bindingId), eq(mailReminder.status, "pending"), lte(mailReminder.remindAt, new Date())))
  const fired: MailReminder[] = []
  for (const reminder of due) {
    await input.gateway.modifyThread(reminder.gmailThreadId, { addLabelIds: ["INBOX"] })
    const now = new Date()
    const [updated] = await db.update(mailReminder).set({ firedAt: now, status: "fired", updatedAt: now }).where(and(eq(mailReminder.id, reminder.id), eq(mailReminder.status, "pending"))).returning()
    if (updated) fired.push(serializeReminder(updated))
  }
  if (fired.length) {
    const [account] = await db.update(gmailAccount).set({ mailboxRevision: sql`${gmailAccount.mailboxRevision} + 1`, updatedAt: new Date() }).where(eq(gmailAccount.id, input.connectionId)).returning({ revision: gmailAccount.mailboxRevision })
    if (account) await publishMailNotification(input.env, { bindingId: input.bindingId, connectionId: input.connectionId, revision: account.revision, userId: input.userId, workspaceId: input.workspaceId })
  }
  return { fired }
}

function serializeReminder(row: typeof mailReminder.$inferSelect): MailReminder {
  return { id: row.id, remindAt: row.remindAt.toISOString(), status: row.status as MailReminder["status"], threadId: row.gmailThreadId }
}

export class MailReminderError extends Error {
  constructor(message: string, readonly status: 400 | 404) { super(message); this.name = "MailReminderError" }
}
