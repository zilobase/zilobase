import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getMembership } from "../../access";
import { db, type Database } from "../../db";
import {
  member,
  teamspace,
  teamspacePrincipal,
  user,
  workspace,
} from "../../db/schema";
import type { ZilobaseEditionExtension } from "../../edition-extension";
import { activeMembershipCondition } from "../../services/temporary-membership";
import {
  canCreateTeamspace,
  canDiscoverTeamspace,
  canInviteTeamspaceMembers,
  canJoinTeamspace,
  canManageTeamspace,
  type TeamspaceAccessMode,
  type TeamspaceCreationPolicy,
  type TeamspaceInvitePolicy,
  type TeamspaceRole,
} from "./policy";

export class TeamspaceManagementError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "TeamspaceManagementError";
  }
}

export type TeamspaceUpdateInput = {
  accessMode?: TeamspaceAccessMode;
  description?: string | null;
  icon?: unknown;
  invitePolicy?: TeamspaceInvitePolicy;
  memberAccessLevel?: "view" | "comment" | "edit" | "full";
  name?: string;
  sidebarEditPolicy?: TeamspaceInvitePolicy;
};

export class TeamspaceManagementService {
  constructor(
    private readonly database: Database = db,
    private readonly editionExtension?: ZilobaseEditionExtension,
  ) {}

  async list(input: {
    includeArchived?: boolean;
    userId: string;
    workspaceId: string;
  }) {
    const membership = await getMembership(input.workspaceId, input.userId);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    const records = await this.database
      .select()
      .from(teamspace)
      .where(
        and(
          eq(teamspace.workspaceId, input.workspaceId),
          input.includeArchived ? undefined : isNull(teamspace.archivedAt),
        ),
      )
      .orderBy(asc(teamspace.name));
    const principalRows =
      records.length > 0
        ? await this.database
            .select()
            .from(teamspacePrincipal)
            .where(
              inArray(
                teamspacePrincipal.teamspaceId,
                records.map((record) => record.id),
              ),
            )
        : [];
    const visible = records.filter((record) => {
      const role = getDirectRole(principalRows, record.id, input.userId);
      return canDiscoverTeamspace({
        accessMode: record.accessMode as TeamspaceAccessMode,
        isTeamspacePrincipal: Boolean(role),
        isWorkspaceOwner: membership.role === "owner",
      });
    });

    return visible.map((record) => ({
      ...record,
      currentUserRole: getDirectRole(principalRows, record.id, input.userId),
      memberCount: principalRows.filter(
        (principal) => principal.teamspaceId === record.id,
      ).length,
      ownerIds: principalRows
        .filter(
          (principal) =>
            principal.teamspaceId === record.id && principal.role === "owner",
        )
        .map((principal) => principal.principalId),
    }));
  }

  async get(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const [membership, record] = await Promise.all([
      getMembership(input.workspaceId, input.userId),
      this.getRecord(input.workspaceId, input.teamspaceId),
    ]);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
    const role = await this.getRole(record.id, input.userId);
    if (
      !canDiscoverTeamspace({
        accessMode: record.accessMode as TeamspaceAccessMode,
        isTeamspacePrincipal: Boolean(role),
        isWorkspaceOwner: membership.role === "owner",
      })
    ) {
      throw new TeamspaceManagementError("Teamspace not found.", 404);
    }
    return { ...record, currentUserRole: role };
  }

  async create(input: {
    accessMode: TeamspaceAccessMode;
    description?: string | null;
    icon?: unknown;
    name: string;
    userId: string;
    workspaceId: string;
  }) {
    const [membership, workspaceRecord] = await Promise.all([
      getMembership(input.workspaceId, input.userId),
      this.database
        .select({ creationPolicy: workspace.teamspaceCreationPolicy })
        .from(workspace)
        .where(eq(workspace.id, input.workspaceId))
        .then((rows) => rows[0] ?? null),
    ]);
    if (!membership || !workspaceRecord) {
      throw new TeamspaceManagementError("Forbidden", 403);
    }
    if (
      !canCreateTeamspace({
        creationPolicy:
          workspaceRecord.creationPolicy as TeamspaceCreationPolicy,
        isActiveWorkspaceMember: true,
        workspaceRole: membership.role,
      })
    ) {
      throw new TeamspaceManagementError(
        "Only workspace owners can create teamspaces.",
        403,
      );
    }

    try {
      const result = await this.database.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(teamspace)
          .values({
            accessMode: input.accessMode,
            createdById: input.userId,
            description: input.description ?? null,
            icon: input.icon ?? null,
            id: crypto.randomUUID(),
            name: input.name,
            workspaceId: input.workspaceId,
          })
          .returning();
        if (!created) throw new Error("Teamspace could not be created");
        await transaction.insert(teamspacePrincipal).values({
          addedById: input.userId,
          id: crypto.randomUUID(),
          membershipSource: "creator",
          principalId: input.userId,
          principalType: "user",
          role: "owner",
          teamspaceId: created.id,
        });
        return created;
      });
      await this.audit("teamspace.created", input, {
        accessMode: result.accessMode,
        teamspaceId: result.id,
      });
      return { ...result, currentUserRole: "owner" as const };
    } catch (error) {
      if (getDatabaseErrorCode(error) === "23505") {
        throw new TeamspaceManagementError(
          "An active teamspace already uses this name.",
          409,
        );
      }
      throw error;
    }
  }

  async update(
    input: {
      teamspaceId: string;
      userId: string;
      workspaceId: string;
    } & TeamspaceUpdateInput,
  ) {
    const { membership, record, role } = await this.requireManage(input);
    if (
      input.accessMode === "private" &&
      membership.role !== "owner" &&
      record.accessMode !== "private"
    ) {
      throw new TeamspaceManagementError(
        "Only workspace owners can make a teamspace private.",
        403,
      );
    }
    const [updated] = await this.database
      .update(teamspace)
      .set({
        ...(input.accessMode !== undefined
          ? { accessMode: input.accessMode }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.invitePolicy !== undefined
          ? { invitePolicy: input.invitePolicy }
          : {}),
        ...(input.memberAccessLevel !== undefined
          ? { memberAccessLevel: input.memberAccessLevel }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sidebarEditPolicy !== undefined
          ? { sidebarEditPolicy: input.sidebarEditPolicy }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(teamspace.id, record.id))
      .returning();
    await this.audit("teamspace.updated", input, {
      teamspaceId: record.id,
    });
    return { ...updated!, currentUserRole: role };
  }

  async join(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const [membership, record] = await Promise.all([
      getMembership(input.workspaceId, input.userId),
      this.getRecord(input.workspaceId, input.teamspaceId),
    ]);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
    if (
      !canJoinTeamspace({
        accessMode: record.accessMode as TeamspaceAccessMode,
        archived: Boolean(record.archivedAt),
        isActiveWorkspaceMember: true,
      })
    ) {
      throw new TeamspaceManagementError("This teamspace cannot be joined.", 403);
    }
    const [created] = await this.database
      .insert(teamspacePrincipal)
      .values({
        addedById: input.userId,
        id: crypto.randomUUID(),
        membershipSource: "self_join",
        principalId: input.userId,
        principalType: "user",
        role: "member",
        teamspaceId: record.id,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await this.audit("teamspace.joined", input, { teamspaceId: record.id });
    }
    return created ?? (await this.getDirectPrincipal(record.id, input.userId));
  }

  async leave(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const record = await this.getRecord(input.workspaceId, input.teamspaceId);
    if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
    if (record.isDefault) {
      throw new TeamspaceManagementError(
        "Default teamspaces cannot be left.",
        409,
      );
    }
    const principal = await this.getDirectPrincipal(record.id, input.userId);
    if (!principal) throw new TeamspaceManagementError("Membership not found.", 404);
    if (principal.role === "owner") {
      const [{ count }] = await this.database
        .select({ count: sql<number>`count(*)::integer` })
        .from(teamspacePrincipal)
        .where(
          and(
            eq(teamspacePrincipal.teamspaceId, record.id),
            eq(teamspacePrincipal.role, "owner"),
          ),
        );
      if ((count ?? 0) <= 1) {
        throw new TeamspaceManagementError(
          "Assign another owner before leaving.",
          409,
        );
      }
    }
    await this.database
      .delete(teamspacePrincipal)
      .where(eq(teamspacePrincipal.id, principal.id));
    await this.audit("teamspace.left", input, { teamspaceId: record.id });
    return { removed: true };
  }

  async listPrincipals(input: {
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    await this.get(input);
    return this.database
      .select({
        accessLevelOverride: teamspacePrincipal.accessLevelOverride,
        createdAt: teamspacePrincipal.createdAt,
        email: user.email,
        id: teamspacePrincipal.id,
        membershipSource: teamspacePrincipal.membershipSource,
        name: user.name,
        principalId: teamspacePrincipal.principalId,
        principalType: teamspacePrincipal.principalType,
        role: teamspacePrincipal.role,
      })
      .from(teamspacePrincipal)
      .leftJoin(
        user,
        and(
          eq(teamspacePrincipal.principalType, "user"),
          eq(teamspacePrincipal.principalId, user.id),
        ),
      )
      .where(eq(teamspacePrincipal.teamspaceId, input.teamspaceId))
      .orderBy(asc(user.name), asc(user.email));
  }

  async addPrincipal(input: {
    role: TeamspaceRole;
    targetUserId: string;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    const { record, role } = await this.requireVisible(input);
    if (
      !canInviteTeamspaceMembers({
        invitePolicy: record.invitePolicy as TeamspaceInvitePolicy,
        teamspaceRole: role,
      })
    ) {
      throw new TeamspaceManagementError("Forbidden", 403);
    }
    if (input.role === "owner" && role !== "owner") {
      throw new TeamspaceManagementError("Only owners can add owners.", 403);
    }
    const [target] = await this.database
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, input.workspaceId),
          eq(member.userId, input.targetUserId),
          activeMembershipCondition(),
        ),
      )
      .limit(1);
    if (!target) {
      throw new TeamspaceManagementError(
        "Only active workspace members can join a teamspace.",
        409,
      );
    }
    const [created] = await this.database
      .insert(teamspacePrincipal)
      .values({
        addedById: input.userId,
        id: crypto.randomUUID(),
        membershipSource: "explicit",
        principalId: input.targetUserId,
        principalType: "user",
        role: input.role,
        teamspaceId: input.teamspaceId,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      throw new TeamspaceManagementError(
        "This person is already in the teamspace.",
        409,
      );
    }
    await this.audit("teamspace.principal_added", input, {
      role: input.role,
      teamspaceId: input.teamspaceId,
    });
    return created;
  }

  async updatePrincipal(input: {
    principalId: string;
    role: TeamspaceRole;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    await this.requireManage(input);
    const principal = await this.getPrincipal(input.teamspaceId, input.principalId);
    if (!principal) throw new TeamspaceManagementError("Member not found.", 404);
    await this.assertOwnerRemains(input.teamspaceId, principal, input.role);
    const [updated] = await this.database
      .update(teamspacePrincipal)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(teamspacePrincipal.id, principal.id))
      .returning();
    await this.audit("teamspace.role_changed", input, {
      role: input.role,
      teamspaceId: input.teamspaceId,
    });
    return updated!;
  }

  async removePrincipal(input: {
    principalId: string;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    await this.requireManage(input);
    const principal = await this.getPrincipal(input.teamspaceId, input.principalId);
    if (!principal) throw new TeamspaceManagementError("Member not found.", 404);
    await this.assertOwnerRemains(input.teamspaceId, principal, "member");
    await this.database
      .delete(teamspacePrincipal)
      .where(eq(teamspacePrincipal.id, principal.id));
    await this.audit("teamspace.principal_removed", input, {
      teamspaceId: input.teamspaceId,
    });
    return { removed: true };
  }

  async getWorkspaceSettings(workspaceId: string, userId: string) {
    const membership = await getMembership(workspaceId, userId);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    const [record] = await this.database
      .select({ creationPolicy: workspace.teamspaceCreationPolicy })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .limit(1);
    return {
      canManage: membership.role === "owner",
      creationPolicy: record?.creationPolicy ?? "workspace_members",
    };
  }

  async updateWorkspaceSettings(input: {
    creationPolicy: TeamspaceCreationPolicy;
    userId: string;
    workspaceId: string;
  }) {
    const membership = await getMembership(input.workspaceId, input.userId);
    if (membership?.role !== "owner") {
      throw new TeamspaceManagementError(
        "Only workspace owners can change teamspace policy.",
        403,
      );
    }
    const [updated] = await this.database
      .update(workspace)
      .set({ teamspaceCreationPolicy: input.creationPolicy, updatedAt: new Date() })
      .where(eq(workspace.id, input.workspaceId))
      .returning({ creationPolicy: workspace.teamspaceCreationPolicy });
    await this.audit("teamspace.creation_policy_changed", input, {
      creationPolicy: input.creationPolicy,
    });
    return { canManage: true, ...updated! };
  }

  async getRole(teamspaceId: string, userId: string) {
    const principal = await this.getDirectPrincipal(teamspaceId, userId);
    return (principal?.role as TeamspaceRole | undefined) ?? null;
  }

  private getRecord(workspaceId: string, teamspaceId: string) {
    return this.database
      .select()
      .from(teamspace)
      .where(
        and(
          eq(teamspace.id, teamspaceId),
          eq(teamspace.workspaceId, workspaceId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  private getDirectPrincipal(teamspaceId: string, userId: string) {
    return this.database
      .select()
      .from(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.teamspaceId, teamspaceId),
          eq(teamspacePrincipal.principalType, "user"),
          eq(teamspacePrincipal.principalId, userId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  private getPrincipal(teamspaceId: string, principalId: string) {
    return this.database
      .select()
      .from(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.id, principalId),
          eq(teamspacePrincipal.teamspaceId, teamspaceId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  private async requireVisible(input: {
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    const [membership, record] = await Promise.all([
      getMembership(input.workspaceId, input.userId),
      this.getRecord(input.workspaceId, input.teamspaceId),
    ]);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
    const role = await this.getRole(record.id, input.userId);
    if (
      !canDiscoverTeamspace({
        accessMode: record.accessMode as TeamspaceAccessMode,
        isTeamspacePrincipal: Boolean(role),
        isWorkspaceOwner: membership.role === "owner",
      })
    ) {
      throw new TeamspaceManagementError("Teamspace not found.", 404);
    }
    return { membership, record, role };
  }

  private async requireManage(input: {
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    const context = await this.requireVisible(input);
    if (
      !canManageTeamspace({
        isWorkspaceOwner: context.membership.role === "owner",
        teamspaceRole: context.role,
      })
    ) {
      throw new TeamspaceManagementError("Forbidden", 403);
    }
    return context;
  }

  private async assertOwnerRemains(
    teamspaceId: string,
    principal: typeof teamspacePrincipal.$inferSelect,
    nextRole: TeamspaceRole,
  ) {
    if (principal.role !== "owner" || nextRole === "owner") return;
    const [{ count }] = await this.database
      .select({ count: sql<number>`count(*)::integer` })
      .from(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.teamspaceId, teamspaceId),
          eq(teamspacePrincipal.role, "owner"),
        ),
      );
    if ((count ?? 0) <= 1) {
      throw new TeamspaceManagementError(
        "The teamspace must keep at least one owner.",
        409,
      );
    }
  }

  private audit(
    type: string,
    input: { userId: string; workspaceId: string },
    details: Record<string, boolean | number | string | null>,
  ) {
    return this.editionExtension?.recordSecurityEvent({
      actorUserId: input.userId,
      database: this.database,
      details,
      occurredAt: new Date(),
      type,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
  }
}

function getDirectRole(
  principals: Array<typeof teamspacePrincipal.$inferSelect>,
  teamspaceId: string,
  userId: string,
) {
  const record = principals.find(
    (principal) =>
      principal.teamspaceId === teamspaceId &&
      principal.principalType === "user" &&
      principal.principalId === userId,
  );
  return (record?.role as TeamspaceRole | undefined) ?? null;
}

function getDatabaseErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}
