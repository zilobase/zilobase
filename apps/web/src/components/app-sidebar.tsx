"use client";

import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

import { AiChatHistoryList } from "@/components/ai-elements/ai-chat-history-list";
import {
  AppSidebarHeader,
  AppSidebarShell,
} from "@/components/app-sidebar-shell";
import { useAppSearch } from "@/components/app-search";
import { NavFavorites } from "@/components/nav-favorites";
import { NavSecondary } from "@/components/nav-secondary";
import { NavPages } from "@/components/nav-pages";
import { buildSidebarNavigation } from "@/components/sidebar-navigation-model";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeDropdown } from "@/components/theme-dropdown";
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
import { useSession } from "@notelab/features/auth";
import { useWorkspaces } from "@notelab/features/workspaces";
import {
  useAddDatabaseRow,
  useCreateDatabase,
  useSetDatabaseFavorite,
} from "@notelab/features/databases";
import {
  useCreatePage,
  usePageNavigation,
  useSetPageFavorite,
} from "@notelab/features/pages";
import { useAppStore } from "@/stores/app-store";
import { getDatabaseIconNode, getPageIconNode } from "@/lib/page-icon";
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions";
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state";
import {
  BlocksIcon,
  CalendarIcon,
  CalendarRange,
  ChartPie,
  DatabaseIcon,
  HomeIcon,
  Kanban,
  MessageCircleQuestionIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  Table2,
  Trash2Icon,
} from "lucide-react";

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
    ) : (
      <Table2 className="size-4" />
    ),
  getPageIcon: getPageIconNode,
};

const data = {
  navMain: [
    {
      title: "Home",
      url: "/dashboard",
      icon: <HomeIcon />,
    },
    {
      title: "Ask AI",
      url: "/ai",
      icon: <SparklesIcon />,
    },
  ],
  navSecondary: [
    {
      title: "Calendar",
      url: "#",
      icon: <CalendarIcon />,
    },
    {
      title: "Templates",
      url: "#",
      icon: <BlocksIcon />,
    },
    {
      title: "Trash",
      url: "/trash",
      icon: <Trash2Icon />,
    },
    {
      title: "Help",
      url: "#",
      icon: <MessageCircleQuestionIcon />,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { openSearch } = useAppSearch();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { data: session } = useSession();
  const { data: rawWorkspaces = [] } = useWorkspaces();
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
  const { data: navigation } = usePageNavigation(workspaceId);
  const { isPending: isCreatingPage, mutateAsync: createPage } = useCreatePage();
  const { isPending: isCreatingDatabase, mutateAsync: createDatabase } =
    useCreateDatabase();
  const { isPending: isSettingPageFavorite, mutate: setPageFavorite } =
    useSetPageFavorite();
  const { isPending: isAddingDatabaseRow, mutate: addDatabaseRow } =
    useAddDatabaseRow();
  const {
    isPending: isSettingDatabaseFavorite,
    mutate: setDatabaseFavorite,
  } = useSetDatabaseFavorite();
  const { favorites, sections: pageSections } = React.useMemo(
    () =>
      buildSidebarNavigation(
        navigation?.pages ?? [],
        navigation?.databases ?? [],
        navigation?.placements ?? [],
        sidebarNavigationIcons,
      ),
    [navigation],
  );
  const isAiPage = pathname === "/ai";

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
      <AppSidebarHeader>
        <WorkspaceSwitcher />
      </AppSidebarHeader>
      <SidebarContent>
        <NavMain
          items={data.navMain}
          onOpenSearch={openSearch}
          pathname={pathname}
        />
        {isAiPage ? (
          <AiSidebarHistory />
        ) : (
          <>
            <NavFavorites
              favorites={favorites}
              onRemoveDatabaseFavorite={handleRemoveDatabaseFavorite}
              onRemoveFavorite={handleRemoveFavorite}
            />
            <NavPages
              onCreateDatabase={handleCreateDatabase}
              onCreatePage={handleCreatePage}
              onDropPageOnDatabase={handleDropPageOnDatabase}
              privatePages={pageSections.privatePages}
              teamspacePages={pageSections.teamspacePages}
            />
            <NavSecondary items={data.navSecondary} className="mt-auto" />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={
                pathname === "/settings" || pathname.startsWith("/settings/")
              }
            >
              <Link to="/settings/profile">
                <Settings2Icon />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ThemeDropdown />
      </SidebarFooter>
    </AppSidebarShell>
  );
}

function NavMain({
  items,
  onOpenSearch,
  pathname,
}: {
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
  }[];
  onOpenSearch: () => void;
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={isNavigationItemActive(item.url, pathname)}
              >
                <Link to={item.url as never}>
                  {item.icon}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSearch} type="button">
              <SearchIcon />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AiSidebarHistory() {
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState();
  const { createThread, handleCreateThread } = useAiChatThreadActions({
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
                disabled={createThread.isPending}
                onClick={() => void handleCreateThread()}
              >
                <PlusIcon />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="min-h-0 flex-1 overflow-hidden pt-0">
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AiChatHistoryList
            activeThreadId={activeThreadId}
            className="px-0 py-0"
            onSelectThread={setActiveThreadId}
          />
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function isNavigationItemActive(url: string, pathname: string) {
  return url !== "#" && (pathname === url || pathname.startsWith(`${url}/`));
}
