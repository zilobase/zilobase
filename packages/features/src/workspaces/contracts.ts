export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
};

export type WorkspaceRole = "owner" | "admin" | "member" | "temporary";

export type InvitableWorkspaceRole = Exclude<WorkspaceRole, "owner">;

export type WorkspaceMember = {
  email: string;
  id: string;
  memberId: string;
  name: string;
  role: WorkspaceRole | string;
  accessExpiresAt?: string | null;
};

export type WorkspaceTeam = {
  id: string;
  name: string;
};

export type WorkspaceAccessTargetsPayload = {
  members: WorkspaceMember[];
  teams: WorkspaceTeam[];
};

export type WorkspaceInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole | string;
  status: string;
  inviterId: string;
  expiresAt: string;
  membershipExpiresAt?: string | null;
  createdAt: string;
  teamId?: string;
};

export type WorkspaceMemberMutationResponse = {
  member: {
    accessExpiresAt?: string | null;
    createdAt: string;
    id: string;
    role: WorkspaceRole | string;
    userId: string;
    workspaceId?: string;
  };
};

export type WorkspaceGuest = {
  createdAt: string;
  email: string;
  name: string;
  pages: Array<{
    accessLevel: "view" | "comment" | "edit" | "full";
    id: string;
    name: string;
  }>;
  userId: string;
};

export type GuestInviteMode = "direct" | "request" | "owners_only";

export type WorkspaceGuestPolicy = {
  canApprove: boolean;
  mode: GuestInviteMode;
};

export type WorkspaceGuestRequest = {
  accessLevel: "view" | "comment" | "edit" | "full";
  createdAt: string;
  email: string;
  id: string;
  pageId: string;
  pageName: string;
  requesterEmail: string;
  requesterId: string;
  requesterName: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  workspaceId: string;
};

export type AcceptWorkspaceInvitationResponse = {
  invitation: WorkspaceInvitation;
  member: {
    id: string;
    workspaceId: string;
    userId: string;
    role: string;
    createdAt: string;
  };
};
