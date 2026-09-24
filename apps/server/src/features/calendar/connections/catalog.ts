import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  calendarAccount,
  calendarBinding,
  member,
  workspace,
} from "../../../infrastructure/database/schema";
import { requireCalendarMembership } from "./ownership";

/** Every returned source remains addressable through its own workspace's authorized routes. */
export async function personalCalendarSources(userId: string, workspaceId: string) {
  await requireCalendarMembership(userId, workspaceId);
  const rows = await db
    .select({ binding: calendarBinding, account: calendarAccount, workspaceName: workspace.name })
    .from(calendarBinding)
    .innerJoin(
      calendarAccount,
      and(eq(calendarAccount.id, calendarBinding.accountId), eq(calendarAccount.userId, userId)),
    )
    .innerJoin(
      member,
      and(eq(member.organizationId, calendarBinding.workspaceId), eq(member.userId, userId)),
    )
    .innerJoin(workspace, eq(workspace.id, calendarBinding.workspaceId))
    .where(
      and(
        eq(calendarBinding.userId, userId),
        or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, new Date())),
      ),
    );
  rows.sort(
    (a, b) =>
      Number(b.binding.workspaceId === workspaceId) -
        Number(a.binding.workspaceId === workspaceId) || a.binding.id.localeCompare(b.binding.id),
  );
  const seen = new Set<string>();
  return rows
    .filter(({ binding, account }) => {
      if (seen.has(account.id)) return false;
      seen.add(account.id);
      return true;
    })
    .map(({ binding, account, workspaceName }) => ({
      workspaceId: binding.workspaceId,
      workspaceName,
      bindingId: binding.id,
      accountId: account.id,
      email: account.email,
      status: account.status,
      pushAvailable: false,
    }));
}
