"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { NavFavorites } from "@/components/nav-favorites"
import { NavMain } from "@/components/nav-main"
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
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useSession } from "@/features/auth/hooks"
import { useOrganizations } from "@/features/organizations/hooks"
import {
  useAddDatabaseRow,
  useSetDatabaseFavorite,
} from "@/features/databases/hooks"
import { getDatabaseEmoji } from "@/features/databases/queries"
import {
  getWorkspaceEmoji,
  type Workspace,
} from "@/features/workspaces/queries"
import {
  useCreateWorkspace,
  useSetWorkspaceFavorite,
  useWorkspaces,
} from "@/features/workspaces/hooks"
import { useAppStore } from "@/stores/app-store"
import { SearchIcon, SparklesIcon, HomeIcon, InboxIcon, CalendarIcon, Settings2Icon, BlocksIcon, Trash2Icon, MessageCircleQuestionIcon, DatabaseIcon, FileIcon, FileTextIcon } from "lucide-react"

// This is sample data.
const data = {
  navMain: [
    {
      title: "Search",
      url: "#",
      icon: (
        <SearchIcon
        />
      ),
    },
    {
      title: "Ask AI",
      url: "/ai",
      icon: (
        <SparklesIcon
        />
      ),
    },
    {
      title: "Home",
      url: "/dashboard",
      icon: (
        <HomeIcon
        />
      ),
    },
    {
      title: "Inbox",
      url: "#",
      icon: (
        <InboxIcon
        />
      ),
      badge: "10",
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
      title: "Settings",
      url: "/settings/profile",
      icon: (
        <Settings2Icon
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
  const activeOrganizationId = useAppStore((state) => state.activeOrganizationId)
  const { data: session } = useSession()
  const { data: organizations = [] } = useOrganizations()
  const organizationId =
    activeOrganizationId ??
    session?.session?.activeOrganizationId ??
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
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <OrganizationSwitcher />
        <NavMain items={data.navMain} />
      </SidebarHeader>
      <SidebarContent>
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
        <ThemeDropdown />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
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
        databaseId: getWorkspaceDatabaseId(workspace),
        id: workspace.id,
        isTeamspace: Boolean(workspace.isTeamspace),
        name: workspace.name,
        emoji: getWorkspaceIcon(workspace),
        isFavorite: Boolean(workspace.isFavorite),
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

    const parentWorkspaceId = workspace.metadata?.parentWorkspaceId
    const parent = parentWorkspaceId ? nodesById.get(parentWorkspaceId) : null

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

    for (const pageId of findPageBlockIds(workspace.content)) {
      const linkedPage = nodesById.get(pageId)

      if (
        !linkedPage ||
        linkedPage.id === node.id ||
        existingChildIds.has(linkedPage.id)
      ) {
        continue
      }

      node.pages.push(cloneLinkedTreeNode(linkedPage, new Set([node.id])))
      existingChildIds.add(linkedPage.id)
    }

    for (const databaseId of findDatabaseBlockIds(workspace.content)) {
      const linkedDatabase = databaseNodesById.get(databaseId)

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

function getWorkspaceDatabaseId(workspace: Workspace) {
  return findDatabaseBlockId(workspace.content)
}

function getWorkspaceIcon(workspace: Workspace) {
  return (
    getWorkspaceEmoji(workspace) ??
    (hasWorkspaceContent(workspace.content) ? (
      <FileTextIcon className="size-4" />
    ) : (
      <FileIcon className="size-4" />
    ))
  )
}

function getDatabaseIcon(database: { config?: unknown }) {
  return getDatabaseEmoji(database) ?? <DatabaseIcon className="size-4" />
}

function hasWorkspaceContent(content: unknown): boolean {
  if (content === null || content === undefined) {
    return false
  }

  if (typeof content === "string") {
    return content.trim().length > 0
  }

  if (Array.isArray(content)) {
    return content.some(hasWorkspaceContent)
  }

  if (typeof content !== "object") {
    return true
  }

  const node = content as {
    attrs?: unknown
    content?: unknown
    text?: unknown
    type?: unknown
  }

  if (typeof node.text === "string" && node.text.trim().length > 0) {
    return true
  }

  if (
    typeof node.type === "string" &&
    !["doc", "paragraph", "text"].includes(node.type)
  ) {
    return true
  }

  return hasWorkspaceContent(node.content)
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

function findPageBlockIds(content: unknown): string[] {
  const pageIds: string[] = []

  collectBlockIds(content, "pageBlock", "pageId", pageIds)

  return pageIds
}

function findDatabaseBlockIds(content: unknown): string[] {
  const databaseIds: string[] = []

  collectBlockIds(content, "databaseBlock", "databaseId", databaseIds)

  return databaseIds
}

function collectBlockIds(
  content: unknown,
  blockType: string,
  attrName: string,
  ids: string[],
) {
  if (typeof content === "string") {
    const attrPattern =
      attrName === "databaseId" ? "data-database-id" : "data-page-id"
    const regex = new RegExp(`${attrPattern}=["']([^"']+)["']`, "g")

    for (const match of content.matchAll(regex)) {
      if (match[1]) {
        ids.push(match[1])
      }
    }

    return
  }

  if (!content || typeof content !== "object") {
    return
  }

  if (Array.isArray(content)) {
    for (const child of content) {
      collectBlockIds(child, blockType, attrName, ids)
    }

    return
  }

  const node = content as {
    attrs?: Record<string, unknown>
    content?: unknown
    type?: unknown
  }

  if (node.type === blockType && typeof node.attrs?.[attrName] === "string") {
    ids.push(node.attrs[attrName])
  }

  collectBlockIds(node.content, blockType, attrName, ids)
}

function findDatabaseBlockId(content: unknown): string | null {
  if (typeof content === "string") {
    const match = content.match(/data-database-id=["']([^"']+)["']/)

    return match?.[1] ?? null
  }

  if (!content || typeof content !== "object") {
    return null
  }

  if (Array.isArray(content)) {
    for (const child of content) {
      const databaseId = findDatabaseBlockId(child)

      if (databaseId) {
        return databaseId
      }
    }

    return null
  }

  const node = content as {
    attrs?: { databaseId?: unknown }
    content?: unknown
    type?: unknown
  }

  if (
    node.type === "databaseBlock" &&
    typeof node.attrs?.databaseId === "string"
  ) {
    return node.attrs.databaseId
  }

  return findDatabaseBlockId(node.content)
}
