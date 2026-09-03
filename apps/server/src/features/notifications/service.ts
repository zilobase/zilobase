import { and, count, desc, eq, inArray, isNull, or, gt } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db } from "../../infrastructure/database";
import {
  databaseAutomationDelivery,
  inProductNotification,
  inProductNotificationOutbox,
  member,
  page,
} from "../../infrastructure/database/schema";
import { getMembership } from "../access";
import type { RuntimeEnv } from "../../shared/config/config";
import { createBackgroundTask } from "../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../infrastructure/background/dispatch";

export class NotificationError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 = 400) {
    super(message);
  }
}

export async function listInProductNotifications(input: {
  limit?: number;
  userId: string;
  workspaceId: string;
}) {
  await requireMember(input.workspaceId, input.userId);
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const [notifications, unread] = await Promise.all([
    db.select().from(inProductNotification).where(and(
      eq(inProductNotification.workspaceId, input.workspaceId),
      eq(inProductNotification.userId, input.userId),
    )).orderBy(desc(inProductNotification.createdAt)).limit(limit),
    db.select({ value: count() }).from(inProductNotification).where(and(
      eq(inProductNotification.workspaceId, input.workspaceId),
      eq(inProductNotification.userId, input.userId),
      isNull(inProductNotification.readAt),
    )),
  ]);
  return {
    notifications: notifications.map(toNotification),
    unreadCount: unread[0]?.value ?? 0,
  };
}

export async function markInProductNotificationRead(input: {
  notificationId: string | "all";
  userId: string;
  workspaceId: string;
}) {
  await requireMember(input.workspaceId, input.userId);
  const now = new Date();
  const conditions = [
    eq(inProductNotification.workspaceId, input.workspaceId),
    eq(inProductNotification.userId, input.userId),
    isNull(inProductNotification.readAt),
  ];
  if (input.notificationId !== "all") conditions.push(eq(inProductNotification.id, input.notificationId));
  const rows = await db.update(inProductNotification)
    .set({ readAt: now, updatedAt: now })
    .where(and(...conditions))
    .returning({ id: inProductNotification.id });
  if (input.notificationId !== "all" && !rows.length) {
    const [existing] = await db.select({ id: inProductNotification.id }).from(inProductNotification).where(and(
      eq(inProductNotification.id, input.notificationId),
      eq(inProductNotification.workspaceId, input.workspaceId),
      eq(inProductNotification.userId, input.userId),
    )).limit(1);
    if (!existing) throw new NotificationError("Notification not found", 404);
  }
  return { markedRead: rows.length };
}

export async function activeNotificationRecipientIds(
  workspaceId: string,
  candidateIds: string[],
) {
  if (!candidateIds.length) return [];
  const now = new Date();
  const rows = await db.select({ userId: member.userId }).from(member).where(and(
    eq(member.organizationId, workspaceId),
    inArray(member.userId, [...new Set(candidateIds)]),
    or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, now)),
  ));
  return rows.map(({ userId }) => userId);
}

export async function accessibleNotificationPageId(workspaceId: string, pageId: string | null) {
  if (!pageId) return null;
  const [record] = await db.select({ id: page.id }).from(page).where(and(
    eq(page.id, pageId),
    eq(page.workspaceId, workspaceId),
    isNull(page.deletedAt),
  )).limit(1);
  return record?.id ?? null;
}

export async function createAutomationNotifications(input: {
  actionId: string;
  automationId: string;
  message: string;
  pageId: string | null;
  recipientIds: string[];
  runId: string;
  workspaceId: string;
  env?: RuntimeEnv;
}) {
  const now = new Date();
  const results: Array<{ notificationId: string; userId: string }> = [];
  await db.transaction(async (tx) => {
    for (const userId of input.recipientIds) {
      const destinationHash = createHash("sha256").update(userId).digest("hex");
      const notificationId = stableId("notification", input.runId, input.actionId, userId);
      const deliveryId = stableId("delivery", input.runId, input.actionId, userId);
      const [notification] = await tx.insert(inProductNotification).values({
        actionId: input.actionId,
        automationId: input.automationId,
        createdAt: now,
        id: notificationId,
        message: input.message,
        pageId: input.pageId,
        runId: input.runId,
        updatedAt: now,
        userId,
        workspaceId: input.workspaceId,
      }).onConflictDoNothing().returning({ id: inProductNotification.id });
      await tx.insert(databaseAutomationDelivery).values({
        actionId: input.actionId,
        attempts: 1,
        createdAt: now,
        deliveryId,
        destinationHash,
        id: deliveryId,
        kind: "notification",
        providerReference: notificationId,
        runId: input.runId,
        status: "succeeded",
        updatedAt: now,
      }).onConflictDoNothing();
      if (notification) {
        await tx.insert(inProductNotificationOutbox).values({
          createdAt: now,
          id: stableId("outbox", notificationId),
          nextAttemptAt: now,
          notificationId,
          updatedAt: now,
          userId,
          workspaceId: input.workspaceId,
        }).onConflictDoNothing();
      }
      results.push({ notificationId, userId });
    }
  });
  if (input.env) {
    await dispatchBackgroundTasks(input.env, results.map(({ notificationId }) =>
      createBackgroundTask({
        env: input.env!,
        kind: "notification.publish",
        resourceId: stableId("outbox", notificationId),
      })
    ));
  }
  return results;
}

const stableId = (...parts: string[]) =>
  createHash("sha256").update(parts.join(":"), "utf8").digest("hex");

const toNotification = (record: typeof inProductNotification.$inferSelect) => ({
  actionId: record.actionId,
  automationId: record.automationId,
  createdAt: record.createdAt.toISOString(),
  id: record.id,
  message: record.message,
  pageId: record.pageId,
  readAt: record.readAt?.toISOString() ?? null,
  runId: record.runId,
  workspaceId: record.workspaceId,
});

async function requireMember(workspaceId: string, userId: string) {
  if (!(await getMembership(workspaceId, userId))) throw new NotificationError("Forbidden", 403);
}
