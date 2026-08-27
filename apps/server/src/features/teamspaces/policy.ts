import type { AccessLevel } from "../../access";

const TEAMSPACE_ACCESS_MODES = ["open", "closed", "private"] as const;
const TEAMSPACE_ROLES = ["owner", "member"] as const;
const TEAMSPACE_INVITE_POLICIES = [
  "owners",
  "owners_and_members",
] as const;
const TEAMSPACE_CREATION_POLICIES = [
  "workspace_owners",
  "workspace_members",
] as const;

export type TeamspaceAccessMode = (typeof TEAMSPACE_ACCESS_MODES)[number];
export type TeamspaceRole = (typeof TEAMSPACE_ROLES)[number];
export type TeamspaceInvitePolicy =
  (typeof TEAMSPACE_INVITE_POLICIES)[number];
export type TeamspaceCreationPolicy =
  (typeof TEAMSPACE_CREATION_POLICIES)[number];

export function canCreateTeamspace(input: {
  creationPolicy: TeamspaceCreationPolicy;
  isActiveWorkspaceMember: boolean;
  workspaceRole: string | null | undefined;
}) {
  if (!input.isActiveWorkspaceMember) return false;
  if (input.workspaceRole === "owner") return true;
  return input.creationPolicy === "workspace_members";
}

export function canDiscoverTeamspace(input: {
  accessMode: TeamspaceAccessMode;
  isTeamspacePrincipal: boolean;
  isWorkspaceOwner: boolean;
}) {
  return (
    input.isWorkspaceOwner ||
    input.isTeamspacePrincipal ||
    input.accessMode !== "private"
  );
}

export function canJoinTeamspace(input: {
  accessMode: TeamspaceAccessMode;
  archived: boolean;
  isActiveWorkspaceMember: boolean;
}) {
  return (
    input.accessMode === "open" &&
    !input.archived &&
    input.isActiveWorkspaceMember
  );
}

export function canManageTeamspace(input: {
  isWorkspaceOwner: boolean;
  teamspaceRole: TeamspaceRole | null;
}) {
  return input.isWorkspaceOwner || input.teamspaceRole === "owner";
}

export function canInviteTeamspaceMembers(input: {
  invitePolicy: TeamspaceInvitePolicy;
  teamspaceRole: TeamspaceRole | null;
}) {
  if (input.teamspaceRole === "owner") return true;
  return (
    input.teamspaceRole === "member" &&
    input.invitePolicy === "owners_and_members"
  );
}

export function resolveTeamspaceBaselineAccess(input: {
  accessLevelOverride?: Exclude<AccessLevel, "none"> | null;
  memberAccessLevel: Exclude<AccessLevel, "none">;
  teamspaceRole: TeamspaceRole | null;
}): AccessLevel {
  if (input.teamspaceRole === "owner") return "full";
  if (input.teamspaceRole !== "member") return "none";
  return input.accessLevelOverride ?? input.memberAccessLevel;
}
