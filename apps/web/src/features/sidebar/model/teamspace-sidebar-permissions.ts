import type { Teamspace } from "@zilobase/features/teamspaces"

type SidebarTeamspace = Pick<
  Teamspace,
  "currentUserRole" | "invitePolicy" | "isDefault"
>

export function getTeamspaceSidebarPermissions(
  teamspace: SidebarTeamspace,
  workspaceCanManage: boolean,
) {
  const canManage =
    workspaceCanManage || teamspace.currentUserRole === "owner"
  const canInvite =
    teamspace.currentUserRole === "owner" ||
    (teamspace.currentUserRole === "member" &&
      teamspace.invitePolicy === "owners_and_members")

  return {
    canArchive: canManage && !teamspace.isDefault,
    canInvite,
    canLeave: Boolean(teamspace.currentUserRole && !teamspace.isDefault),
    canManage,
  }
}
