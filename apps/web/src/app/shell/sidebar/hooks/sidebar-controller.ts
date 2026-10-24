import {
  getActivePageId,
  getActiveDatabaseId,
  getActiveMeetingId,
  getActiveDatabaseViewId,
} from "@/app/routing/route-identifiers";
import type { MeetingListItem } from "@zilobase/features/meetings";
import { Effect } from "effect";
import * as React from "react";
import { type DragEvent, type ComponentProps } from "react";
import {
  type SidebarSection,
  type SidebarSectionKind,
  type SidebarSectionLimit,
  moveArrayItem,
  moveLayoutEntry,
  updateSidebarTab,
  type SidebarShortcut,
  defaultUserSettings,
  isStaticSidebarTabId,
  normalizeSidebarConfig,
  resolveSidebarWorkspaceLayout,
  withSidebarWorkspaceLayout,
  hideUnconfiguredIntegrationTabs,
  restoreUnconfiguredIntegrationTabs,
} from "@zilobase/features/user-settings";
import { libraryViewLabels } from "@/components/navigation/lib/library-views";
import { type DragEndEvent } from "@dnd-kit/core";
import { isDesktopApp } from "@/platform/environment";
import { useLocation, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAppSearch } from "@/app/shell/search/components/app-search";
import { getDatabaseViewModel } from "@/sections/databases/views/shared/components/database-view-model";
import { DATABASE_PAGE_DRAG_MIME } from "@/sections/databases/interactions/lib/database-drag-contracts";
import {
  buildSidebarNavigation,
  type SidebarNavigationIcons,
  getConfiguredSidebarItems,
  type SidebarNavItem as NavigationItem,
  type Page,
  type PageDatabase,
  type PageDatabaseView,
} from "@zilobase/features/pages";
import {
  discoverRuntimeDesktopServer,
  getSelectedDesktopServer,
  type DesktopServer,
  listDesktopServerProfiles,
  updateDesktopServerProfileSnapshot,
  type DesktopServerProfile,
} from "@/platform/server/desktop-server";
import { useSession } from "@zilobase/features/auth/react";
import {
  useAddDatabaseRow,
  useCreateDatabase,
  useSetDatabaseFavorite,
  useDatabaseMetadata,
  useDatabaseRecords,
} from "@zilobase/features/databases/react";
import { useWorkspaceMeetings } from "@zilobase/features/meetings/react";
import {
  useCreatePage,
  usePageNavigation,
  useSetPageFavorite,
} from "@zilobase/features/pages/react";
import { useTeamspaces, useTeamspaceSettings } from "@zilobase/features/teamspaces/react";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";
import {
  useActiveWorkspaceId,
  useCreateWorkspace,
  useWorkspaces,
  useSetActiveWorkspace,
} from "@zilobase/features/workspaces/react";
import { useIntegrationAvailability } from "@zilobase/features/calendar/react";
import { useChatSelection, useChatThreads } from "@zilobase/features/ai/react";
import { useSidebar } from "@/components/ui/sidebar";
import { isFeatureEnabled } from "@/platform/environment";
import { composeDatabaseViewData } from "@zilobase/features/databases";
import { useTaskDatabases } from "@zilobase/features/tasks/react";
import { buildTaskRows, filterMyTaskRows, getTaskDatabaseSchema } from "@zilobase/features/tasks";
import { type Teamspace } from "@zilobase/features/teamspaces";
import { prefetchPageForNavigation } from "@/sections/pages/editor/collaboration/lib/page-prefetch";
import { markPageNavigationStart } from "@/sections/pages/navigation/lib/page-navigation-timing";

export function getSidebarDatabaseViewSearchId({
  databaseId,
  databaseViewId,
  defaultDatabaseViewId,
  isDatabaseView,
}: {
  databaseId: string | null | undefined;
  databaseViewId: string | null | undefined;
  defaultDatabaseViewId: string | undefined;
  isDatabaseView: boolean | undefined;
}) {
  if (!databaseId || !isDatabaseView || !databaseViewId) {
    return undefined;
  }

  return databaseViewId === defaultDatabaseViewId ? undefined : databaseViewId;
}

export function readActiveSidebarTab(workspaceId: string | null) {
  return Effect.runSync(
    Effect.try({
      try: () => {
        return window.localStorage.getItem(activeTabStorageKey(workspaceId)) ?? "home";
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return "home";
      }),
    ),
  );
}

export function writeActiveSidebarTab(workspaceId: string | null, tabId: string) {
  Effect.runSync(
    Effect.try({
      try: () => {
        window.localStorage.setItem(activeTabStorageKey(workspaceId), tabId);
      },
      catch: (error) => error,
    }).pipe(Effect.ignore),
  );
}

function activeTabStorageKey(workspaceId: string | null) {
  return `zilobase:sidebar-active-tab:${workspaceId ?? "default"}`;
}

export function useSidebarSectionOpen(storageKey: string) {
  const [open, setOpenState] = React.useState(() => readSidebarSectionOpen(storageKey));

  React.useEffect(() => {
    setOpenState(readSidebarSectionOpen(storageKey));
  }, [storageKey]);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setOpenState(nextOpen);
      Effect.runSync(
        Effect.try({
          try: () => {
            window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
          },
          catch: (error) => error,
        }).pipe(Effect.ignore),
      );
    },
    [storageKey],
  );

  return [open, setOpen] as const;
}

function readSidebarSectionOpen(storageKey: string) {
  return Effect.runSync(
    Effect.try({
      try: () => {
        return window.localStorage.getItem(storageKey) !== "closed";
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return true;
      }),
    ),
  );
}

const STORAGE_PREFIX = "zilobase:sidebar-tree:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function getSidebarExpansionStorageKey(
  workspaceId: string | null,
  section: "favorites" | "private" | "recents" | "team",
) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(workspaceId?.trim() || "default")}:${section}`;
}

export function readExpandedSidebarItems(key: string, storage: StorageLike | null = getStorage()) {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const value = storage?.getItem(key);
        const parsed = value ? JSON.parse(value) : null;
        const ids: unknown[] = Array.isArray(parsed)
          ? parsed
          : parsed?.version === 1
            ? parsed.expandedNodeIds
            : [];

        return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return [];
      }),
    ),
  );
}

export function writeExpandedSidebarItems(
  key: string,
  ids: Iterable<string>,
  storage: StorageLike | null = getStorage(),
) {
  Effect.runSync(
    Effect.try({
      try: () => {
        storage?.setItem(key, JSON.stringify([...ids].slice(0, 500)));
      },
      catch: (error) => error,
    }).pipe(Effect.ignore),
  );
}

export function setSidebarItemExpanded(ids: ReadonlySet<string>, id: string, expanded: boolean) {
  const next = new Set(ids);
  if (expanded) next.add(id);
  else next.delete(id);
  return next;
}

function getStorage(): StorageLike | null {
  return Effect.runSync(
    Effect.try({
      try: () => {
        return typeof window === "undefined" ? null : window.localStorage;
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return null;
      }),
    ),
  );
}

export const sidebarSectionLabels: Record<SidebarSectionKind, string> = {
  aiChats: "AI chats",
  databaseView: "Database view",
  favorites: "Favorites",
  meetings: "Meetings",
  private: "Private",
  recents: "Recents",
  shared: "Shared",
  teamspaces: "Teamspaces",
  tasks: "Tasks",
};

export function getShortcutLabel(shortcut: SidebarShortcut) {
  if (shortcut.label) return shortcut.label;
  const target = shortcut.target;
  if (target.type === "action") {
    return target.action === "createPage"
      ? "New page"
      : target.action === "createDatabase"
        ? "New database"
        : "New AI chat";
  }
  if (target.type === "route") {
    return {
      ai: "Ask AI",
      meetings: "Meetings",
      settings: "Settings",
      tasks: "Tasks",
      trash: "Trash",
    }[target.route];
  }
  if (target.type === "library") return libraryViewLabels[target.view];
  return target.type === "page" ? "Page" : "Database";
}

export function isShortcutActive(
  shortcut: SidebarShortcut,
  pathname: string,
  search: Record<string, unknown>,
  settingsOpen = false,
) {
  const target = shortcut.target;
  if (target.type === "action") return false;
  if (target.type === "library") {
    return pathname === "/recents" && search.view === target.view;
  }
  if (target.type === "page") return pathname === `/p/${target.pageId}`;
  if (target.type === "database") {
    return (
      pathname === `/d/${target.databaseId}` && (!target.viewId || search.view === target.viewId)
    );
  }
  if (target.route === "settings") return settingsOpen;
  if (target.route === "meetings") {
    return pathname === "/recents" && search.view === "meetings";
  }
  if (target.route === "trash") {
    return pathname === "/recents" && search.view === "trash";
  }
  return pathname === `/${target.route}`;
}

export function getSectionLabel(section: SidebarSection) {
  return section.label || sidebarSectionLabels[section.kind];
}

export type SidebarIcon =
  | { kind: "page"; page: Page }
  | { kind: "database"; database: PageDatabase }
  | { kind: "view"; view: PageDatabaseView }
  | { kind: "value"; value: string }
  | { kind: "meeting"; value?: string | null }
  | { kind: "task" }
  | { kind: "file" };

export type SidebarNavItem = NavigationItem<SidebarIcon> & { href?: "/tasks" };

export type SidebarSectionModel = {
  section: SidebarSection;
  id: string;
  label: string;
  storageKey: string;
  treeKey: string;
  items: SidebarNavItem[];
  teamspace?: Teamspace;
  create?: boolean;
  kind: SidebarSection["kind"];
};

export type SidebarActiveNavigation = {
  activePageId: string | null;
  activeDatabaseId: string | null;
  activeDatabaseViewId: string | null;
  activeMeetingId: string | null;
};

export type SidebarLinkProps = Partial<
  Omit<ComponentProps<typeof Link>, "params" | "title" | "to">
>;

const sidebarNavigationIcons: SidebarNavigationIcons<SidebarIcon> = {
  getPageIcon: (page) => ({ kind: "page", page }),
  getDatabaseIcon: (database) => ({ kind: "database", database }),
  getDatabaseViewIcon: (view) => ({ kind: "view", view }),
  getMeetingIcon: (meeting) => ({ kind: "meeting", value: meeting.emoji }),
};

export function useAppSidebar({
  onOpenSettings,
  settingsOpen = false,
}: {
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
}) {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const location = useLocation();
  const { openSearch } = useAppSearch();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const identity = `${session?.user?.id ?? "anonymous"}:${workspaceId ?? "default"}`;
  const sidebarScope = React.useRef<string | null>(identity);
  sidebarScope.current = identity;
  React.useEffect(() => {
    sidebarScope.current = identity;
    return () => {
      sidebarScope.current = null;
    };
  }, [identity]);

  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const [customizing, setCustomizing] = React.useState(false);
  const [databaseDropTargetId, setDatabaseDropTargetId] = React.useState<string | null>(null);
  const [desktopLinkServer, setDesktopLinkServer] = React.useState<DesktopServer | null>(
    getSelectedDesktopServer(),
  );

  React.useEffect(() => {
    if (desktopLinkServer || isDesktopApp()) return;
    let disposed = false;
    void Effect.runPromise(
      Effect.tryPromise({
        try: () => discoverRuntimeDesktopServer(),
        catch: (error) => error,
      }).pipe(
        Effect.tap((server) =>
          Effect.sync(() => {
            if (!disposed) setDesktopLinkServer(server);
          }),
        ),
        Effect.ignoreCause,
      ),
    );
    return () => {
      disposed = true;
    };
  }, [desktopLinkServer]);

  const sidebarConfig = React.useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig],
  );
  const storedLayout = React.useMemo(
    () => resolveSidebarWorkspaceLayout(sidebarConfig, workspaceId),
    [sidebarConfig, workspaceId],
  );
  const integrations = useIntegrationAvailability(workspaceId);
  const sidebarAvailability = React.useMemo(
    () => ({ askAi: isFeatureEnabled("askAi"), calendar: integrations.calendar }),
    [integrations.calendar],
  );
  const layout = React.useMemo(
    () => hideUnconfiguredIntegrationTabs(storedLayout, sidebarAvailability),
    [sidebarAvailability, storedLayout],
  );
  const [activeTabId, setActiveTabId] = React.useState("home");
  React.useEffect(() => {
    const stored = readActiveSidebarTab(workspaceId);
    const next =
      layout.tabs.some((tab) => tab.id === stored) && !isStaticSidebarTabId(stored)
        ? stored
        : "home";
    setActiveTabId(next);
  }, [layout.tabs, workspaceId]);
  const selectTab = React.useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      if (!isStaticSidebarTabId(tabId)) writeActiveSidebarTab(workspaceId, tabId);
    },
    [workspaceId],
  );
  const selectNavigationTab = React.useCallback(
    (tabId: string) => {
      selectTab(tabId);
      if (tabId === "calendar") {
        void navigate({ to: "/calendar" });
      } else if (tabId === "ai") {
        void navigate({ to: "/ai" });
      } else if (pathname === "/ai" || pathname === "/calendar") {
        void navigate({ search: { view: "recents" }, to: "/recents" });
      }
    },
    [navigate, pathname, selectTab],
  );
  React.useEffect(() => {
    if (customizing) return;
    const staticTabId = pathname === "/ai" ? "ai" : pathname === "/calendar" ? "calendar" : null;
    if (staticTabId && layout.tabs.some((tab) => tab.id === staticTabId)) {
      setActiveTabId(staticTabId);
      return;
    }
    if (integrations.settled && pathname === "/calendar" && !integrations.calendar) {
      void navigate({ search: { view: "recents" }, to: "/recents" });
    }
    if (!staticTabId && isStaticSidebarTabId(activeTabId)) {
      const stored = readActiveSidebarTab(workspaceId);
      const next =
        layout.tabs.some((tab) => tab.id === stored) && !isStaticSidebarTabId(stored)
          ? stored
          : "home";
      setActiveTabId(next);
    }
  }, [
    activeTabId,
    customizing,
    integrations.calendar,
    integrations.settled,
    layout.tabs,
    navigate,
    pathname,
    workspaceId,
  ]);
  const activeTab = layout.tabs.find((tab) => tab.id === activeTabId) ?? layout.tabs[0]!;
  const chatSelection = useChatSelection(workspaceId ?? "");
  const chatThreads = useChatThreads(
    sidebarAvailability.askAi && activeTab.id === "ai" ? (workspaceId ?? "") : "",
    null,
    false,
  );
  const needsMeetings = activeTab.sections.some((section) => section.kind === "meetings");
  const navigationQuery = usePageNavigation(workspaceId);
  const { data: navigation } = navigationQuery;
  const { data: teamspaces = [] } = useTeamspaces(workspaceId);
  const { data: teamspaceSettings } = useTeamspaceSettings(workspaceId);
  const { data: meetingsPayload } = useWorkspaceMeetings(needsMeetings ? workspaceId : null);
  const { isPending: isCreatingPage, mutateAsync: createPage } = useCreatePage();
  const { isPending: isCreatingDatabase, mutateAsync: createDatabase } = useCreateDatabase();
  const { isPending: isSettingPageFavorite, mutate: setPageFavorite } = useSetPageFavorite();
  const { isPending: isAddingDatabaseRow, mutate: addDatabaseRow } = useAddDatabaseRow();
  const { isPending: isSettingDatabaseFavorite, mutate: setDatabaseFavorite } =
    useSetDatabaseFavorite();
  const {
    favorites,
    recents,
    sections: pageSections,
  } = React.useMemo(
    () =>
      buildSidebarNavigation(
        navigation?.pages ?? [],
        navigation?.databases ?? [],
        navigation?.placements ?? [],
        sidebarNavigationIcons,
      ),
    [navigation],
  );

  const handleCreatePage = React.useCallback(
    (teamspaceId?: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const scope = sidebarScope.current;
          if (!workspaceId || isCreatingPage) return;
          const page = yield* Effect.tryPromise({
            try: () => createPage({ teamspaceId, workspaceId }),
            catch: (error) => error,
          });
          if (sidebarScope.current !== scope) return;
          yield* Effect.tryPromise({
            try: () => navigate({ params: { pageId: page.id }, to: "/p/$pageId" }),
            catch: (error) => error,
          });
        }),
      ),
    [createPage, isCreatingPage, navigate, workspaceId],
  );
  const handleCreateDatabase = React.useCallback(
    (teamspaceId?: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const scope = sidebarScope.current;
          if (!workspaceId || isCreatingDatabase) return;
          const payload = yield* Effect.tryPromise({
            try: () => createDatabase({ standalone: true, teamspaceId, workspaceId }),
            catch: (error) => error,
          });
          if (sidebarScope.current !== scope) return;
          yield* Effect.tryPromise({
            try: () =>
              navigate({
                params: { databaseId: payload.database.id },
                search: { view: undefined },
                to: "/d/$databaseId",
              }),
            catch: (error) => error,
          });
        }),
      ),
    [createDatabase, isCreatingDatabase, navigate, workspaceId],
  );
  const handleCreateChat = React.useCallback(
    () =>
      Effect.runPromise(
        Effect.sync(() => {
          chatSelection.select(null);
          setOpenMobile(false);
        }).pipe(
          Effect.flatMap(() =>
            Effect.tryPromise({
              try: () => navigate({ to: "/ai", search: { thread: undefined } }),
              catch: (error) => error,
            }),
          ),
        ),
      ),
    [navigate, chatSelection, setOpenMobile],
  );
  const handleOpenChat = (id: string) =>
    Effect.runPromise(
      Effect.sync(() => {
        if (chatSelection.id !== id) chatSelection.select(id);
        setOpenMobile(false);
      }).pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () => navigate({ to: "/ai", search: { thread: id } }),
            catch: (error) => error,
          }),
        ),
      ),
    );
  const handleDropPageOnDatabase = React.useCallback(
    (input: {
      databaseId: string;
      pageId: string;
      targetPageId: string | null;
      title?: string;
    }) => {
      if (input.targetPageId && input.pageId === input.targetPageId) {
        toast.error("You can't nest a page inside itself.");
        return;
      }
      if (!isAddingDatabaseRow)
        addDatabaseRow(input, { onError: showMutationError("Could not move page.") });
    },
    [addDatabaseRow, isAddingDatabaseRow],
  );
  const handleRemoveFavorite = React.useCallback(
    (pageId: string) => {
      if (!isSettingPageFavorite)
        setPageFavorite(
          { isFavorite: false, pageId },
          { onError: showMutationError("Could not update favorite.") },
        );
    },
    [isSettingPageFavorite, setPageFavorite],
  );
  const handleRemoveDatabaseFavorite = React.useCallback(
    (databaseId: string) => {
      if (!isSettingDatabaseFavorite)
        setDatabaseFavorite(
          { databaseId, isFavorite: false },
          { onError: showMutationError("Could not update favorite.") },
        );
    },
    [isSettingDatabaseFavorite, setDatabaseFavorite],
  );
  const saveLayout = React.useCallback(
    (nextLayout: typeof layout) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const scope = sidebarScope.current;
          if (!workspaceId) return;
          yield* Effect.tryPromise({
            try: () =>
              updateUserSettings.mutateAsync({
                sidebarConfig: withSidebarWorkspaceLayout(
                  sidebarConfig,
                  workspaceId,
                  restoreUnconfiguredIntegrationTabs(storedLayout, nextLayout, sidebarAvailability),
                ),
              }),
            catch: (error) => error,
          });
          if (sidebarScope.current === scope) setCustomizing(false);
        }),
      ),
    [sidebarAvailability, sidebarConfig, storedLayout, updateUserSettings, workspaceId],
  );
  const changeRuntimeSection = React.useCallback(
    (
      sectionId: string,
      change:
        | { limit: SidebarSectionLimit }
        | { offset: -1 | 1 }
        | { targetTabId: string }
        | { remove: true },
    ) => {
      if (!workspaceId || updateUserSettings.isPending) return;
      const nextLayout =
        "targetTabId" in change
          ? moveLayoutEntry(layout, activeTab.id, change.targetTabId, "sections", sectionId)
          : updateSidebarTab(layout, activeTab.id, (tab) => ({
              ...tab,
              sections:
                "offset" in change
                  ? moveArrayItem(
                      tab.sections,
                      tab.sections.findIndex((section) => section.id === sectionId),
                      change.offset,
                    )
                  : "remove" in change
                    ? tab.sections.filter((section) => section.id !== sectionId)
                    : tab.sections.map((section) =>
                        section.id === sectionId ? { ...section, limit: change.limit } : section,
                      ),
            }));
      void saveLayout(nextLayout).catch(showMutationError("Could not update sidebar section."));
    },
    [activeTab.id, layout, saveLayout, updateUserSettings.isPending, workspaceId],
  );
  const handleRuntimeSectionDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id || !workspaceId) return;
      const from = activeTab.sections.findIndex((section) => section.id === active.id);
      const to = activeTab.sections.findIndex((section) => section.id === over.id);
      if (from < 0 || to < 0) return;
      const sections = [...activeTab.sections];
      const [section] = sections.splice(from, 1);
      if (!section) return;
      sections.splice(to, 0, section);
      const nextLayout = {
        ...layout,
        tabs: layout.tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, sections } : tab)),
      };
      void updateUserSettings
        .mutateAsync({
          sidebarConfig: withSidebarWorkspaceLayout(
            sidebarConfig,
            workspaceId,
            restoreUnconfiguredIntegrationTabs(storedLayout, nextLayout, sidebarAvailability),
          ),
        })
        .catch(showMutationError("Could not reorder sidebar sections."));
    },
    [
      activeTab.id,
      activeTab.sections,
      layout,
      sidebarAvailability,
      sidebarConfig,
      storedLayout,
      updateUserSettings,
      workspaceId,
    ],
  );

  const activeNavigation: SidebarActiveNavigation = {
    activePageId: getActivePageId(pathname),
    activeDatabaseId: getActiveDatabaseId(pathname),
    activeDatabaseViewId: getActiveDatabaseViewId(location.search),
    activeMeetingId: getActiveMeetingId(pathname, location.search),
  };
  const navItems = React.useMemo(
    () =>
      buildSidebarSections({
        sections: activeTab.sections,
        activeTabId: activeTab.id,
        workspaceId,
        teamspaces,
        pageSections,
        favorites,
        recents,
        meetings: meetingsPayload?.meetings ?? [],
      }),
    [activeTab, workspaceId, teamspaces, pageSections, favorites, recents, meetingsPayload],
  );
  const shortcuts = activeTab.shortcuts.flatMap((shortcut) => {
    const target = shortcut.target;
    const page =
      target.type === "page" ? navigation?.pages.find((p) => p.id === target.pageId) : null;
    const database =
      target.type === "database"
        ? navigation?.databases.find((d) => d.id === target.databaseId)
        : null;
    if ((target.type === "page" && !page) || (target.type === "database" && !database)) return [];
    return [
      {
        ...shortcut,
        label: shortcut.label || page?.name || database?.name || getShortcutLabel(shortcut),
        active: isShortcutActive(shortcut, location.pathname, location.search, settingsOpen),
      },
    ];
  });
  const activateShortcut = (shortcut: SidebarShortcut) => {
    const target = shortcut.target;
    if (target.type === "action") {
      if (target.action === "createPage") void handleCreatePage();
      else if (target.action === "createDatabase") void handleCreateDatabase();
      else void handleCreateChat();
    } else if (target.type === "page")
      void navigate({ params: { pageId: target.pageId }, to: "/p/$pageId" });
    else if (target.type === "database")
      void navigate({
        params: { databaseId: target.databaseId },
        search: { view: target.viewId },
        to: "/d/$databaseId",
      });
    else if (target.type === "library")
      void navigate({ search: { view: target.view }, to: "/recents" });
    else if (target.route === "settings") onOpenSettings?.();
    else if (target.route === "meetings" || target.route === "trash")
      void navigate({ search: { view: target.route }, to: "/recents" });
    else void navigate({ to: target.route === "ai" ? "/ai" : "/tasks" });
  };
  return {
    openSearch,
    workspaceId,
    activeTabId,
    activeTab,
    layout,
    navItems,
    shortcuts,
    activateShortcut,
    activeNavigation,
    navigation,
    navigationLoading: navigationQuery.isLoading,
    navigationError: navigationQuery.isError,
    currentUserId: session?.user?.id,
    workspaceCanManage: Boolean(teamspaceSettings?.canManage),
    customizing,
    setCustomizing,
    databaseDropTargetId,
    setDatabaseDropTargetId,
    desktopLinkServer,
    location,
    handleCreatePage,
    handleCreateDatabase,
    handleCreateChat,
    handleOpenChat,
    chatSelection,
    chatThreads: chatThreads.list,
    handleDropPageOnDatabase,
    handleRemoveFavorite,
    handleRemoveDatabaseFavorite,
    saveLayout,
    handleRuntimeSectionDragEnd,
    changeRuntimeSection,
    selectTab,
    selectNavigationTab,
    isSaving: updateUserSettings.isPending,
    onOpenSettings,
    settingsOpen,
  };
}

function showMutationError(fallback: string) {
  return (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);
}

export function isActiveItem(
  item: SidebarNavItem,
  activePageId: string | null,
  activeMeetingId: string | null,
  activeDatabaseId: string | null,
  activeDatabaseViewId: string | null,
  defaultViewIds: Map<string, string>,
) {
  if (item.isMeeting) {
    return activeMeetingId === item.meetingId;
  }

  if (item.isDatabaseView) {
    return (
      activeDatabaseId === item.databaseId &&
      item.databaseViewId === (activeDatabaseViewId || defaultViewIds.get(item.databaseId ?? ""))
    );
  }

  return item.isDatabase
    ? activeDatabaseId === item.databaseId
    : activeMeetingId === null && activePageId === item.pageId;
}

export function getDefaultViewIds(items: SidebarNavItem[]) {
  const viewIds = new Map<string, string>();

  const visit = (item: SidebarNavItem) => {
    if (item.isDatabase && item.databaseId) {
      const defaultView = item.pages.find((child) => child.isDatabaseView);
      if (defaultView?.databaseViewId) {
        viewIds.set(item.databaseId, defaultView.databaseViewId);
      }
    }
    item.pages.forEach(visit);
  };

  items.forEach(visit);
  return viewIds;
}

export function useSidebarTree(storageKey: string, items: SidebarNavItem[]) {
  const defaultViewIds = React.useMemo(() => getDefaultViewIds(items), [items]);
  const [expandedIds, setExpandedIds] = React.useState(
    () => new Set(readExpandedSidebarItems(storageKey)),
  );
  React.useEffect(() => {
    writeExpandedSidebarItems(storageKey, expandedIds);
  }, [storageKey, expandedIds]);
  const setExpanded = React.useCallback((id: string, expanded: boolean) => {
    setExpandedIds((current) => setSidebarItemExpanded(current, id, expanded));
  }, []);
  return { defaultViewIds, expandedIds, setExpanded };
}

export function useSidebarPageLinks({
  databaseDropTargetId,
  onDatabaseDropTargetChange,
  onDropPageOnDatabase,
}: {
  databaseDropTargetId: string | null;
  onDatabaseDropTargetChange: (id: string | null) => void;
  onDropPageOnDatabase: (input: {
    databaseId: string;
    pageId: string;
    targetPageId: string | null;
    title?: string;
  }) => void;
}) {
  const timers = React.useRef(new Map<string, number>());
  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );
  const getLinkProps = ({ displayName, item }: { displayName: string; item: SidebarNavItem }) => {
    const key = item.navNodeId ?? item.id;
    const clearPrefetch = () => {
      window.clearTimeout(timers.current.get(key));
      timers.current.delete(key);
    };
    const prefetchPage = () => {
      if (!item.isDatabase && !item.isDatabaseView && !item.isMeeting && item.pageId) {
        prefetchPageForNavigation(item.pageId);
      }
    };
    const canDropOnDatabase = Boolean(item.isDatabase && item.databaseId && onDropPageOnDatabase);
    const handleDatabaseDragOver = (event: DragEvent<HTMLAnchorElement>) => {
      if (!canDropOnDatabase || !hasDraggedPagePayload(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      onDatabaseDropTargetChange(item.id);
    };
    const handleDatabaseDragLeave = (event: DragEvent<HTMLAnchorElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
        onDatabaseDropTargetChange(null);
      }
    };
    const handleDatabaseDrop = (event: DragEvent<HTMLAnchorElement>) => {
      const dragPayload = getDraggedPagePayload(event);

      if (!canDropOnDatabase || !item.databaseId || !dragPayload) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onDatabaseDropTargetChange(null);
      onDropPageOnDatabase?.({
        databaseId: item.databaseId,
        pageId: dragPayload.pageId,
        targetPageId: item.pageId,
        title: dragPayload.title,
      });
    };
    const handlePageDragStart = (event: DragEvent<HTMLAnchorElement>) => {
      if (item.isDatabase || item.isDatabaseView || item.isMeeting) {
        return;
      }

      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(
        DATABASE_PAGE_DRAG_MIME,
        JSON.stringify({
          pageId: item.pageId,
          title: displayName,
        }),
      );
      event.dataTransfer.setData("text/plain", displayName);
    };

    return {
      className:
        databaseDropTargetId === item.id
          ? "bg-action-neutral-hover text-action-on-neutral ring-1 ring-action-focus-ring"
          : undefined,
      draggable: !item.isDatabase && !item.isDatabaseView && !item.isMeeting,
      onDragEnter: handleDatabaseDragOver,
      onDragLeave: handleDatabaseDragLeave,
      onDragOver: handleDatabaseDragOver,
      onDragStart: handlePageDragStart,
      onDrop: handleDatabaseDrop,
      onClick: (event: {
        button: number;
        metaKey: boolean;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
      }) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !item.isDatabase &&
          !item.isDatabaseView &&
          !item.isMeeting &&
          item.pageId
        ) {
          markPageNavigationStart(item.pageId);
        }
      },
      onPointerEnter: () => {
        clearPrefetch();
        timers.current.set(
          key,
          window.setTimeout(() => {
            timers.current.delete(key);
            prefetchPage();
          }, 120),
        );
      },
      onPointerLeave: clearPrefetch,
      onFocus: () => {
        clearPrefetch();
        prefetchPage();
      },
    };
  };

  return getLinkProps;
}

function getDraggedPagePayload(event: DragEvent) {
  const payload = event.dataTransfer.getData(DATABASE_PAGE_DRAG_MIME);

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as {
      pageId?: unknown;
      title?: unknown;
    };

    if (typeof parsed.pageId !== "string" || !parsed.pageId) {
      return null;
    }

    return {
      pageId: parsed.pageId,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    };
  } catch {
    return null;
  }
}

function hasDraggedPagePayload(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes(DATABASE_PAGE_DRAG_MIME);
}

export function useSidebarDatabaseSection({
  section,
  storageKey,
  currentUserId,
}: {
  section: Extract<SidebarSection, { kind: "databaseView" }>;
  storageKey: string;
  currentUserId?: string;
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey);
  const database = useDatabaseMetadata(open ? section.databaseId : null, {
    viewId: section.viewId,
  });
  const activeView = section.viewId
    ? database.data?.views.find((view) => view.id === section.viewId)
    : database.data?.views[0];
  const activeDataSourceId = database.data?.activeDataSource?.id ?? null;
  const records = useDatabaseRecords(
    open && activeDataSourceId && activeView
      ? {
          databaseId: section.databaseId,
          dataSourceId: activeDataSourceId,
          viewId: activeView.id,
        }
      : null,
  );
  const viewData = React.useMemo(
    () =>
      composeDatabaseViewData({
        bootstrap: database.data ?? undefined,
        dataSourceId: activeDataSourceId,
        hasMore: records.hasMore,
        records: records.records,
        totalCount: records.totalCount,
      }),
    [activeDataSourceId, database.data, records.hasMore, records.records, records.totalCount],
  );
  const addRow = useAddDatabaseRow();
  const model = React.useMemo(
    () =>
      getDatabaseViewModel({
        activeViewId: section.viewId ?? null,
        currentUserId,
        viewData,
      }),
    [currentUserId, viewData, section.viewId],
  );
  const rows = model.sortedItems.slice(0, section.limit);
  const title = section.label || database.data?.displayName || "Database view";

  return {
    open,
    setOpen,
    database,
    records,
    rows,
    title,
    activeDataSourceId,
    addRow,
    hasMore: model.sortedItems.length > rows.length,
  };
}

export function useSidebarTasksSection({
  databaseIds,
  limit,
  storageKey,
}: {
  databaseIds: string[];
  limit: number;
  storageKey: string;
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey);
  const { data: session } = useSession();
  const { queries, payloads: sources } = useTaskDatabases(open ? databaseIds : []);
  const payloads = sources.filter((payload) => getTaskDatabaseSchema(payload).missing.length === 0);
  const rows = filterMyTaskRows(buildTaskRows(payloads), session?.user?.id ?? null).slice(0, limit);

  return { open, setOpen, rows, loading: queries.some((query) => query.isLoading) };
}

export function useSidebarWorkspaceIdentity() {
  const { data: sessionData } = useSession();
  return {
    sessionData,
    isWorkspacePinned: sessionData?.workspacePinned !== false,
    isDesktop: isDesktopApp(),
  };
}

export function useSidebarWorkspaceSummary() {
  const { data: rawWorkspaces = [], isError, isLoading } = useWorkspaces();
  const workspaces = rawWorkspaces.filter(Boolean);
  const activeWorkspaceId = useActiveWorkspaceId();
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  return { workspaces, activeWorkspace, isError, isLoading };
}

export function useSidebarWorkspaceSwitcher(sessionData: ReturnType<typeof useSession>["data"]) {
  const navigate = useNavigate();
  const isDesktop = isDesktopApp();
  const isWorkspacePinned = sessionData?.workspacePinned !== false;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = React.useState(false);
  const [profiles, setProfiles] = React.useState<DesktopServerProfile[]>([]);
  const { data: rawWorkspaces = [], isError, isLoading } = useWorkspaces();
  const workspaces = rawWorkspaces.filter(Boolean);
  const createWorkspace = useCreateWorkspace();
  const setActiveWorkspace = useSetActiveWorkspace();
  const activeWorkspaceId = useActiveWorkspaceId();
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const currentServer = getSelectedDesktopServer();
  const otherProfiles = profiles.filter((profile) => !profile.active);
  const showServerCaption = isDesktop && profiles.length > 1;

  React.useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    void Effect.runPromise(
      Effect.tryPromise({ try: () => listDesktopServerProfiles(), catch: (error) => error }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (!disposed) setProfiles(result.profiles);
          }),
        ),
        Effect.catchCause(() =>
          Effect.sync(() => {
            if (!disposed) setProfiles([]);
          }),
        ),
      ),
    );
    return () => {
      disposed = true;
    };
  }, [isDesktop]);

  React.useEffect(() => {
    if (!isDesktop || isError || isLoading) return;
    const handle = window.setTimeout(() => {
      const update = updateDesktopServerProfileSnapshot({
        lastActiveWorkspaceId: activeWorkspace?.id ?? null,
        lastPath: `${window.location.pathname}${window.location.search}`,
        workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
      });
      void Effect.runPromise(
        Effect.tryPromise({ try: () => update, catch: (error) => error }).pipe(Effect.ignore),
      );
    }, 400);
    return () => window.clearTimeout(handle);
  }, [activeWorkspace?.id, isDesktop, isError, isLoading, workspaces]);

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const workspaceName = String(formData.get("workspaceName") ?? "").trim();

    return Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => createWorkspace.mutateAsync(workspaceName),
          catch: (error) => error,
        });
        form.reset();
        setIsCreateDialogOpen(false);
        void navigate({ to: "/recents" });
      }).pipe(Effect.ignoreCause), // React Query owns the visible error state.
    );
  }

  return {
    navigate,
    isDesktop,
    isWorkspacePinned,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    isConnectDialogOpen,
    setIsConnectDialogOpen,
    workspaces,
    isError,
    isLoading,
    createWorkspace,
    setActiveWorkspace,
    activeWorkspace,
    currentServer,
    otherProfiles,
    showServerCaption,
    handleCreateWorkspace,
  };
}

export function readTriggerLabel({
  activeWorkspaceName,
  isError,
  isLoading,
}: {
  activeWorkspaceName?: string;
  isError: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return "Loading...";
  }

  if (isError) {
    return "Unable to load";
  }

  return activeWorkspaceName ?? "No workspaces";
}

export function serverSectionLabel(displayName?: string, apiOrigin?: string) {
  if (displayName?.trim()) return displayName;
  return apiOrigin ?? "Server";
}

export function getWorkspaceInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "N";
}

export function buildSidebarSections({
  sections,
  activeTabId,
  workspaceId,
  teamspaces,
  pageSections,
  favorites,
  recents,
  meetings,
}: {
  sections: SidebarSection[];
  activeTabId: string;
  workspaceId: string | null;
  teamspaces: Teamspace[];
  pageSections: ReturnType<typeof buildSidebarNavigation<SidebarIcon>>["sections"];
  favorites: SidebarNavItem[];
  recents: SidebarNavItem[];
  meetings: MeetingListItem[];
}): SidebarSectionModel[] {
  return sections.flatMap((section) => {
    const storageKey = `zilobase:sidebar-section:${workspaceId ?? "default"}:${activeTabId}:${section.id}`;
    const base = {
      id: section.id,
      kind: section.kind,
      section,
      label: getSectionLabel(section),
      storageKey,
      treeKey: storageKey + ":tree",
      items: [] as SidebarNavItem[],
    };
    if (section.kind === "teamspaces")
      return [...teamspaces]
        .filter((t) => t.currentUserRole)
        .sort((a, b) =>
          section.sort === "alphabetical"
            ? a.name.localeCompare(b.name)
            : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        )
        .slice(0, section.limit)
        .map((teamspace) => ({
          ...base,
          id: section.id + ":" + teamspace.id,
          label: teamspace.name,
          teamspace,
          create: true,
          storageKey: storageKey + ":" + teamspace.id,
          treeKey: storageKey + ":" + teamspace.id + ":tree",
          items: getConfiguredSidebarItems(
            pageSections.teamspacePagesById[teamspace.id] ?? [],
            "shared",
            section,
          ),
        }));
    if (section.kind === "shared" && !pageSections.teamspacePages.length) return [];
    if (section.kind === "favorites")
      return [
        {
          ...base,
          treeKey: getSidebarExpansionStorageKey(workspaceId, "favorites"),
          items: getConfiguredSidebarItems(favorites, "favorites", section),
        },
      ];
    if (section.kind === "private" || section.kind === "recents" || section.kind === "shared")
      return [
        {
          ...base,
          storageKey: section.kind === "shared" ? storageKey + ":pages" : storageKey,
          treeKey: section.kind === "shared" ? storageKey + ":pages:tree" : storageKey + ":tree",
          create: section.kind === "private",
          items: getConfiguredSidebarItems(
            section.kind === "private"
              ? pageSections.privatePages
              : section.kind === "recents"
                ? recents
                : pageSections.teamspacePages,
            section.kind,
            section,
          ),
        },
      ];
    if (section.kind === "meetings")
      return [
        {
          ...base,
          items: meetings.slice(0, section.limit).map((meeting) => ({
            id: meeting.id,
            name: meeting.title.trim() || "Meeting",
            emoji: { kind: "meeting", value: meeting.emoji },
            isMeeting: true,
            meetingId: meeting.id,
            isShared: false,
            pageId: meeting.pageId,
            pages: [],
          })),
        },
      ];
    return [base];
  });
}
