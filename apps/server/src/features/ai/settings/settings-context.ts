import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  page,
  database,
  member,
  user,
  team,
  aiMcpConnection,
  aiMcpToolSnapshot,
} from "../../../infrastructure/database/schema";
import { canAccessPageInWorkspace, canAccessDatabaseInWorkspace } from "../../access";
import { authorizeSettings, type SettingsActor } from "./settings-access";
import { MCP_SERVER_CATALOG } from "../mcp/connections/catalog";
import { activeMembershipCondition } from "../../memberships";

/** Names and identifiers only; instruction editing never implicitly reads resource content. */
export async function settingsEditContext(a: SettingsActor) {
  await authorizeSettings(a, true);
  const [pages, databases, members, teams, connections] = await Promise.all([
    db
      .select({ id: page.id, name: page.name })
      .from(page)
      .where(and(eq(page.workspaceId, a.workspaceId), isNull(page.deletedAt)))
      .limit(100),
    db
      .select({ id: database.id, name: database.name })
      .from(database)
      .where(and(eq(database.workspaceId, a.workspaceId), isNull(database.deletedAt)))
      .limit(100),
    a.scope === "personal"
      ? []
      : db
          .select({ id: user.id, name: user.name })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(and(eq(member.organizationId, a.workspaceId), activeMembershipCondition()))
          .limit(100),
    a.scope === "personal"
      ? []
      : db
          .select({ id: team.id, name: team.name })
          .from(team)
          .where(eq(team.organizationId, a.workspaceId))
          .limit(100),
    db
      .select()
      .from(aiMcpConnection)
      .where(
        and(
          eq(aiMcpConnection.workspaceId, a.workspaceId),
          a.scope === "personal"
            ? and(
                eq(aiMcpConnection.scopeType, "personal"),
                eq(aiMcpConnection.scopeUserId, a.userId),
              )
            : and(
                eq(aiMcpConnection.scopeType, "agent"),
                eq(aiMcpConnection.agentProfileId, a.scope),
              ),
        ),
      ),
  ]);
  const resources = (
    await Promise.all([
      ...pages.map(async (p) =>
        (await canAccessPageInWorkspace(p.id, a.workspaceId, a.userId, "view"))
          ? { resourceType: "page", resourceId: p.id, name: p.name }
          : null,
      ),
      ...databases.map(async (d) =>
        (await canAccessDatabaseInWorkspace(d.id, a.workspaceId, a.userId, "view"))
          ? { resourceType: "database", resourceId: d.id, name: d.name }
          : null,
      ),
    ])
  ).filter(Boolean);
  return {
    resources,
    members,
    teams,
    catalog: MCP_SERVER_CATALOG.map(({ id, label, available }) => ({
      id,
      label,
      available,
    })),
    connectors: await Promise.all(
      connections.map(async (c) => ({
        connectionId: c.id,
        name: c.serverLabel,
        state: c.state,
        tools: await db
          .select({
            toolId: aiMcpToolSnapshot.id,
            name: aiMcpToolSnapshot.externalName,
            classification: aiMcpToolSnapshot.classification,
            enabled: aiMcpToolSnapshot.enabled,
            executionMode: aiMcpToolSnapshot.executionMode,
          })
          .from(aiMcpToolSnapshot)
          .where(
            and(eq(aiMcpToolSnapshot.connectionId, c.id), eq(aiMcpToolSnapshot.available, true)),
          ),
      })),
    ),
  };
}
