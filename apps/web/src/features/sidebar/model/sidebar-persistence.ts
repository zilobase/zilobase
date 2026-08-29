import type {
  LegacySidebarConfig,
  SidebarConfig,
  SidebarSection,
} from "@zilobase/features/user-settings";
import { resolveSidebarWorkspaceLayout } from "@zilobase/features/user-settings";

export function createSectionPresentationConfig(
  config: SidebarConfig,
  layout: ReturnType<typeof resolveSidebarWorkspaceLayout>,
  section: Exclude<SidebarSection, { kind: "databaseView" }>,
): LegacySidebarConfig {
  const sectionId =
    section.kind === "favorites"
      ? "favorites"
      : section.kind === "shared" || section.kind === "teamspaces"
        ? "shared"
        : section.kind === "private"
          ? "private"
          : "recents";

  return {
    hiddenItems: [],
    libraryView: config.libraryView,
    sectionLimits: {
      favorites: 10,
      private: 10,
      recents: 10,
      shared: 10,
      [sectionId]: section.limit,
    },
    sectionOrder: [sectionId],
    sectionSorts: {
      favorites: "lastEdited",
      private: "lastEdited",
      recents: "lastEdited",
      shared: "lastEdited",
      [sectionId]: section.sort,
    },
    taskDatabaseIds: layout.taskDatabaseIds,
  };
}

export function readActiveSidebarTab(workspaceId: string | null) {
  try {
    return (
      window.localStorage.getItem(activeTabStorageKey(workspaceId)) ?? "home"
    );
  } catch {
    return "home";
  }
}

export function writeActiveSidebarTab(
  workspaceId: string | null,
  tabId: string,
) {
  try {
    window.localStorage.setItem(activeTabStorageKey(workspaceId), tabId);
  } catch {
    // Selection still works for this session.
  }
}

function activeTabStorageKey(workspaceId: string | null) {
  return `zilobase:sidebar-active-tab:v2:${workspaceId ?? "default"}`;
}
