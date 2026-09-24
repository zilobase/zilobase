import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarAccount, calendarBinding, member } from "../../../infrastructure/database/schema";
export class CalendarAccessError extends Error {
  constructor(
    public status: 403 | 404,
    message: string,
  ) {
    super(message);
  }
}
export async function requireCalendarMembership(userId: string, workspaceId: string) {
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, workspaceId),
        or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, new Date())),
      ),
    )
    .limit(1);
  if (!membership) throw new CalendarAccessError(403, "Workspace access required.");
}
export async function requireCalendarBinding(
  userId: string,
  workspaceId: string,
  bindingId: string,
) {
  await requireCalendarMembership(userId, workspaceId);
  const [row] = await db
    .select({ binding: calendarBinding, account: calendarAccount })
    .from(calendarBinding)
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendarBinding.accountId))
    .where(
      and(
        eq(calendarBinding.id, bindingId),
        eq(calendarBinding.userId, userId),
        eq(calendarBinding.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!row) throw new CalendarAccessError(404, "Calendar account unavailable.");
  return row;
}
export async function disconnectCalendarBinding(
  userId: string,
  workspaceId: string,
  bindingId: string,
) {
  await requireCalendarBinding(userId, workspaceId, bindingId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`calendar:${userId}`}))`);
    const [binding] = await tx
      .delete(calendarBinding)
      .where(
        and(
          eq(calendarBinding.id, bindingId),
          eq(calendarBinding.userId, userId),
          eq(calendarBinding.workspaceId, workspaceId),
        ),
      )
      .returning();
    if (!binding) return;
    const remaining = await tx
      .select({ id: calendarBinding.id })
      .from(calendarBinding)
      .where(eq(calendarBinding.accountId, binding.accountId))
      .limit(1);
    if (!remaining.length)
      await tx.delete(calendarAccount).where(eq(calendarAccount.id, binding.accountId));
  });
}
