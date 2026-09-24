export type TeamspaceAccessMode = "open" | "closed" | "private";

export type TeamspaceRole = "owner" | "member";

export type Teamspace = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  icon: unknown;
  accessMode: TeamspaceAccessMode;
  memberAccessLevel: "view" | "comment" | "edit" | "full";
  invitePolicy: "owners" | "owners_and_members";
  sidebarEditPolicy: "owners" | "owners_and_members";
  isDefault: boolean;
  exportEnabled: boolean;
  guestsEnabled: boolean;
  publicSharingEnabled: boolean;
  inviteLinkEnabled: boolean;
  archivedAt: string | null;
  currentUserRole: TeamspaceRole | null;
  memberCount?: number;
  ownerIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type TeamspacePrincipal = {
  id: string;
  principalId: string;
  principalType: "user" | "team";
  role: TeamspaceRole;
  membershipSource: string;
  accessLevelOverride: "view" | "comment" | "edit" | "full" | null;
  name: string | null;
  email: string | null;
  createdAt: string;
};

export type TeamspaceWorkspaceSettings = {
  canManage: boolean;
  creationPolicy: "workspace_owners" | "workspace_members";
};
