import type { ZilobaseAiMode } from "@zilobase/features/pages";

export type SidebarNavItem<Icon = unknown> = {
  databaseId?: string | null;
  databaseViewId?: string | null;
  emoji: Icon | null;
  id: string;
  isDatabase?: boolean;
  isDatabaseView?: boolean;
  isFavorite?: boolean;
  isLinked?: boolean;
  isMeeting?: boolean;
  isShared: boolean;
  lastVisitedAt?: string | null;
  meetingId?: string | null;
  name: string;
  navNodeId?: string;
  pageId: string | null;
  pages: SidebarNavItem<Icon>[];
  teamspaceId?: string | null;
  updatedAt?: string;
  zilobaseai?: ZilobaseAiMode | null;
};
