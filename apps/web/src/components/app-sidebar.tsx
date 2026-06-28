"use client"

import * as React from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

import { AiChatHistoryList } from "@/components/ai-elements/ai-chat-history-list"
import { AppSidebarShell } from "@/components/app-sidebar-shell"
import { useAppSearch } from "@/components/app-search"
import { NavFavorites } from "@/components/nav-favorites"
import { NavSecondary } from "@/components/nav-secondary"
import {
  NavPages,
  type PageNavItem,
} from "@/components/nav-pages"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { ThemeDropdown } from "@/components/theme-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useSession } from "@notelab/features/auth"
import { useWorkspaces } from "@notelab/features/workspaces"
import {
  useAddDatabaseRow,
  useCreateDatabase,
  useSetDatabaseFavorite,
} from "@notelab/features/databases"
import type { Page } from "@notelab/features/pages"
import {
  getDatabaseIconNode,
  getPageIconNode,
} from "@/lib/page-icon"
import {
  useCreatePage,
  useSetPageFavorite,
  usePages,
} from "@notelab/features/pages"
import { useAppStore } from "@/stores/app-store"
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions"
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state"
import {
  BlocksIcon,
  CalendarIcon,
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
} from "lucide-react"

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
      icon: (
        <CalendarIcon
        />
      ),
    },
    {
      title: "Templates",
      url: "#",
      icon: (
        <BlocksIcon
        />
      ),
    },
    {
      title: "Trash",
      url: "/trash",
      icon: (
        <Trash2Icon
        />
      ),
    },
    {
      title: "Help",
      url: "#",
      icon: (
        <MessageCircleQuestionIcon
        />
      ),
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const { openSearch } = useAppSearch()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const { data: session } = useSession()
  const { data: rawWorkspaces = [] } = useWorkspaces()
  const workspaces = rawWorkspaces.filter(Boolean)
  const sessionWorkspaceId = session?.session?.activeWorkspaceId ?? null
  const storedWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    null
  const sessionWorkspace =
    workspaces.find((workspace) => workspace.id === sessionWorkspaceId) ??
    null
  const workspaceId =
    storedWorkspace?.id ??
    sessionWorkspace?.id ??
    workspaces[0]?.id ??
    null
  const { data: pageRecords = [] } = usePages(workspaceId)
  const createPage = useCreatePage()
  const createDatabase = useCreateDatabase()
  const setFavorite = useSetPageFavorite()
  const addDatabaseRow = useAddDatabaseRow()
  const setDatabaseFavorite = useSetDatabaseFavorite()
  const activePageRecords = pageRecords
    .filter((page) => !page.deletedAt)
    .map((page) => ({
      ...page,
      databases: page.databases?.filter((database) => !database.deletedAt),
    }))
  const pageSections = buildPageTreeSections(activePageRecords)
  const favorites = buildFavoriteTreeItems([
    ...pageSections.privatePages,
    ...pageSections.teamspacePages,
  ])
  const isAiPage = pathname === "/ai"

  const handleCreatePage = async () => {
    if (!workspaceId || createPage.isPending) {
      return
    }

    const page = await createPage.mutateAsync({ workspaceId })

    await navigate({
      to: "/page/$pageId",
      params: { pageId: page.id },
    })
  }

  const handleCreateDatabase = async () => {
    if (
      !workspaceId ||
      createPage.isPending ||
      createDatabase.isPending
    ) {
      return
    }

    const page = await createPage.mutateAsync({ workspaceId })
    const payload = await createDatabase.mutateAsync({
      workspaceId,
      pageId: page.id,
      standalone: true,
    })

    await navigate({
      to: "/database/$databaseId",
      params: { databaseId: payload.database.id },
      search: { view: undefined },
    })
  }

  const handleDropPageOnDatabase = ({
    databaseId,
    pageId,
    targetPageId,
    title,
  }: {
    databaseId: string
    pageId: string
    targetPageId: string
    title?: string
  }) => {
    if (pageId === targetPageId) {
      toast.error("You can't nest a page inside itself.")
      return
    }

    if (addDatabaseRow.isPending) {
      return
    }

    addDatabaseRow.mutate(
      {
        databaseId,
        pageId,
        title,
      },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Could not move page."
          )
        },
      }
    )
  }

  const handleRemoveFavorite = (pageId: string) => {
    if (setFavorite.isPending) {
      return
    }

    setFavorite.mutate(
      { isFavorite: false, pageId },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update favorite.",
          )
        },
      },
    )
  }

  const handleRemoveDatabaseFavorite = (databaseId: string) => {
    if (setDatabaseFavorite.isPending) {
      return
    }

    setDatabaseFavorite.mutate(
      { databaseId, isFavorite: false },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update favorite.",
          )
        },
      },
    )
  }

  return (
    <AppSidebarShell {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher />
          </div>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>
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
              isActive={pathname === "/settings" || pathname.startsWith("/settings/")}
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
  )
}

function NavMain({
  items,
  onOpenSearch,
  pathname,
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
  }[]
  onOpenSearch: () => void
  pathname: string
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
  )
}

function AiSidebarHistory() {
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState()
  const { createThread, handleCreateThread } = useAiChatThreadActions({
    activeThreadId,
    onSelectThread: setActiveThreadId,
  })

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
  )
}

function isNavigationItemActive(url: string, pathname: string) {
  return url !== "#" && (pathname === url || pathname.startsWith(`${url}/`))
}

function buildPageTreeSections(pages: Page[]) {
  const orderedPages = [...pages].sort(
    (first, second) =>
      getPageCreatedTime(first) - getPageCreatedTime(second),
  )
  const baseNodesById = new Map(
    orderedPages.map((page) => [
      page.id,
      {
        databaseId: page.databases?.[0]?.id,
        id: page.id,
        isTeamspace: Boolean(page.isTeamspace),
        name: page.name,
        emoji: getPageIconNode(page),
        isFavorite: Boolean(page.isFavorite),
        notelabai: page.metadata?.notelabai ?? null,
        pageId: page.id,
        pages: [] as PageNavItem[],
      },
    ]),
  )
  const placements = pages[0]?.navigationPlacements ?? []
  const placementsByPageParent = groupPlacements(
    placements.filter((placement) => placement.parentKind === "page"),
  )
  const databaseNodesById = new Map<string, PageNavItem>()
  const standaloneDatabaseHostPageIds = new Set<string>()
  const standaloneDatabaseNodes: PageNavItem[] = []
  const databasePlacementIds = new Set(
    placements
      .filter(
        (placement) =>
          placement.itemKind === "database" && placement.parentKind === "page",
      )
      .map((placement) => placement.itemId),
  )
  const databaseRowPageIds = new Set(
    placements
      .filter(
        (placement) =>
          placement.itemKind === "page" &&
          placement.placementKind === "database_row",
      )
      .map((placement) => placement.itemId),
  )

  for (const page of orderedPages) {
    for (const database of page.databases ?? []) {
      databaseNodesById.set(database.id, createDatabaseNode(database, page))

      if (
        !databasePlacementIds.has(database.id) &&
        !hasPageChildPlacements(placementsByPageParent, page.id)
      ) {
        standaloneDatabaseHostPageIds.add(page.id)
      }
    }
  }

  const buildDatabaseNode = (
    databaseId: string,
    navNodeId: string,
    isLinked = false,
  ): PageNavItem | null => {
    const baseNode = databaseNodesById.get(databaseId)

    if (!baseNode) {
      return null
    }

    return {
      ...baseNode,
      isLinked,
      navNodeId,
      pages: baseNode.pages,
    }
  }

  const buildPageNode = (
    pageId: string,
    navNodeId: string,
    visitedIds: Set<string>,
    isLinked = false,
  ): PageNavItem | null => {
    const baseNode = baseNodesById.get(pageId)

    if (!baseNode) {
      return null
    }

    if (visitedIds.has(pageId)) {
      return { ...baseNode, isLinked: true, navNodeId, pages: [] }
    }

    const nextVisitedIds = new Set(visitedIds)
    nextVisitedIds.add(pageId)
    const childPlacements = placementsByPageParent.get(pageId) ?? []

    return {
      ...baseNode,
      isLinked,
      navNodeId,
      pages: childPlacements.flatMap((placement) => {
        if (placement.itemKind === "page") {
          if (placement.itemId === pageId) {
            return []
          }

          const child = buildPageNode(
            placement.itemId,
            placement.id,
            nextVisitedIds,
            placement.placementKind !== "primary" ||
              databaseRowPageIds.has(placement.itemId),
          )

          return child ? [child] : []
        }

        const child = buildDatabaseNode(
          placement.itemId,
          placement.id,
          placement.placementKind !== "primary",
        )

        return child ? [child] : []
      }),
    }
  }

  for (const page of orderedPages) {
    for (const database of page.databases ?? []) {
      if (databasePlacementIds.has(database.id)) {
        continue
      }

      const databaseNode = buildDatabaseNode(
        database.id,
        `standalone-database:${database.id}`,
      )

      if (databaseNode) {
        standaloneDatabaseNodes.push(databaseNode)
      }
    }
  }

  const placedPageIds = new Set(
    placements
      .filter((placement) => placement.itemKind === "page")
      .map((placement) => placement.itemId),
  )
  const roots = orderedPages.flatMap((page) => {
    if (
      placedPageIds.has(page.id) ||
      standaloneDatabaseHostPageIds.has(page.id)
    ) {
      return []
    }

    const node = buildPageNode(page.id, page.id, new Set())

    return node ? [node] : []
  })

  roots.push(...standaloneDatabaseNodes)

  return {
    privatePages: roots.filter((page) => !page.isTeamspace),
    teamspacePages: roots.filter((page) => page.isTeamspace),
  }
}

function createDatabaseNode(
  database: NonNullable<Page["databases"]>[number],
  page: Page,
): PageNavItem {
  return {
    databaseId: database.id,
    id: `database:${database.id}`,
    isDatabase: true,
    isFavorite: Boolean(database.isFavorite),
    isTeamspace: Boolean(page.isTeamspace),
    name: database.name,
    emoji: getDatabaseIconNode(database) ?? <DatabaseIcon className="size-4" />,
    pageId: database.pageId,
    pages: [...(database.views ?? [])]
      .sort((first, second) => first.position - second.position)
      .map((view) => ({
        databaseId: database.id,
        databaseViewId: view.id,
        id: `database-view:${view.id}`,
        isDatabaseView: true,
        isTeamspace: Boolean(page.isTeamspace),
        name: view.name,
        emoji: getDatabaseViewIcon(view),
        pageId: database.pageId,
        navNodeId: `database-view:${database.id}:${view.id}`,
        pages: [],
      })),
  }
}

function groupPlacements(
  placements: NonNullable<Page["navigationPlacements"]>,
) {
  const grouped = new Map<string, typeof placements>()

  for (const placement of placements) {
    grouped.set(placement.parentId, [
      ...(grouped.get(placement.parentId) ?? []),
      placement,
    ])
  }

  for (const [parentId, parentPlacements] of grouped) {
    grouped.set(
      parentId,
      [...parentPlacements].sort((first, second) => {
        if (first.position !== second.position) {
          return first.position - second.position
        }

        return first.id.localeCompare(second.id)
      }),
    )
  }

  return grouped
}

function hasPageChildPlacements(
  placementsByPageParent: Map<
    string,
    NonNullable<Page["navigationPlacements"]>
  >,
  pageId: string,
) {
  return (placementsByPageParent.get(pageId) ?? []).some(
    (placement) => placement.itemKind === "page",
  )
}

function buildFavoriteTreeItems(items: PageNavItem[]) {
  const favoriteItems = items.flatMap((item) =>
    cloneFavoriteTreeItems(item, false),
  )
  const nestedFavoriteIds = new Set<string>()

  for (const item of favoriteItems) {
    collectFavoriteDescendantIds(item, nestedFavoriteIds)
  }

  return favoriteItems.filter((item) => !nestedFavoriteIds.has(item.id))
}

function cloneFavoriteTreeItems(
  item: PageNavItem,
  hasFavoriteAncestor: boolean,
): PageNavItem[] {
  if (item.isDatabaseView) {
    return []
  }

  if (hasFavoriteAncestor || item.isFavorite) {
    return [
      {
        ...item,
        isFavorite: true,
        pages: item.pages.flatMap((page) => cloneFavoriteTreeItems(page, true)),
      },
    ]
  }

  const favoritePages = getFavoriteDescendantPages(item)

  if (item.isDatabase && favoritePages.length > 0) {
    return [{ ...item, pages: favoritePages }]
  }

  return favoritePages
}

function getFavoriteDescendantPages(item: PageNavItem): PageNavItem[] {
  return item.pages.flatMap((page) => cloneFavoriteTreeItems(page, false))
}

function collectFavoriteDescendantIds(
  item: PageNavItem,
  ids: Set<string>,
) {
  for (const page of item.pages) {
    ids.add(page.id)
    collectFavoriteDescendantIds(page, ids)
  }
}

function getPageCreatedTime(page: Page) {
  const time = new Date(page.createdAt).getTime()

  return Number.isFinite(time) ? time : 0
}

function getDatabaseViewIcon(view: { type?: string | null }) {
  return view.type === "kanban" ? (
    <Kanban className="size-4" />
  ) : (
    <Table2 className="size-4" />
  )
}
