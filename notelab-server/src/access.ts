import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  member,
  teamMember,
  workspace,
  workspaceAccess,
} from "./db/schema";

export type AccessLevel = "none" | "view" | "edit" | "full";

const accessRank: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

export function hasAccess(
  actual: AccessLevel,
  required: Exclude<AccessLevel, "none">,
) {
  return accessRank[actual] >= accessRank[required];
}

export function normalizeAccessLevel(value: unknown): AccessLevel | null {
  return value === "view" || value === "edit" || value === "full"
    ? value
    : null;
}

export async function getMembership(organizationId: string, userId: string) {
  const [record] = await db
    .select()
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);

  return record ?? null;
}

export function isPrivilegedOrgRole(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export async function isOrganizationMember(
  organizationId: string,
  userId: string,
) {
  return Boolean(await getMembership(organizationId, userId));
}

export async function getWorkspaceRecord(id: string) {
  const [record] = await db
    .select()
    .from(workspace)
    .where(and(eq(workspace.id, id), isNull(workspace.deletedAt)))
    .limit(1);

  return record ?? null;
}

export async function getEffectiveWorkspaceAccess(
  workspaceId: string,
  userId: string,
): Promise<AccessLevel> {
  const record = await getWorkspaceRecord(workspaceId);

  if (!record) {
    return "none";
  }

  const membership = await getMembership(record.organizationId, userId);

  if (!membership) {
    return "none";
  }

  if (isPrivilegedOrgRole(membership.role)) {
    return "full";
  }

  const [workspaces, teamRows] = await Promise.all([
    db
      .select({
        createdById: workspace.createdById,
        id: workspace.id,
        metadata: workspace.metadata,
      })
      .from(workspace)
      .where(
        and(
          eq(workspace.organizationId, record.organizationId),
          isNull(workspace.deletedAt),
        ),
      ),
    db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, userId)),
  ]);
  const ancestorIds = getAncestorIds(workspaceId, workspaces);

  if (hasOwnedRootAccess(ancestorIds, workspaces, userId)) {
    return "full";
  }

  const targetTypes = ["user"];
  const targetIds = [userId, ...teamRows.map((row) => row.teamId)];

  if (teamRows.length > 0) {
    targetTypes.push("team");
  }

  const rules = await db
    .select()
    .from(workspaceAccess)
    .where(
      and(
        eq(workspaceAccess.organizationId, record.organizationId),
        inArray(workspaceAccess.workspaceId, ancestorIds),
        inArray(workspaceAccess.targetType, targetTypes),
        inArray(workspaceAccess.targetId, targetIds),
      ),
    );

  return rules.reduce<AccessLevel>((best, rule) => {
    const next = normalizeAccessLevel(rule.accessLevel) ?? "none";

    return accessRank[next] > accessRank[best] ? next : best;
  }, "none");
}

export async function isWorkspacePublished(workspaceId: string) {
  const record = await getWorkspaceRecord(workspaceId);

  if (!record) {
    return false;
  }

  const workspaces = await db
    .select({
      id: workspace.id,
      metadata: workspace.metadata,
    })
    .from(workspace)
    .where(
      and(
        eq(workspace.organizationId, record.organizationId),
        isNull(workspace.deletedAt),
      ),
    );
  const ancestorIds = getAncestorIds(workspaceId, workspaces);

  if (ancestorIds.length === 0) {
    return false;
  }

  const [rule] = await db
    .select({ id: workspaceAccess.id })
    .from(workspaceAccess)
    .where(
      and(
        eq(workspaceAccess.organizationId, record.organizationId),
        inArray(workspaceAccess.workspaceId, ancestorIds),
        eq(workspaceAccess.targetType, "public"),
        eq(workspaceAccess.targetId, "*"),
      ),
    )
    .limit(1);

  return Boolean(rule);
}

export async function canAccessWorkspace(
  workspaceId: string,
  userId: string,
  required: Exclude<AccessLevel, "none">,
) {
  return hasAccess(await getEffectiveWorkspaceAccess(workspaceId, userId), required);
}

export async function getAccessibleWorkspaceIds(
  organizationId: string,
  userId: string,
) {
  const membership = await getMembership(organizationId, userId);

  if (!membership) {
    return new Set<string>();
  }

  const workspaces = await db
    .select({
      createdById: workspace.createdById,
      id: workspace.id,
      metadata: workspace.metadata,
    })
    .from(workspace)
    .where(
      and(eq(workspace.organizationId, organizationId), isNull(workspace.deletedAt)),
    );

  if (isPrivilegedOrgRole(membership.role)) {
    return new Set(workspaces.map((item) => item.id));
  }

  const teamRows = await db
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId));
  const targetTypes = ["user"];
  const targetIds = [userId, ...teamRows.map((row) => row.teamId)];

  if (teamRows.length > 0) {
    targetTypes.push("team");
  }

  const rules =
    targetIds.length > 0
      ? await db
          .select({ workspaceId: workspaceAccess.workspaceId })
          .from(workspaceAccess)
          .where(
            and(
              eq(workspaceAccess.organizationId, organizationId),
              inArray(workspaceAccess.targetType, targetTypes),
              inArray(workspaceAccess.targetId, targetIds),
            ),
          )
      : [];
  const accessible = new Set<string>();
  const sharedRoots = new Set(rules.map((rule) => rule.workspaceId));

  for (const item of workspaces) {
    const ancestors = getAncestorIds(item.id, workspaces);

    if (
      hasOwnedRootAccess(ancestors, workspaces, userId) ||
      ancestors.some((id) => sharedRoots.has(id))
    ) {
      accessible.add(item.id);
    }
  }

  return accessible;
}

function getAncestorIds(
  workspaceId: string,
  workspaces: Array<{ id: string; metadata: unknown }>,
) {
  const byId = new Map(workspaces.map((item) => [item.id, item]));
  const ids: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(workspaceId);

  while (current && !visited.has(current.id)) {
    ids.push(current.id);
    visited.add(current.id);

    const parentWorkspaceId = readParentWorkspaceId(current.metadata);
    current = parentWorkspaceId ? byId.get(parentWorkspaceId) : undefined;
  }

  return ids;
}

function hasOwnedRootAccess(
  ancestorIds: string[],
  workspaces: Array<{ createdById?: string | null; id: string; metadata: unknown }>,
  userId: string,
) {
  const byId = new Map(workspaces.map((item) => [item.id, item]));

  for (let index = 0; index < ancestorIds.length; index += 1) {
    const ancestor = byId.get(ancestorIds[index]);
    const parentIds = ancestorIds.slice(index + 1);

    if (
      ancestor?.createdById === userId &&
      parentIds.every((parentId) => byId.get(parentId)?.createdById === userId)
    ) {
      return true;
    }
  }

  return false;
}

function readParentWorkspaceId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const parentWorkspaceId = (metadata as { parentWorkspaceId?: unknown })
    .parentWorkspaceId;

  return typeof parentWorkspaceId === "string" && parentWorkspaceId.length > 0
    ? parentWorkspaceId
    : null;
}
