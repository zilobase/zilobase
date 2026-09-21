import { encodePageContentAsYjs } from "../../collaboration/document-codec";
import { markdownToPageContent } from "../conversion/markdown-to-page-content";
import type {
  AiAgentProfileDetail,
  AiAgentProfileRole,
  AiAgentProfileSummary,
  McpConnectionSummary,
} from "@zilobase/features/ai-chat/mcp-contract";
import { emptySettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  page,
  pageCollaborationDocument,
  aiAgentConversation,
  aiAgentProfile,
  aiAgentProfileAccess,
  aiAgentRevision,
  aiSettings,
  aiSettingsVersion,
  aiMcpConnection,
  itemVisit,
  member,
  team,
  teamMember,
} from "../../../infrastructure/database/schema";
import { activeMembershipCondition } from "../../memberships";
import {
  compileAgentDefinition,
  definitionForProfile,
  hashAgentDefinition,
} from "./agent-definition";

const ROLE_RANK: Record<AiAgentProfileRole, number> = {
  user: 1,
  editor: 2,
  owner: 3,
};

export class AgentProfileError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
  ) {
    super(message);
    this.name = "AgentProfileError";
  }
}

export async function listAccessibleAgentProfiles(input: {
  userId: string;
  workspaceId: string;
}) {
  if (!(await isActiveMember(input.workspaceId, input.userId))) return [];
  const profiles = await db
    .select()
    .from(aiAgentProfile)
    .where(and(
      eq(aiAgentProfile.workspaceId, input.workspaceId),
      eq(aiAgentProfile.status, "active"),
      or(
        eq(aiAgentProfile.ownerUserId, input.userId),
        sql`exists (
          select 1 from ${aiAgentProfileAccess} access
          where access.profile_id = ${aiAgentProfile.id}
            and (
              (access.principal_type = 'user' and access.principal_id = ${input.userId})
              or (access.principal_type = 'team' and exists (
                select 1 from ${teamMember} tm
                inner join ${team} t on t.id = tm.team_id
                where tm.team_id = access.principal_id
                  and tm.user_id = ${input.userId}
                  and t.workspace_id = ${input.workspaceId}
              ))
            )
        )`,
      ),
    ))
    .orderBy(desc(aiAgentProfile.updatedAt), desc(aiAgentProfile.id));

  const visits = profiles.length
    ? await db.select({ itemId: itemVisit.itemId, lastVisitedAt: itemVisit.lastVisitedAt })
        .from(itemVisit)
        .where(and(
          eq(itemVisit.userId, input.userId),
          eq(itemVisit.workspaceId, input.workspaceId),
          eq(itemVisit.itemKind, "agent"),
          inArray(itemVisit.itemId, profiles.map((profile) => profile.id)),
        ))
    : [];
  const visitedAtByAgentId = new Map(visits.map((visit) => [visit.itemId, visit.lastVisitedAt]));

  return Promise.all(profiles.map(async (profile) =>
    serializeProfileSummary(profile, await getAgentProfileRole({
      profileId: profile.id,
      userId: input.userId,
      workspaceId: input.workspaceId,
    }) ?? "user", visitedAtByAgentId.get(profile.id) ?? null)));
}

export async function createAgentProfile(input: {
  cover?: string | null;
  defaultModel?: string;
  description?: string;
  icon?: unknown;
  iconPosition?: "inline" | "top";
  instructions?: string;
  name: string;
  ownerUserId: string;
  workspaceId: string;
}) {
  if (!(await isActiveMember(input.workspaceId, input.ownerUserId))) {
    throw new AgentProfileError("agent_membership_required", "An active workspace membership is required.", 403);
  }
  const now = new Date();
  const id = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const values = {
    cover: input.cover ?? null,
    defaultModel: input.defaultModel ?? "auto",
    description: input.description ?? "",
    icon: input.icon ?? null,
    iconPosition: input.iconPosition ?? "inline",
    instructions: input.instructions ?? "",
    name: input.name,
  };
  const definition = definitionForProfile(values);
  const instructionPageId = input.instructions?.trim()
    ? crypto.randomUUID()
    : undefined;
  const instructionDocument = markdownToPageContent(input.instructions ?? "");
  const settingsDefinition = {
    ...emptySettingsDefinition(),
    name: values.name,
    description: values.description,
    icon: values.icon,
    cover: values.cover,
    iconPosition: values.iconPosition,
    instructions: values.instructions,
    instructionDocument,
    ...(instructionPageId ? { instructionPageId } : {}),
  };
  const settingsId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    if (instructionPageId) {
      await tx.insert(page).values({ id: instructionPageId, workspaceId: input.workspaceId, createdById: input.ownerUserId, type: "pageblock", name: "", content: instructionDocument, metadata: { zilobaseai: "instruction", agentInstructionsScope: `agent:${id}` } });
      await tx.insert(pageCollaborationDocument).values({ pageId: instructionPageId, state: Buffer.from(encodePageContentAsYjs(instructionDocument)), updatedAt: now });
    }
    await tx.insert(aiAgentProfile).values({
      ...values,
      createdAt: now,
      currentRevisionId: null,
      id,
      ownerUserId: input.ownerUserId,
      status: "active",
      updatedAt: now,
      version: 1,
      workspaceId: input.workspaceId,
    });
    await tx.insert(aiAgentRevision).values({
      compiledDefinition: compileAgentDefinition(definition),
      createdAt: now,
      createdByUserId: input.ownerUserId,
      definition,
      definitionHash: hashAgentDefinition(definition),
      id: revisionId,
      profileId: id,
      version: 1,
    });
    await tx.update(aiAgentProfile).set({ currentRevisionId: revisionId })
      .where(eq(aiAgentProfile.id, id));
    await tx.insert(aiSettings).values({
      id: settingsId,
      workspaceId: input.workspaceId,
      scope: `agent:${id}`,
      definition: settingsDefinition,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(aiSettingsVersion).values({
      id: crypto.randomUUID(),
      settingsId,
      definition: settingsDefinition,
      version: 1,
      createdByUserId: input.ownerUserId,
      createdAt: now,
    });
    await tx.insert(aiAgentConversation).values({
      createdAt: now,
      id: conversationId,
      lastActivityAt: now,
      profileId: id,
      updatedAt: now,
    });
  });
  return getAgentProfileDetail({
    profileId: id,
    userId: input.ownerUserId,
    workspaceId: input.workspaceId,
  });
}

export async function getAgentProfileRole(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}): Promise<AiAgentProfileRole | null> {
  if (!(await isActiveMember(input.workspaceId, input.userId))) return null;
  const [profile] = await db
    .select({ ownerUserId: aiAgentProfile.ownerUserId })
    .from(aiAgentProfile)
    .where(and(
      eq(aiAgentProfile.id, input.profileId),
      eq(aiAgentProfile.workspaceId, input.workspaceId),
      eq(aiAgentProfile.status, "active"),
    ))
    .limit(1);
  if (!profile) return null;
  if (profile.ownerUserId === input.userId) return "owner";

  const grants = await db
    .select({ role: aiAgentProfileAccess.role })
    .from(aiAgentProfileAccess)
    .where(and(
      eq(aiAgentProfileAccess.profileId, input.profileId),
      or(
        and(
          eq(aiAgentProfileAccess.principalType, "user"),
          eq(aiAgentProfileAccess.principalId, input.userId),
        ),
        and(
          eq(aiAgentProfileAccess.principalType, "team"),
          sql`exists (
            select 1 from ${teamMember} tm
            inner join ${team} t on t.id = tm.team_id
            where tm.team_id = ${aiAgentProfileAccess.principalId}
              and tm.user_id = ${input.userId}
              and t.workspace_id = ${input.workspaceId}
          )`,
        ),
      ),
    ));

  return grants.reduce<AiAgentProfileRole | null>((best, grant) => {
    const role = grant.role === "editor" ? "editor" : "user";
    return !best || ROLE_RANK[role] > ROLE_RANK[best] ? role : best;
  }, null);
}

export async function requireAgentProfileRole(input: {
  minimum: AiAgentProfileRole;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  const role = await getAgentProfileRole(input);
  if (!role) throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
  if (ROLE_RANK[role] < ROLE_RANK[input.minimum]) {
    throw new AgentProfileError("agent_forbidden", "You do not have permission to manage this agent.", 403);
  }
  return role;
}

export async function getAgentProfileDetail(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}): Promise<AiAgentProfileDetail | null> {
  const role = await getAgentProfileRole(input);
  if (!role) return null;
  const [profile] = await db.select().from(aiAgentProfile).where(and(
    eq(aiAgentProfile.id, input.profileId),
    eq(aiAgentProfile.workspaceId, input.workspaceId),
  )).limit(1);
  if (!profile) return null;
  const [access, connections] = await Promise.all([
    db.select().from(aiAgentProfileAccess).where(
      eq(aiAgentProfileAccess.profileId, input.profileId),
    ),
    db.select().from(aiMcpConnection).where(and(
      eq(aiMcpConnection.scopeType, "agent"),
      eq(aiMcpConnection.agentProfileId, input.profileId),
    )),
  ]);
  return {
    ...serializeProfileSummary(profile, role),
    instructions: profile.instructions,
    access: access.map((grant) => ({
      id: grant.id,
      principalId: grant.principalId,
      principalType: grant.principalType as "user" | "team",
      role: grant.role as "editor" | "user",
    })),
    connections: connections.map(serializeConnection),
  };
}

export async function transferAgentProfileOwnership(input: {
  newOwnerUserId: string;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "owner" });
  if (!(await isActiveMember(input.workspaceId, input.newOwnerUserId))) {
    throw new AgentProfileError("new_owner_not_member", "The new owner must be an active workspace member.", 409);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(aiAgentProfile).set({
      ownerUserId: input.newOwnerUserId,
      updatedAt: now,
      version: sql`${aiAgentProfile.version} + 1`,
    }).where(eq(aiAgentProfile.id, input.profileId));
    await tx.update(aiMcpConnection).set({
      lastErrorCode: "ownership_changed",
      state: "reconnect_required",
      updatedAt: now,
    }).where(eq(aiMcpConnection.agentProfileId, input.profileId));
  });
  return getAgentProfileDetail({ ...input, userId: input.newOwnerUserId });
}

export async function archiveAgentProfile(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "owner" });
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(aiAgentProfile).set({
      archivedAt: now,
      status: "archived",
      updatedAt: now,
      version: sql`${aiAgentProfile.version} + 1`,
    }).where(eq(aiAgentProfile.id, input.profileId));
    await tx.update(aiMcpConnection).set({
      disabledAt: now,
      state: "disabled",
      updatedAt: now,
    }).where(eq(aiMcpConnection.agentProfileId, input.profileId));
  });
  return { archived: true };
}

export async function duplicateAgentProfile(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  const [profile] = await db.select().from(aiAgentProfile).where(and(
    eq(aiAgentProfile.id, input.profileId),
    eq(aiAgentProfile.workspaceId, input.workspaceId),
  )).limit(1);
  if (!profile) throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
  return createAgentProfile({
    cover: profile.cover,
    defaultModel: profile.defaultModel,
    description: profile.description,
    icon: profile.icon,
    iconPosition: profile.iconPosition as "inline" | "top",
    instructions: profile.instructions,
    name: `${profile.name} copy`.slice(0, 120),
    ownerUserId: input.userId,
    workspaceId: input.workspaceId,
  });
}

function serializeProfileSummary(
  profile: typeof aiAgentProfile.$inferSelect,
  role: AiAgentProfileRole,
  lastVisitedAt: Date | null = null,
): AiAgentProfileSummary {
  return {
    cover: profile.cover,
    defaultModel: profile.defaultModel,
    description: profile.description,
    icon: profile.icon ?? null,
    iconPosition: profile.iconPosition === "top" ? "top" : "inline",
    id: profile.id,
    name: profile.name,
    ownerUserId: profile.ownerUserId,
    currentRevisionId: profile.currentRevisionId,
    executionDisabledReason: profile.executionDisabledReason,
    lastVisitedAt: lastVisitedAt?.toISOString() ?? null,
    role,
    status: profile.status as "active" | "archived",
    updatedAt: profile.updatedAt.toISOString(),
    version: profile.version,
  };
}

function serializeConnection(
  connection: typeof aiMcpConnection.$inferSelect,
): McpConnectionSummary {
  return {
    agentProfileId: connection.agentProfileId,
    scope: {
      type: "agent",
      agentProfileId: connection.agentProfileId!,
    },
    alwaysAllowEnabled: connection.alwaysAllowEnabled,
    authenticatedByUserId: connection.authenticatedByUserId,
    authMethod: connection.authMethod as "oauth" | "headers",
    catalogId: connection.catalogId,
    endpointUrl: connection.endpointUrl,
    id: connection.id,
    lastDiscoveredAt: connection.lastDiscoveredAt?.toISOString() ?? null,
    lastErrorCode: connection.lastErrorCode,
    serverLabel: connection.serverLabel,
    state: connection.state as McpConnectionSummary["state"],
  };
}

export async function validateAccessPrincipals(
  workspaceId: string,
  grants: Array<{ principalId: string; principalType: "user" | "team" }>,
) {
  for (const grant of grants) {
    const valid = grant.principalType === "user"
      ? await isActiveMember(workspaceId, grant.principalId)
      : Boolean((await db.select({ id: team.id }).from(team).where(and(
          eq(team.id, grant.principalId),
          eq(team.organizationId, workspaceId),
        )).limit(1))[0]);
    if (!valid) {
      throw new AgentProfileError(
        "invalid_access_principal",
        "Every shared user or team must belong to this workspace.",
        409,
      );
    }
  }
}

async function isActiveMember(workspaceId: string, userId: string) {
  return Boolean((await db.select({ id: member.id }).from(member).where(and(
    eq(member.organizationId, workspaceId),
    eq(member.userId, userId),
    activeMembershipCondition(),
  )).limit(1))[0]);
}
