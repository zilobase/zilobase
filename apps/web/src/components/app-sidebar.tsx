"use client"

import * as React from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

import { AppSidebarShell } from "@/components/app-sidebar-shell"
import { useAppSearch } from "@/components/app-search"
import { NavFavorites } from "@/components/nav-favorites"
import { NavSecondary } from "@/components/nav-secondary"
import {
  NavWorkspaces,
  type WorkspaceNavItem,
} from "@/components/nav-workspaces"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import { ThemeDropdown } from "@/components/theme-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useSession } from "@notelab/features/auth"
import { useOrganizations } from "@notelab/features/organizations"
import {
  useAddDatabaseRow,
  useSetDatabaseFavorite,
} from "@notelab/features/databases"
import { getDatabaseEmoji } from "@notelab/features/databases"
import {
  getWorkspaceEmoji,
  readLinkedItems,
  readParentItemId,
  type Workspace,
} from "@notelab/features/workspaces"
import {
  useCreateWorkspace,
  useSetWorkspaceFavorite,
  useWorkspaces,
} from "@notelab/features/workspaces"
import { useAppStore } from "@/stores/app-store"
import {
  BlocksIcon,
  CalendarIcon,
  DatabaseIcon,
  FileIcon,
  HomeIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
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
      url: "#",
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
  const activeOrganizationId = useAppStore((state) => state.activeOrganizationId)
  const { data: session } = useSession()
  const { data: organizations = [] } = useOrganizations()
  const sessionOrganizationId = session?.session?.activeOrganizationId ?? null
  const storedOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ??
    null
  const sessionOrganization =
    organizations.find((organization) => organization.id === sessionOrganizationId) ??
    null
  const organizationId =
    storedOrganization?.id ??
    sessionOrganization?.id ??
    organizations[0]?.id ??
    null
  const { data: workspaceRecords = [] } = useWorkspaces(organizationId)
  const createWorkspace = useCreateWorkspace()
  const setFavorite = useSetWorkspaceFavorite()
  const addDatabaseRow = useAddDatabaseRow(organizationId)
  const setDatabaseFavorite = useSetDatabaseFavorite()
  const workspaceSections = buildWorkspaceTreeSections(workspaceRecords)
  const favorites = buildFavoriteTreeItems([
    ...workspaceSections.privateWorkspaces,
    ...workspaceSections.teamspaceWorkspaces,
  ])

  const handleCreateWorkspace = async () => {
    if (!organizationId || createWorkspace.isPending) {
      return
    }

    const workspace = await createWorkspace.mutateAsync({ organizationId })

    await navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: workspace.id },
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

  const handleRemoveFavorite = (workspaceId: string) => {
    if (setFavorite.isPending) {
      return
    }

    setFavorite.mutate(
      { isFavorite: false, workspaceId },
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
            <OrganizationSwitcher />
          </div>
          <SidebarTrigger className="shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={data.navMain}
          onOpenSearch={openSearch}
          pathname={pathname}
        />
        <NavFavorites
          favorites={favorites}
          onRemoveDatabaseFavorite={handleRemoveDatabaseFavorite}
          onRemoveFavorite={handleRemoveFavorite}
        />
        <NavWorkspaces
          onCreateWorkspace={handleCreateWorkspace}
          onDropPageOnDatabase={handleDropPageOnDatabase}
          privateWorkspaces={workspaceSections.privateWorkspaces}
          teamspaceWorkspaces={workspaceSections.teamspaceWorkspaces}
        />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSearch} type="button">
              <SearchIcon />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function isNavigationItemActive(url: string, pathname: string) {
  return url !== "#" && (pathname === url || pathname.startsWith(`${url}/`))
}

function buildWorkspaceTreeSections(workspaces: Workspace[]) {
  const orderedWorkspaces = [...workspaces].sort(
    (first, second) =>
      getWorkspaceCreatedTime(first) - getWorkspaceCreatedTime(second),
  )
  const nodesById = new Map(
    orderedWorkspaces.map((workspace) => [
      workspace.id,
      {
        databaseId: workspace.databases?.[0]?.id,
        id: workspace.id,
        isTeamspace: Boolean(workspace.isTeamspace),
        name: workspace.name,
        emoji: getWorkspaceIcon(workspace),
        isFavorite: Boolean(workspace.isFavorite),
        notelabai: workspace.metadata?.notelabai ?? null,
        workspaceId: workspace.id,
        pages: [] as WorkspaceNavItem[],
      },
    ]),
  )
  const roots: WorkspaceNavItem[] = []
  const databaseNodesById = new Map<string, WorkspaceNavItem>()
  const rowPageIds = new Set(
    orderedWorkspaces.flatMap((workspace) =>
      (workspace.databases ?? []).flatMap((database) =>
        database.rows.map((row) => row.pageId),
      ),
    ),
  )

  for (const workspace of orderedWorkspaces) {
    const parentNode = nodesById.get(workspace.id)

    if (!parentNode) {
      continue
    }

    for (const database of workspace.databases ?? []) {
      const databaseNode: WorkspaceNavItem = {
        databaseId: database.id,
        id: `database:${database.id}`,
        isDatabase: true,
        isFavorite: Boolean(database.isFavorite),
        isTeamspace: Boolean(workspace.isTeamspace),
        name: database.name,
        emoji: getDatabaseIcon(database),
        workspaceId: database.pageId,
        pages: [],
      }

      databaseNodesById.set(database.id, databaseNode)

      for (const row of [...database.rows].sort(
        (first, second) => first.position - second.position,
      )) {
        const rowNode = nodesById.get(row.pageId)

        if (rowNode && rowNode.id !== parentNode.id) {
          databaseNode.pages.push(rowNode)
        }
      }

      parentNode.pages.push(databaseNode)
    }
  }

  for (const workspace of orderedWorkspaces) {
    const node = nodesById.get(workspace.id)

    if (!node) {
      continue
    }

    const parentItemId = readParentItemId(workspace.metadata)
    const parent = parentItemId ? nodesById.get(parentItemId) : null

    if (rowPageIds.has(workspace.id)) {
      continue
    }

    if (parent && parent.id !== node.id) {
      parent.pages.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const workspace of orderedWorkspaces) {
    const node = nodesById.get(workspace.id)

    if (!node) {
      continue
    }

    const existingChildIds = new Set(node.pages.map((page) => page.id))

    for (const linkedItem of readLinkedItems(workspace.metadata)) {
      if (linkedItem.kind === "workspace") {
        const linkedPage = nodesById.get(linkedItem.id)

        if (
          !linkedPage ||
          linkedPage.id === node.id ||
          existingChildIds.has(linkedPage.id)
        ) {
          continue
        }

        node.pages.push(cloneLinkedTreeNode(linkedPage, new Set([node.id])))
        existingChildIds.add(linkedPage.id)
        continue
      }

      const linkedDatabase = databaseNodesById.get(linkedItem.id)

      if (!linkedDatabase || existingChildIds.has(linkedDatabase.id)) {
        continue
      }

      node.pages.push(cloneLinkedTreeNode(linkedDatabase, new Set([node.id])))
      existingChildIds.add(linkedDatabase.id)
    }
  }

  return {
    privateWorkspaces: roots.filter((workspace) => !workspace.isTeamspace),
    teamspaceWorkspaces: roots.filter((workspace) => workspace.isTeamspace),
  }
}

function buildFavoriteTreeItems(items: WorkspaceNavItem[]) {
  const favoriteItems = items.flatMap((item) => cloneFavoriteTreeItems(item, false))
  const nestedFavoriteIds = new Set<string>()

  for (const item of favoriteItems) {
    collectFavoriteDescendantIds(item, nestedFavoriteIds)
  }

  return favoriteItems.filter((item) => !nestedFavoriteIds.has(item.id))
}

function cloneFavoriteTreeItems(
  item: WorkspaceNavItem,
  hasFavoriteAncestor: boolean,
): WorkspaceNavItem[] {
  const favoritePages = getFavoriteDescendantPages(item)

  if (item.isDatabase) {
    if (hasFavoriteAncestor) {
      return []
    }

    return item.isFavorite || favoritePages.length > 0
      ? [{ ...item, pages: favoritePages }]
      : []
  }

  if (item.isFavorite && !hasFavoriteAncestor) {
    return [{ ...item, pages: favoritePages }]
  }

  return favoritePages
}

function getFavoriteDescendantPages(item: WorkspaceNavItem): WorkspaceNavItem[] {
  return item.pages.flatMap((page) => {
    const pages = getFavoriteDescendantPages(page)

    if (page.isFavorite) {
      return [{ ...page, pages }]
    }

    return pages
  })
}

function collectFavoriteDescendantIds(
  item: WorkspaceNavItem,
  ids: Set<string>,
) {
  for (const page of item.pages) {
    ids.add(page.id)
    collectFavoriteDescendantIds(page, ids)
  }
}

function getWorkspaceCreatedTime(workspace: Workspace) {
  const time = new Date(workspace.createdAt).getTime()

  return Number.isFinite(time) ? time : 0
}

function getWorkspaceIcon(workspace: Workspace) {
  return getWorkspaceEmoji(workspace) ?? <FileIcon className="size-4" />
}

function getDatabaseIcon(database: { config?: unknown }) {
  return getDatabaseEmoji(database) ?? <DatabaseIcon className="size-4" />
}

function cloneLinkedTreeNode(
  node: WorkspaceNavItem,
  visitedIds: Set<string>,
): WorkspaceNavItem {
  if (visitedIds.has(node.id)) {
    return { ...node, isLinked: true, pages: [] }
  }

  const nextVisitedIds = new Set(visitedIds)

  nextVisitedIds.add(node.id)

  return {
    ...node,
    isLinked: true,
    pages: node.pages.map((page) => cloneLinkedTreeNode(page, nextVisitedIds)),
  }
}


