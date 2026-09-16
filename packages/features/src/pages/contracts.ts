import type { PageMetadata } from "./item-relationships";

export type ZilobaseAiMode = "instruction" | "skill";

export type PageDatabaseView = {
  id: string;
  databaseId: string;
  dataSourceId: string;
  position: number;
  name: string;
  type: string;
  config?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PageDatabase = {
  id: string;
  workspaceId: string;
  pageId: string | null;
  teamspaceId?: string | null;
  createdById?: string | null;
  name: string;
  config?: unknown;
  dataSourceConfig?: unknown;
  createdBy?: PageCreator | null;
  deletedBy?: PageCreator | null;
  isFavorite?: boolean;
  lastVisitedAt?: string | null;
  views: PageDatabaseView[];
  deletedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageItemPlacement = {
  id: string;
  workspaceId: string;
  parentKind: "page" | "database";
  parentId: string;
  itemKind: "page" | "database";
  itemId: string;
  placementKind: "primary" | "linked" | "database_row";
  sourceRowId?: string | null;
  position: number;
};

export type Page = {
  id: string;
  createdBy?: PageCreator | null;
  deletedBy?: PageCreator | null;
  publishedOwnerPreferences?: {
    pageFullWidth: boolean;
  } | null;
  isFavorite?: boolean;
  isShared?: boolean;
  teamspaceId?: string | null;
  lastVisitedAt?: string | null;
  workspaceId: string;
  createdById?: string | null;
  type: string;
  name: string;
  parentPageId?: string | null;
  url: string;
  content?: unknown;
  hasContent?: boolean;
  metadata?: PageMetadata | null;
  deletedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageNavigationPayload = {
  databases: PageDatabase[];
  pages: Page[];
  placements: PageItemPlacement[];
};

export type PageCreator = {
  email: string;
  id: string;
  image?: string | null;
  name: string;
};

export type ZilobaseAiPageSummary = {
  id: string;
  name: string;
  workspaceId: string;
  updatedAt: string;
  url: string;
  metadata: {
    emoji?: string | null;
    zilobaseai: ZilobaseAiMode | null;
  };
};

export type PageProperty = {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  config?: unknown;
  deletedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PagePropertyValue = {
  id: string;
  pageId: string;
  propertyId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PagePropertiesPayload = {
  presenceTargets?: PagePropertyPresenceTarget[];
  properties: PageProperty[];
  sourceIds?: string[];
  sourceVersions?: Record<string, number>;
  values: PagePropertyValue[];
};

export type PagePropertyPresenceTarget = {
  propertyIds: string[];
  rowId: string;
  sourceId: string;
};

export type AccessLevel = "view" | "comment" | "edit" | "full";

export type AccessTargetType = "public" | "user" | "team" | "agent";

export type PageAccessRule = {
  id: string;
  workspaceId: string;
  pageId: string;
  targetType: AccessTargetType;
  targetId: string;
  accessLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
};

export type PageAccessPayload = {
  access: PageAccessRule[];
};

export type PageAccessTargetMember = {
  email: string;
  id: string;
  memberId: string;
  name: string;
  role: string;
};

export type PageAccessTargetTeam = {
  id: string;
  name: string;
};

export type PageAccessTargetsPayload = {
  members: PageAccessTargetMember[];
  teams: PageAccessTargetTeam[];
};

export type PagePersonAccessTargetsPayload = {
  guests: PageAccessTargetGuest[];
  members: PageAccessTargetMember[];
};

export type PageAccessTargetGuest = {
  email: string;
  guestId: string;
  id: string;
  name: string;
};

export type PageGuestInvitation = {
  accessLevel: AccessLevel;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  inviterId?: string | null;
  pageId: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
  updatedAt: string;
  workspaceId: string;
};

export type PageGuestInvitationDetail = Pick<
  PageGuestInvitation,
  "accessLevel" | "email" | "expiresAt" | "id" | "pageId" | "status" | "workspaceId"
> & {
  pageName: string;
  workspaceName: string;
};

export type PageGuestRequest = {
  accessLevel: AccessLevel;
  createdAt: string;
  email: string;
  id: string;
  pageId: string;
  requesterEmail: string;
  requesterId: string;
  requesterName: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  workspaceId: string;
};

export type PagesDeletedFilter = "active" | "only";

export type PageDetail = {
  accessLevel?: AccessLevel | null;
  databaseIds?: string[];
  page: Page;
  viewerType?: "member" | "guest" | "public" | null;
};
