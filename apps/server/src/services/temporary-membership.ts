import { and, eq, inArray, lte, ne, or, sql } from "drizzle-orm";

import { db, type Database } from "../infrastructure/database";
import {
  member,
  session,
  team,
  teamMember,
  teamspace,
  teamspacePrincipal,
} from "../infrastructure/database/schema";

const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "member",
  "temporary",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const TEMPORARY_MEMBER_ROLE = "temporary" as const;
export const MAX_TEMPORARY_ACCESS_MS = 365 * 24 * 60 * 60 * 1000;

export class TemporaryMembershipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporaryMembershipValidationError";
  }
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole);
}

export function parseMembershipAccessExpiry(
  role: WorkspaceRole,
  value: unknown,
  now = new Date(),
) {
  if (role !== TEMPORARY_MEMBER_ROLE) {
    if (value !== undefined && value !== null && value !== "") {
      throw new TemporaryMembershipValidationError(
        "Only temporary members can have an access expiration.",
      );
    }

    return null;
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new TemporaryMembershipValidationError(
      "Temporary members require an expiration date.",
    );
  }

  const expiresAt = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new TemporaryMembershipValidationError(
      "Enter a valid temporary-member expiration date.",
    );
  }

  if (expiresAt.getTime() <= now.getTime()) {
    throw new TemporaryMembershipValidationError(
      "Temporary-member access must expire in the future.",
    );
  }

  if (expiresAt.getTime() - now.getTime() > MAX_TEMPORARY_ACCESS_MS) {
    throw new TemporaryMembershipValidationError(
      "Temporary-member access cannot exceed one year.",
    );
  }

  return expiresAt;
}

export function activeMembershipCondition(now = new Date()) {
  return or(
    ne(member.role, TEMPORARY_MEMBER_ROLE),
    sql`${member.accessExpiresAt} > ${now}`,
  );
}

export async function expireTemporaryMemberships(
  database: Database = db,
  options: { now?: Date; userId?: string } = {},
) {
  const now = options.now ?? new Date();
  const filters = [
    eq(member.role, TEMPORARY_MEMBER_ROLE),
    lte(member.accessExpiresAt, now),
  ];

  if (options.userId) {
    filters.push(eq(member.userId, options.userId));
  }

  return database.transaction(async (transaction) => {
    const expired = await transaction
      .select({
        id: member.id,
        userId: member.userId,
        workspaceId: member.organizationId,
      })
      .from(member)
      .where(and(...filters));

    if (expired.length === 0) {
      return [];
    }

    for (const workspaceId of new Set(expired.map((row) => row.workspaceId))) {
      const userIds = expired
        .filter((row) => row.workspaceId === workspaceId)
        .map((row) => row.userId);
      const workspaceTeamIds = transaction
        .select({ id: team.id })
        .from(team)
        .where(eq(team.organizationId, workspaceId));
      const workspaceTeamspaceIds = transaction
        .select({ id: teamspace.id })
        .from(teamspace)
        .where(eq(teamspace.workspaceId, workspaceId));

      await transaction
        .delete(teamMember)
        .where(
          and(
            inArray(teamMember.userId, userIds),
            inArray(teamMember.teamId, workspaceTeamIds),
          ),
        );

      await transaction
        .delete(teamspacePrincipal)
        .where(
          and(
            eq(teamspacePrincipal.principalType, "user"),
            inArray(teamspacePrincipal.principalId, userIds),
            inArray(teamspacePrincipal.teamspaceId, workspaceTeamspaceIds),
          ),
        );

      await transaction
        .update(session)
        .set({ activeTeamId: null, activeWorkspaceId: null })
        .where(
          and(
            inArray(session.userId, userIds),
            eq(session.activeWorkspaceId, workspaceId),
          ),
        );
    }

    await transaction
      .delete(member)
      .where(inArray(member.id, expired.map((row) => row.id)));

    return expired;
  });
}
