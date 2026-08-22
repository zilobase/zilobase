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
  List,
  MessageCircleQuestionIcon,
  MessageSquarePlusIcon,
  MonitorUpIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Table2,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { editionWebModule } from "@zilobase/edition-web";

const sidebarNavigationIcons = {
  getDatabaseIcon: (database: Parameters<typeof getDatabaseIconNode>[0]) =>
    getDatabaseIconNode(database) ?? <DatabaseIcon className="size-4" />,
  getDatabaseViewIcon: (view: { type?: string | null }) =>
    view.type === "kanban" ? (
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
    ),
  getMeetingIcon: (meeting: { emoji?: string | null }) =>
    meeting.emoji ? (
      <PageIconDisplay size="sm" value={meeting.emoji} />
    ) : (
      <CalendarDays className="size-4" />
    ),
  getPageIcon: getPageIconNode,
};

const data = {
  navMain: [
    {
      id: "home" as const,
      title: "Home",
      url: "/recents",
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
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
  const [sidebarMode, setSidebarMode] = React.useState<
    "home" | "askAi" | "meetings"
  >(
    pathname === "/ai"
      ? "askAi"
      : pathname.startsWith("/m/")
        ? "meetings"
        : "home",
  );

  React.useEffect(() => {
    setSidebarMode((current) => {
      if (pathname === "/ai") return "askAi";
      if (pathname.startsWith("/m/")) return "meetings";
      return current === "askAi" ? "home" : current;
    });
  }, [pathname]);

  const isAiPage = sidebarMode === "askAi";
  const isMeetingsPage = sidebarMode === "meetings";
  const { data: navigation } = usePageNavigation(
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

  const handleCreatePage = React.useCallback(async () => {
    if (!workspaceId || isCreatingPage) {
      return;
    }

    const page = await createPage({ workspaceId });

    await navigate({
      to: "/p/$pageId",
      params: { pageId: page.id },
    });
  }, [createPage, isCreatingPage, navigate, workspaceId]);

  const handleCreateDatabase = React.useCallback(async () => {
    if (!workspaceId || isCreatingDatabase) {
      return;
    }

    const payload = await createDatabase({
      workspaceId,
      standalone: true,
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
            onOpenSearch={openSearch}
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
                  : (
                    <NavPageSection
                      activeDatabaseId={getActiveDatabaseId(location.pathname)}
                      activeDatabaseViewId={getActiveDatabaseViewId(
                        location.search,
                      )}
                      activePageId={getActivePageId(location.pathname)}
                      activeMeetingId={activeMeetingId}
                      databaseDropTargetId={databaseDropTargetId}
                      key={sectionId}
                      label={
                        sectionId === "recents"
                          ? "Recents"
                          : sectionId === "private"
                            ? "Private"
                            : "Shared"
                      }
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
                          : sectionId === "private"
                          ? pageSections.privatePages
                          : pageSections.teamspacePages
                      }
                      sectionId={sectionId}
                      showCreateAction={sectionId === "private"}
                      sidebarConfig={sidebarConfig}
                      storageKey={getSidebarExpansionStorageKey(
                        workspaceId,
                        sectionId === "recents"
                          ? "recents"
                          : sectionId === "shared"
                            ? "team"
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
                  (item) => !hiddenSidebarItems.has(item.id),
                ),
              ]}
            />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {!isTauri() && desktopLinkServer ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href={buildDesktopDeepLink(location.href, desktopLinkServer)}>
                  <MonitorUpIcon />
                  <span>Open in desktop app</span>
                </a>
              </SidebarMenuButton>
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
          <SidebarMenuButton tooltip="New">
            <PlusIcon />
            <span>New</span>
          </SidebarMenuButton>
        </DropDrawerTrigger>
        <DropDrawerContent align="start" className="w-52 rounded-lg" side="top">
          <DropDrawerItem
            disabled={createPagePending}
            onSelect={onCreatePage}
          >
            <FileIcon />
            <span>Page</span>
          </DropDrawerItem>
          <DropDrawerItem
            disabled={createDatabasePending}
            onSelect={onCreateDatabase}
          >
            <DatabaseIcon />
            <span>Database</span>
          </DropDrawerItem>
          <DropDrawerSeparator />
          <DropDrawerItem
            disabled={createChatPending}
            onSelect={onCreateChat}
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
  onOpenSearch,
  onStartAiDraft,
  onSidebarModeChange,
  sidebarMode,
}: {
  items: {
    id: "home" | "meetings" | SidebarItemId;
    title: string;
    url?: string;
    icon: LucideIcon;
  }[];
  onOpenSearch: () => void;
  onStartAiDraft: () => void;
  onSidebarModeChange: (mode: "home" | "askAi" | "meetings") => void;
  sidebarMode: "home" | "askAi" | "meetings";
}) {
  const navigate = useNavigate();
  const routeSelected = items.findIndex((item) =>
    sidebarMode === "home"
      ? item.id === "home"
      : sidebarMode === "meetings"
        ? item.id === "meetings"
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
      onSidebarModeChange("home");
      if (item.url) void navigate({ to: item.url as never });
      return;
    }

    if (item.id === "meetings") {
      onSidebarModeChange("meetings");
      return;
    }

    onStartAiDraft();
  };

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <nav aria-label="Main navigation">
          <div className="flex items-center gap-0.5">
            <ExpandableTabs
              onChange={handleChange}
              selected={selected}
              tabs={tabs}
            />
            <button
              aria-label="Search"
              className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground/60 outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
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
