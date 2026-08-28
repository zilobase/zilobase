"use client";

import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  useLocation,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { toast } from "sonner";

import { AiChatHistoryList } from "@/components/ai-elements/ai-chat-history-list";
import {
  AppSidebarHeader,
  AppSidebarShell,
} from "@/components/app-sidebar-shell";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAppSearch } from "@/components/app-search";
import { NavFavorites } from "@/components/nav-favorites";
import { NavMeetings } from "@/components/nav-meetings";
import { NavSecondary } from "@/components/nav-secondary";
import { NavPageSection } from "@/components/nav-pages";
import { buildSidebarNavigation } from "@/components/sidebar-navigation-model";
import {
  getActiveDatabaseId,
  getActiveDatabaseViewId,
  getActiveMeetingId,
  getActivePageId,
} from "@/components/sidebar-nav-list";
import { getSidebarExpansionStorageKey } from "@/components/sidebar-expansion-state";
import { SidebarCustomizeDialog } from "@/components/sidebar-customize-dialog";
import { SidebarLibraryLink } from "@/components/sidebar-library-link";
import { SidebarSectionMenu } from "@/components/sidebar-section-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import {
  ExpandableTabs,
  type ExpandableTabItem,
} from "@/components/ui/expandable-tabs";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSession } from "@zilobase/features/auth";
import {
  defaultUserSettings,
  normalizeSidebarConfig,
  useUpdateUserSettings,
  useUserSettings,
  type SidebarConfig,
  type SidebarItemId,
} from "@zilobase/features/user-settings";
import { useWorkspaces } from "@zilobase/features/workspaces";
import {
  useTeamspaces,
  useTeamspaceSettings,
} from "@zilobase/features/teamspaces";
import {
  useAddDatabaseRow,
  useCreateDatabase,
  useSetDatabaseFavorite,
} from "@zilobase/features/databases";
import { useWorkspaceMeetings } from "@zilobase/features/meetings";
import {
  useCreatePage,
  usePageNavigation,
  useSetPageFavorite,
} from "@zilobase/features/pages";
import { useAppStore } from "@/stores/app-store";
import {
  getDatabaseIconNode,
  getPageIconNode,
  PageIconDisplay,
} from "@/lib/page-icon";
import { buildDesktopDeepLink } from "@/lib/desktop-deep-link";
import {
  discoverRuntimeDesktopServer,
  getSelectedDesktopServer,
  type DesktopServer,
} from "@/lib/desktop-server";
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions";
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state";
import {
  clearPromotedFullPagePath,
  usePromotedFullPagePath,
} from "@/contexts/page-side-pane";
import {
  BlocksIcon,
  CalendarDays,
  CalendarIcon,
  CalendarRange,
  ChartPie,
  ChevronRightIcon,
  DatabaseIcon,
  FileIcon,
  GalleryThumbnails,
  HomeIcon,
  Kanban,
  LibraryIcon,
  List,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  MessageSquarePlusIcon,
  MonitorUpIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Table2,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { editionWebModule } from "@zilobase/edition-web";
import { getDatabaseViewIcon } from "@/editor/extensions/database/views/database-view-config";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_MEETING_ITEM_ICON,
} from "@/lib/item-icons";

const sidebarNavigationIcons = {
  getDatabaseIcon: (database: Parameters<typeof getDatabaseIconNode>[0]) =>
    getDatabaseIconNode(database) ?? (
      <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />
    ),
  getDatabaseViewIcon: (view: { config?: unknown; type?: string | null }) => {
    const customIcon = getDatabaseViewIcon(view.config);

    if (customIcon) {
      return <PageIconDisplay size="sm" value={customIcon} />;
    }

    return view.type === "kanban" ? (
      <Kanban className="size-4" />
    ) : view.type === "timeline" ? (
      <CalendarRange className="size-4" />
    ) : view.type === "chart" ? (
      <ChartPie className="size-4" />
    ) : view.type === "gallery" ? (
      <GalleryThumbnails className="size-4" />
    ) : view.type === "list" ? (
      <List className="size-4" />
    ) : (
      <Table2 className="size-4" />
    );
  },
  getMeetingIcon: (meeting: { emoji?: string | null }) =>
    <PageIconDisplay
      size="sm"
      value={meeting.emoji ?? DEFAULT_MEETING_ITEM_ICON}
    />,
  getPageIcon: getPageIconNode,
};

const data = {
  navMain: [
    {
      id: "home" as const,
      title: "Home",
      icon: HomeIcon,
    },
    {
      id: "askAi" as const,
      title: "Ask AI",
      url: "/ai",
      icon: SparklesIcon,
    },
    {
      id: "meetings" as const,
      title: "Meetings",
      icon: CalendarDays,
    },
    {
      id: "tasks" as const,
      title: "Tasks",
      icon: ListChecksIcon,
    },
  ],
  navSecondary: [
    {
      id: "calendar" as const,
      title: "Calendar",
      url: "#",
      icon: <CalendarIcon />,
    },
    {
      id: "templates" as const,
      title: "Templates",
      url: "#",
      icon: <BlocksIcon />,
    },
    {
      id: "library" as const,
      title: "Library",
      url: "/recents",
      icon: <LibraryIcon />,
    },
    {
      id: "trash" as const,
      title: "Trash",
      url: "/trash",
      icon: <Trash2Icon />,
    },
    {
      id: "help" as const,
      title: "Help",
      url: "#",
      icon: <MessageCircleQuestionIcon />,
    },
  ],
};

type SidebarMode = "home" | "askAi" | "meetings" | "tasks";

export function AppSidebar({
  onOpenSettings,
  settingsOpen = false,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { openSearch } = useAppSearch();
  const routerPathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const promotedFullPagePath = usePromotedFullPagePath();
  const pathname = promotedFullPagePath ?? routerPathname;

  React.useEffect(() => {
    const handlePopState = () => clearPromotedFullPagePath();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    if (
      promotedFullPagePath &&
      window.location.pathname !== promotedFullPagePath
    ) {
      clearPromotedFullPagePath();
    }
  }, [promotedFullPagePath, routerPathname]);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { data: session } = useSession();
  const { data: rawWorkspaces = [] } = useWorkspaces();
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const [customizeSidebarOpen, setCustomizeSidebarOpen] = React.useState(false);
  const [databaseDropTargetId, setDatabaseDropTargetId] = React.useState<
    string | null
  >(null);
  const [desktopLinkServer, setDesktopLinkServer] =
    React.useState<DesktopServer | null>(getSelectedDesktopServer());
  React.useEffect(() => {
    if (desktopLinkServer || isTauri()) return;
    let disposed = false;
    void discoverRuntimeDesktopServer()
      .then((server) => {
        if (!disposed) setDesktopLinkServer(server);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [desktopLinkServer]);
  const sidebarConfig = React.useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig],
  );
  const workspaces = React.useMemo(
    () => rawWorkspaces.filter(Boolean),
    [rawWorkspaces],
  );
  const sessionWorkspaceId = session?.session?.activeWorkspaceId ?? null;
  const storedWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const sessionWorkspace =
    workspaces.find((workspace) => workspace.id === sessionWorkspaceId) ?? null;
  const workspaceId =
    storedWorkspace?.id ?? sessionWorkspace?.id ?? workspaces[0]?.id ?? null;
  const [sidebarMode, setSidebarMode] = React.useState<SidebarMode>(
    pathname === "/ai"
      ? "askAi"
      : pathname === "/tasks"
        ? "tasks"
      : pathname.startsWith("/m/")
        ? "meetings"
        : "home",
  );

  React.useEffect(() => {
    setSidebarMode((current) => {
      if (pathname === "/ai") return "askAi";
      if (pathname === "/tasks") return "tasks";
      if (pathname.startsWith("/m/")) return "meetings";
      return current === "askAi" || current === "tasks" ? "home" : current;
    });
  }, [pathname]);

  const isAiPage = sidebarMode === "askAi";
  const isMeetingsPage = sidebarMode === "meetings";
  const { data: navigation } = usePageNavigation(
    isAiPage || isMeetingsPage ? null : workspaceId,
  );
  const { data: teamspaces = [] } = useTeamspaces(
    isAiPage || isMeetingsPage ? null : workspaceId,
  );
  const { data: teamspaceSettings } = useTeamspaceSettings(
    isAiPage || isMeetingsPage ? null : workspaceId,
  );
  const { data: meetingsPayload } = useWorkspaceMeetings(
    isMeetingsPage ? workspaceId : null,
  );
  const { isPending: isCreatingPage, mutateAsync: createPage } = useCreatePage();
  const { isPending: isCreatingDatabase, mutateAsync: createDatabase } =
    useCreateDatabase();
  const { setActiveThreadId } = useAiChatThreadState({ enabled: isAiPage });
  const activeMeetingId = getActiveMeetingId(pathname, location.search);
  const { isPending: isSettingPageFavorite, mutate: setPageFavorite } =
    useSetPageFavorite();
  const { isPending: isAddingDatabaseRow, mutate: addDatabaseRow } =
    useAddDatabaseRow();
  const {
    isPending: isSettingDatabaseFavorite,
    mutate: setDatabaseFavorite,
  } = useSetDatabaseFavorite();
  const { favorites, recents, sections: pageSections } = React.useMemo(
    () =>
      buildSidebarNavigation(
        navigation?.pages ?? [],
        navigation?.databases ?? [],
        navigation?.placements ?? [],
        sidebarNavigationIcons,
      ),
    [navigation],
  );
  const hiddenSidebarItems = React.useMemo(
    () => new Set(sidebarConfig.hiddenItems),
    [sidebarConfig.hiddenItems],
  );
  const visibleTeamspaces = React.useMemo(() => {
    const joinedTeamspaces = teamspaces.filter(
      (teamspace) => teamspace.currentUserRole,
    );
    const sortedTeamspaces = [...joinedTeamspaces].sort((left, right) =>
      sidebarConfig.sectionSorts.shared === "alphabetical"
        ? left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );

    return sortedTeamspaces.slice(0, sidebarConfig.sectionLimits.shared);
  }, [sidebarConfig.sectionLimits.shared, sidebarConfig.sectionSorts.shared, teamspaces]);

  const handleSidebarConfigChange = React.useCallback(
    (nextConfig: SidebarConfig) => {
      updateUserSettings.mutate(
        { sidebarConfig: nextConfig },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not save sidebar preferences.",
            );
          },
        },
      );
    },
    [updateUserSettings],
  );

  const handleCreatePage = React.useCallback(async (teamspaceId?: string) => {
    if (!workspaceId || isCreatingPage) {
      return;
    }

    const page = await createPage({ teamspaceId, workspaceId });

    await navigate({
      to: "/p/$pageId",
      params: { pageId: page.id },
    });
  }, [createPage, isCreatingPage, navigate, workspaceId]);

  const handleCreateDatabase = React.useCallback(async (teamspaceId?: string) => {
    if (!workspaceId || isCreatingDatabase) {
      return;
    }

    const payload = await createDatabase({
      workspaceId,
      standalone: true,
      teamspaceId,
    });

    await navigate({
      to: "/d/$databaseId",
      params: { databaseId: payload.database.id },
      search: { view: undefined },
    });
  }, [createDatabase, isCreatingDatabase, navigate, workspaceId]);

  const handleCreateChat = React.useCallback(async () => {
    setActiveThreadId(null);
    setSidebarMode("askAi");
    await navigate({
      search: { thread: undefined },
      to: "/ai",
    });
  }, [navigate, setActiveThreadId]);

  const handleDropPageOnDatabase = React.useCallback(
    ({
      databaseId,
      pageId,
      targetPageId,
      title,
    }: {
      databaseId: string;
      pageId: string;
      targetPageId: string | null;
      title?: string;
    }) => {
      if (targetPageId && pageId === targetPageId) {
        toast.error("You can't nest a page inside itself.");
        return;
      }

      if (isAddingDatabaseRow) {
        return;
      }

      addDatabaseRow(
        { databaseId, pageId, title },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error ? error.message : "Could not move page.",
            );
          },
        },
      );
    },
    [addDatabaseRow, isAddingDatabaseRow],
  );

  const handleRemoveFavorite = React.useCallback(
    (pageId: string) => {
      if (isSettingPageFavorite) {
        return;
      }

      setPageFavorite(
        { isFavorite: false, pageId },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update favorite.",
            );
          },
        },
      );
    },
    [isSettingPageFavorite, setPageFavorite],
  );

  const handleRemoveDatabaseFavorite = React.useCallback(
    (databaseId: string) => {
      if (isSettingDatabaseFavorite) {
        return;
      }

      setDatabaseFavorite(
        { databaseId, isFavorite: false },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update favorite.",
            );
          },
        },
      );
    },
    [isSettingDatabaseFavorite, setDatabaseFavorite],
  );

  return (
    <AppSidebarShell {...props}>
      <AppSidebarHeader
        navigation={
          <NavMain
            items={data.navMain.filter(
              (item) =>
                item.id === "home" || !hiddenSidebarItems.has(item.id),
            )}
            onOpenHome={() => {
              setSidebarMode("home");
              if (pathname === "/tasks") {
                void navigate({ to: "/recents" });
              }
            }}
            onOpenSearch={openSearch}
            onOpenTasks={() => {
              setSidebarMode("tasks");
              void navigate({ to: "/tasks" });
            }}
            onStartAiDraft={() => void handleCreateChat()}
            onSidebarModeChange={setSidebarMode}
            sidebarMode={sidebarMode}
          />
        }
      >
        <WorkspaceSwitcher
          onOpenSettings={onOpenSettings}
          settingsOpen={settingsOpen}
        />
      </AppSidebarHeader>
      <SidebarContent>
        <div aria-hidden="true" className="h-3 shrink-0" />
        {isAiPage ? (
          <AiSidebarHistory />
        ) : isMeetingsPage ? (
          <NavMeetings
            activeMeetingId={activeMeetingId}
            meetings={meetingsPayload?.meetings ?? []}
          />
        ) : (
          <>
            {sidebarConfig.sectionOrder.map((sectionId) =>
              hiddenSidebarItems.has(sectionId)
                ? null
                : sectionId === "favorites"
                  ? (
                    <NavFavorites
                      favorites={favorites}
                      key={sectionId}
                      onCustomizeSidebar={() => setCustomizeSidebarOpen(true)}
                      onRemoveDatabaseFavorite={handleRemoveDatabaseFavorite}
                      onRemoveFavorite={handleRemoveFavorite}
                      onSidebarConfigChange={handleSidebarConfigChange}
                      sidebarConfig={sidebarConfig}
                      workspaceId={workspaceId}
                    />
                  )
                  : sectionId === "shared"
                    ? (
                      <Collapsible asChild defaultOpen key={sectionId}>
                        <SidebarGroup>
                          <div className="group/section-header relative">
                            <CollapsibleTrigger asChild>
                              <SidebarGroupLabel
                                asChild
                                className="pr-16 group-hover/section-header:bg-accent group-hover/section-header:text-accent-foreground group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:bg-accent group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:text-accent-foreground"
                              >
                                <button
                                  className="group/section-label w-full cursor-pointer"
                                  type="button"
                                >
                                  <span>Teamspaces</span>
                                  <ChevronRightIcon className="ml-1 size-3 transition-transform group-data-[state=open]/section-label:rotate-90" />
                                </button>
                              </SidebarGroupLabel>
                            </CollapsibleTrigger>
                            <SidebarLibraryLink
                              className="right-9"
                              label="Teamspaces"
                              onSidebarConfigChange={
                                handleSidebarConfigChange
                              }
                              sectionId="shared"
                              sidebarConfig={sidebarConfig}
                              view="teamspaces"
                            />
                            <SidebarSectionMenu
                              className="right-2"
                              config={sidebarConfig}
                              label="Teamspaces"
                              onChange={handleSidebarConfigChange}
                              onCustomize={() =>
                                setCustomizeSidebarOpen(true)
                              }
                              sectionId="shared"
                            />
                          </div>
                          <CollapsibleContent className="pb-4 pt-0.5">
                            <SidebarGroupContent className="-mx-2 w-auto">
                              {pageSections.teamspacePages.length > 0 ? (
                                <NavPageSection
                                  activeDatabaseId={getActiveDatabaseId(
                                    pathname,
                                  )}
                                  activeDatabaseViewId={getActiveDatabaseViewId(
                                    location.search,
                                  )}
                                  activeMeetingId={activeMeetingId}
                                  activePageId={getActivePageId(
                                    pathname,
                                  )}
                                  databaseDropTargetId={databaseDropTargetId}
                                  label="Shared pages"
                                  onDatabaseDropTargetChange={
                                    setDatabaseDropTargetId
                                  }
                                  onDropPageOnDatabase={handleDropPageOnDatabase}
                                  pages={pageSections.teamspacePages}
                                  sectionId="shared"
                                  sidebarConfig={sidebarConfig}
                                  storageKey={getSidebarExpansionStorageKey(
                                    workspaceId,
                                    "team",
                                  )}
                                />
                              ) : null}
                              {visibleTeamspaces.map((teamspace) => (
                                  <NavPageSection
                                    activeDatabaseId={getActiveDatabaseId(
                                      pathname,
                                    )}
                                    activeDatabaseViewId={getActiveDatabaseViewId(
                                      location.search,
                                    )}
                                    activeMeetingId={activeMeetingId}
                                    activePageId={getActivePageId(
                                      pathname,
                                    )}
                                    databaseDropTargetId={databaseDropTargetId}
                                    key={`teamspace:${teamspace.id}`}
                                    label={teamspace.name}
                                    onCreateDatabase={() =>
                                      void handleCreateDatabase(teamspace.id)
                                    }
                                    onCreatePage={() =>
                                      void handleCreatePage(teamspace.id)
                                    }
                                    onDatabaseDropTargetChange={
                                      setDatabaseDropTargetId
                                    }
                                    onDropPageOnDatabase={
                                      handleDropPageOnDatabase
                                    }
                                    pages={
                                      pageSections.teamspacePagesById[
                                        teamspace.id
                                      ] ?? []
                                    }
                                    sectionId="shared"
                                    showCreateAction
                                    sidebarConfig={sidebarConfig}
                                    storageKey={`${getSidebarExpansionStorageKey(
                                      workspaceId,
                                      "team",
                                    )}:${encodeURIComponent(teamspace.id)}`}
                                    teamspace={teamspace}
                                    workspaceCanManage={Boolean(
                                      teamspaceSettings?.canManage,
                                    )}
                                    workspaceId={workspaceId}
                                  />
                                ))}
                            </SidebarGroupContent>
                          </CollapsibleContent>
                        </SidebarGroup>
                      </Collapsible>
                    )
                  : (
                    <NavPageSection
                      activeDatabaseId={getActiveDatabaseId(pathname)}
                      activeDatabaseViewId={getActiveDatabaseViewId(
                        location.search,
                      )}
                      activePageId={getActivePageId(pathname)}
                      activeMeetingId={activeMeetingId}
                      databaseDropTargetId={databaseDropTargetId}
                      key={sectionId}
                      label={sectionId === "recents" ? "Recents" : "Private"}
                      onCreateDatabase={
                        sectionId === "private" ? handleCreateDatabase : undefined
                      }
                      onCreatePage={
                        sectionId === "private" ? handleCreatePage : undefined
                      }
                      onCustomizeSidebar={() => setCustomizeSidebarOpen(true)}
                      onDatabaseDropTargetChange={setDatabaseDropTargetId}
                      onDropPageOnDatabase={handleDropPageOnDatabase}
                      onSidebarConfigChange={handleSidebarConfigChange}
                      pages={
                        sectionId === "recents"
                          ? recents
                          : pageSections.privatePages
                      }
                      sectionId={sectionId}
                      showCreateAction={sectionId === "private"}
                      sidebarConfig={sidebarConfig}
                      storageKey={getSidebarExpansionStorageKey(
                        workspaceId,
                        sectionId === "recents"
                          ? "recents"
                          : "private",
                      )}
                    />
                  ),
            )}
            <NavSecondary
              className="mt-auto"
              items={[
                ...editionWebModule.navigation.map((item) => {
                  const Icon = item.icon;
                  return {
                    title: item.title,
                    url: item.url,
                    icon: Icon ? <Icon /> : <BlocksIcon />,
                  };
                }),
                ...data.navSecondary.filter(
                  (item) =>
                    item.id === "library" || !hiddenSidebarItems.has(item.id),
                ),
              ]}
            />
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="relative z-10 bg-sidebar p-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full h-5 bg-gradient-to-t from-sidebar to-transparent"
        />
        <SidebarMenu className="gap-3! px-4 pt-2 pb-3 group-data-[collapsible=icon]:px-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setCustomizeSidebarOpen(true)}
              tooltip="Customize sidebar"
              type="button"
            >
              <SlidersHorizontalIcon />
              <span>Customize sidebar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {!isTauri() && desktopLinkServer ? (
            <SidebarMenuItem>
              <a
                className="flex w-full items-start gap-2.5 rounded-lg bg-accent p-3 text-foreground ring-1 ring-border transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2!"
                href={buildDesktopDeepLink(location.href, desktopLinkServer)}
              >
                <MonitorUpIcon className="mt-0.5 size-4 shrink-0 group-data-[collapsible=icon]:mt-0" />
                <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <span className="block text-sm font-medium">
                    Open in desktop app
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    Continue this page in the desktop experience.
                  </span>
                </span>
              </a>
            </SidebarMenuItem>
          ) : null}
          <NewMenu
            createChatPending={false}
            createDatabasePending={isCreatingDatabase}
            createPagePending={isCreatingPage}
            onCreateChat={handleCreateChat}
            onCreateDatabase={handleCreateDatabase}
            onCreatePage={handleCreatePage}
          />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarCustomizeDialog
        config={sidebarConfig}
        disabled={updateUserSettings.isPending}
        onChange={handleSidebarConfigChange}
        onOpenChange={setCustomizeSidebarOpen}
        open={customizeSidebarOpen}
      />
    </AppSidebarShell>
  );
}

function NewMenu({
  createChatPending,
  createDatabasePending,
  createPagePending,
  onCreateChat,
  onCreateDatabase,
  onCreatePage,
}: {
  createChatPending: boolean;
  createDatabasePending: boolean;
  createPagePending: boolean;
  onCreateChat: () => void;
  onCreateDatabase: () => void;
  onCreatePage: () => void;
}) {
  return (
    <SidebarMenuItem>
      <DropDrawer>
        <DropDrawerTrigger asChild>
          <SidebarMenuButton
            className="h-10 w-full justify-center gap-2 bg-background text-base font-semibold text-primary ring-1 ring-border hover:bg-accent hover:text-primary data-open:bg-accent data-open:text-primary active:bg-active dark:bg-muted dark:hover:bg-accent dark:data-open:bg-accent group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-2! [&_svg]:size-5"
            tooltip="New"
          >
            <PencilIcon />
            <span>New</span>
          </SidebarMenuButton>
        </DropDrawerTrigger>
        <DropDrawerContent align="start" className="w-52 rounded-lg" side="top">
          <DropDrawerItem
            disabled={createPagePending}
            onSelect={() => onCreatePage()}
          >
            <FileIcon />
            <span>Page</span>
          </DropDrawerItem>
          <DropDrawerItem
            disabled={createDatabasePending}
            onSelect={() => onCreateDatabase()}
          >
            <DatabaseIcon />
            <span>Database</span>
          </DropDrawerItem>
          <DropDrawerSeparator />
          <DropDrawerItem
            disabled={createChatPending}
            onSelect={() => onCreateChat()}
          >
            <MessageSquarePlusIcon />
            <span>New chat</span>
          </DropDrawerItem>
        </DropDrawerContent>
      </DropDrawer>
    </SidebarMenuItem>
  );
}

function NavMain({
  items,
  onOpenHome,
  onOpenSearch,
  onOpenTasks,
  onStartAiDraft,
  onSidebarModeChange,
  sidebarMode,
}: {
  items: {
    id: "home" | "meetings" | "tasks" | SidebarItemId;
    title: string;
    url?: string;
    icon: LucideIcon;
  }[];
  onOpenHome: () => void;
  onOpenSearch: () => void;
  onOpenTasks: () => void;
  onStartAiDraft: () => void;
  onSidebarModeChange: (mode: SidebarMode) => void;
  sidebarMode: SidebarMode;
}) {
  const routeSelected = items.findIndex((item) =>
    sidebarMode === "home"
      ? item.id === "home"
      : sidebarMode === "meetings"
        ? item.id === "meetings"
        : sidebarMode === "tasks"
          ? item.id === "tasks"
        : item.id === "askAi",
  );
  const [selected, setSelected] = React.useState<number | null>(routeSelected);
  const tabs = React.useMemo<ExpandableTabItem[]>(
    () => items.map((item) => ({ title: item.title, icon: item.icon })),
    [items],
  );

  React.useEffect(() => {
    setSelected(routeSelected);
  }, [routeSelected]);

  const handleChange = (index: number | null) => {
    if (index === null) {
      setSelected(routeSelected);
      return;
    }

    setSelected(index);
    const item = items[index];

    if (!item) return;

    if (item.id === "home") {
      onOpenHome();
      return;
    }

    if (item.id === "meetings") {
      onSidebarModeChange("meetings");
      return;
    }

    if (item.id === "tasks") {
      onOpenTasks();
      return;
    }

    onStartAiDraft();
  };

  return (
    <div className="relative z-10 bg-sidebar">
      <SidebarGroup className="bg-sidebar px-0">
        <SidebarGroupContent>
          <nav aria-label="Main navigation" className="bg-sidebar py-2">
            <div className="flex items-center gap-0.5">
              <ExpandableTabs
                onChange={handleChange}
                selected={selected}
                tabs={tabs}
              />
              <button
                aria-label="Search"
                className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onOpenSearch}
                title="Search"
                type="button"
              >
                <SearchIcon className="size-4" />
              </button>
            </div>
          </nav>
        </SidebarGroupContent>
      </SidebarGroup>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-full h-3 bg-gradient-to-b from-sidebar to-transparent"
      />
    </div>
  );
}

function AiSidebarHistory() {
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState();
  const { handleStartNewChat } = useAiChatThreadActions({
    activeThreadId,
    onSelectThread: setActiveThreadId,
  });

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleStartNewChat}
              >
                <PlusIcon />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <Collapsible asChild defaultOpen>
        <SidebarGroup className="min-h-0 flex-1 overflow-hidden pt-0">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel asChild>
              <button
                className="group/section-label w-full cursor-pointer"
                type="button"
              >
                <span>History</span>
                <ChevronRightIcon className="ml-1 size-3 transition-transform group-data-[state=open]/section-label:rotate-90" />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent className="min-h-0 flex-1 pt-0.5">
            <SidebarGroupContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AiChatHistoryList
                activeThreadId={activeThreadId}
                className="px-0 py-0"
                onSelectThread={setActiveThreadId}
              />
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </>
  );
}
