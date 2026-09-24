import { and, eq } from "drizzle-orm";

import { aiMcpConnection } from "../../../infrastructure/database/schema";
import { getMembership } from "../../access";
import { AgentProfileError, requireAgentProfileRole } from "../agents/agent-profile-service";

export type SettingsActor = {
  scope: string;
  userId: string;
  workspaceId: string;
};

export const settingsScopeKey = (a: SettingsActor) =>
  a.scope === "personal" ? `personal:${a.userId}` : `agent:${a.scope}`;

export async function authorizeSettings(a: SettingsActor, edit = false) {
  if (!(await getMembership(a.workspaceId, a.userId)))
    throw new AgentProfileError("forbidden", "Workspace access required.", 403);
  if (a.scope !== "personal")
    return requireAgentProfileRole({
      ...a,
      profileId: a.scope,
      minimum: edit ? "editor" : "user",
    });
  return "owner" as const;
}

export function settingsConnectionCondition(a: SettingsActor) {
  return and(
    eq(aiMcpConnection.workspaceId, a.workspaceId),
    a.scope === "personal"
      ? and(eq(aiMcpConnection.scopeType, "personal"), eq(aiMcpConnection.scopeUserId, a.userId))
      : and(eq(aiMcpConnection.scopeType, "agent"), eq(aiMcpConnection.agentProfileId, a.scope)),
  );
}
