import type { CustomAgentResourceAccess } from "@zilobase/features/ai-chat/custom-agent-contract";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  database,
  databaseAccess,
  member,
  page,
  pageAccess,
} from "../../../infrastructure/database/schema";
import { canAccessDatabaseInWorkspace, canAccessPageInWorkspace } from "../../access";
import { activeMembershipCondition } from "../../memberships";
import {
  AgentProfileError,
  getAgentProfileRole,
  requireAgentProfileRole,
} from "./agent-profile-service";

type ResourceType = "page" | "database";
type AgentAccess = "view" | "comment" | "edit";

export async function listAgentResources(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}): Promise<CustomAgentResourceAccess[]> {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  return listAgentResourcesForExecution(input);
}

/** Internal execution lookup. Authorization is established by the run and this
 * query deliberately reads only ACL rows owned by the agent principal. */
export async function listAgentResourcesForExecution(input: {
  profileId: string;
  workspaceId: string;
}): Promise<CustomAgentResourceAccess[]> {
  const [pageRows, databaseRows] = await Promise.all([
    db
      .select({
        accessLevel: pageAccess.accessLevel,
        icon: page.metadata,
        name: page.name,
        resourceId: page.id,
      })
      .from(pageAccess)
      .innerJoin(page, eq(page.id, pageAccess.pageId))
      .where(
        and(
          eq(pageAccess.workspaceId, input.workspaceId),
          eq(pageAccess.targetType, "agent"),
          eq(pageAccess.targetId, input.profileId),
          isNull(page.deletedAt),
        ),
      ),
    db
      .select({
        accessLevel: databaseAccess.accessLevel,
        icon: database.config,
        name: database.name,
        resourceId: database.id,
      })
      .from(databaseAccess)
      .innerJoin(database, eq(database.id, databaseAccess.databaseId))
      .where(
        and(
          eq(databaseAccess.workspaceId, input.workspaceId),
          eq(databaseAccess.targetType, "agent"),
          eq(databaseAccess.targetId, input.profileId),
          isNull(database.deletedAt),
        ),
      ),
  ]);
  const editorUserIds = await listActiveAgentEditorUserIds(input);
  return Promise.all([
    ...pageRows.map((row) => serializeResource("page", row, editorUserIds, input.workspaceId)),
    ...databaseRows.map((row) =>
      serializeResource("database", row, editorUserIds, input.workspaceId),
    ),
  ]);
}

export async function grantAgentResource(input: {
  accessLevel: AgentAccess;
  profileId: string;
  resourceId: string;
  resourceType: ResourceType;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const required = input.accessLevel === "view" ? "view" : "full";
  const allowed =
    input.resourceType === "page"
      ? await canAccessPageInWorkspace(input.resourceId, input.workspaceId, input.userId, required)
      : await canAccessDatabaseInWorkspace(
          input.resourceId,
          input.workspaceId,
          input.userId,
          required,
        );
  if (!allowed) {
    throw new AgentProfileError(
      "agent_resource_grant_forbidden",
      input.accessLevel === "view"
        ? "You must be able to view this resource before granting it to the agent."
        : "Full human access is required before granting comment or edit access to an agent.",
      403,
    );
  }
  const now = new Date();
  const values =
    input.resourceType === "page"
      ? {
          accessLevel: input.accessLevel,
          createdAt: now,
          id: crypto.randomUUID(),
          pageId: input.resourceId,
          targetId: input.profileId,
          targetType: "agent",
          updatedAt: now,
          workspaceId: input.workspaceId,
        }
      : {
          accessLevel: input.accessLevel,
          createdAt: now,
          databaseId: input.resourceId,
          id: crypto.randomUUID(),
          targetId: input.profileId,
          targetType: "agent",
          updatedAt: now,
          workspaceId: input.workspaceId,
        };

  if (input.resourceType === "page") {
    await db
      .insert(pageAccess)
      .values(values as typeof pageAccess.$inferInsert)
      .onConflictDoUpdate({
        set: { accessLevel: input.accessLevel, updatedAt: now },
        target: [pageAccess.pageId, pageAccess.targetType, pageAccess.targetId],
      });
  } else {
    await db
      .insert(databaseAccess)
      .values(values as typeof databaseAccess.$inferInsert)
      .onConflictDoUpdate({
        set: { accessLevel: input.accessLevel, updatedAt: now },
        target: [databaseAccess.databaseId, databaseAccess.targetType, databaseAccess.targetId],
      });
  }
  return listAgentResources(input);
}

export async function removeAgentResource(input: {
  profileId: string;
  resourceId: string;
  resourceType: ResourceType;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  if (input.resourceType === "page") {
    await db
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, input.workspaceId),
          eq(pageAccess.pageId, input.resourceId),
          eq(pageAccess.targetType, "agent"),
          eq(pageAccess.targetId, input.profileId),
        ),
      );
  } else {
    await db
      .delete(databaseAccess)
      .where(
        and(
          eq(databaseAccess.workspaceId, input.workspaceId),
          eq(databaseAccess.databaseId, input.resourceId),
          eq(databaseAccess.targetType, "agent"),
          eq(databaseAccess.targetId, input.profileId),
        ),
      );
  }
  return listAgentResources(input);
}

async function listActiveAgentEditorUserIds(input: { profileId: string; workspaceId: string }) {
  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, input.workspaceId), activeMembershipCondition()));
  const roles = await Promise.all(
    members.map(async ({ userId }) => ({
      role: await getAgentProfileRole({ ...input, userId }),
      userId,
    })),
  );
  return roles
    .filter(({ role }) => role === "owner" || role === "editor")
    .map(({ userId }) => userId);
}

async function serializeResource(
  resourceType: ResourceType,
  row: { accessLevel: string; icon: unknown; name: string; resourceId: string },
  editorUserIds: string[],
  workspaceId: string,
): Promise<CustomAgentResourceAccess> {
  const required = row.accessLevel === "view" ? "view" : "full";
  const eligible = await Promise.all(
    editorUserIds.map((userId) =>
      resourceType === "page"
        ? canAccessPageInWorkspace(row.resourceId, workspaceId, userId, required)
        : canAccessDatabaseInWorkspace(row.resourceId, workspaceId, userId, required),
    ),
  );
  return {
    accessLevel:
      row.accessLevel === "comment" || row.accessLevel === "edit" ? row.accessLevel : "view",
    eligibleEditorCount: eligible.filter(Boolean).length,
    icon: row.icon,
    inherited: false,
    name: row.name,
    resourceId: row.resourceId,
    resourceType,
  };
}
