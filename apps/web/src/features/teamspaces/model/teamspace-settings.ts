import type { Teamspace } from "@zilobase/features/teamspaces";
export type TeamspaceSettingsTab = "general" | "members" | "permissions" | "security";

export function isTeamspaceSettingsTab(value: unknown): value is TeamspaceSettingsTab {
  return (
    value === "general" || value === "members" || value === "permissions" || value === "security"
  );
}

export function getTeamspaceManagementPermissions(
  teamspace: Pick<Teamspace, "currentUserRole" | "isDefault" | "ownerIds">,
  workspaceManager: boolean,
) {
  return {
    canManage: workspaceManager || teamspace.currentUserRole === "owner",
    canSetDefault: workspaceManager && !teamspace.isDefault,
    canRecoverOwner: workspaceManager && teamspace.ownerIds?.length === 0,
  };
}
