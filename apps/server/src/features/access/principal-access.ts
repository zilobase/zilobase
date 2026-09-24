import { and, asc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { member, workspace, workspaceGuest } from "../../infrastructure/database/schema";
import { activeMembershipCondition } from "../memberships";

export async function getMembership(workspaceId: string, userId: string) {
  const [record] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, userId),
        activeMembershipCondition(),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function getWorkspaceGuest(workspaceId: string, userId: string) {
  const [record] = await db
    .select()
    .from(workspaceGuest)
    .where(and(eq(workspaceGuest.workspaceId, workspaceId), eq(workspaceGuest.userId, userId)))
    .limit(1);

  return record ?? null;
}

export async function getWorkspaceRealtimeAccessExpiration(
  workspaceId: string,
  userId: string,
  now = new Date(),
) {
  const membership = await getMembership(workspaceId, userId);
  if (membership) return membership.accessExpiresAt;
  const guest = await getWorkspaceGuest(workspaceId, userId);
  return guest ? new Date(now.getTime() + 30_000) : null;
}

export async function getWorkspacePrincipalKind(
  workspaceId: string,
  userId: string,
): Promise<"member" | "guest" | null> {
  if (await getMembership(workspaceId, userId)) return "member";
  return (await getWorkspaceGuest(workspaceId, userId)) ? "guest" : null;
}

export function getWorkspaceMemberships(userId: string) {
  return db
    .select({
      role: member.role,
      workspaceId: member.organizationId,
      workspaceName: workspace.name,
    })
    .from(member)
    .innerJoin(workspace, eq(workspace.id, member.organizationId))
    .where(and(eq(member.userId, userId), activeMembershipCondition()))
    .orderBy(asc(member.createdAt), asc(member.id));
}

export function isPrivilegedOrgRole(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export async function isWorkspaceMember(workspaceId: string, userId: string) {
  return Boolean(await getMembership(workspaceId, userId));
}
