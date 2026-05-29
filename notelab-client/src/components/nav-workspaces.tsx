import { useState, type DragEvent, type ReactNode } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"

export type WorkspaceNavItem = {
  databaseId?: string | null
  id: string
  isDatabase?: boolean
  isFavorite?: boolean
  isLinked?: boolean
  isTeamspace: boolean
  name: string
  emoji: ReactNode
  workspaceId: string
  pages: WorkspaceNavItem[]
}

type DatabaseDropInput = {
  databaseId: string
  pageId: string
  targetPageId: string
  title?: string
}

export function NavWorkspaces({
  onCreateWorkspace,
  onDropPageOnDatabase,
  privateWorkspaces,
  teamspaceWorkspaces,
}: {
  onCreateWorkspace: () => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  privateWorkspaces: WorkspaceNavItem[]
  teamspaceWorkspaces: WorkspaceNavItem[]
}) {
  const location = useLocation()
  const activeWorkspaceId = getActiveWorkspaceId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const [databaseDropTargetId, setDatabaseDropTargetId] = useState<
    string | null
  >(null)

  return (
    <>
      <WorkspaceSection
        activeDatabaseId={activeDatabaseId}
        activeWorkspaceId={activeWorkspaceId}
        databaseDropTargetId={databaseDropTargetId}
        label="Private"
        onCreateWorkspace={onCreateWorkspace}
        onDatabaseDropTargetChange={setDatabaseDropTargetId}
        onDropPageOnDatabase={onDropPageOnDatabase}
        showCreateAction
        workspaces={privateWorkspaces}
      />
      <WorkspaceSection
        activeDatabaseId={activeDatabaseId}
        activeWorkspaceId={activeWorkspaceId}
        databaseDropTargetId={databaseDropTargetId}
        label="Team"
        onDatabaseDropTargetChange={setDatabaseDropTargetId}
        onDropPageOnDatabase={onDropPageOnDatabase}
        workspaces={teamspaceWorkspaces}
      />
    </>
  )
}

function WorkspaceSection({
  activeDatabaseId,
  activeWorkspaceId,
  databaseDropTargetId,
  label,
  onCreateWorkspace,
  onDatabaseDropTargetChange,
  onDropPageOnDatabase,
  showCreateAction = false,
  workspaces,
}: {
  activeDatabaseId: string | null
  activeWorkspaceId: string | null
  databaseDropTargetId: string | null
  label: string
  onCreateWorkspace?: () => void
  onDatabaseDropTargetChange: (workspaceId: string | null) => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  showCreateAction?: boolean
  workspaces: WorkspaceNavItem[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      {showCreateAction ? (
        <SidebarGroupAction
          aria-label="Create workspace"
          title="Create workspace"
          onClick={onCreateWorkspace}
        >
          <PlusIcon />
        </SidebarGroupAction>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {workspaces.map((workspace) => (
            <WorkspaceTreeItem
              activeDatabaseId={activeDatabaseId}
              activeWorkspaceId={activeWorkspaceId}
              databaseDropTargetId={databaseDropTargetId}
              isRoot
              item={workspace}
              key={workspace.id}
              onDatabaseDropTargetChange={onDatabaseDropTargetChange}
              onDropPageOnDatabase={onDropPageOnDatabase}
            />
          ))}
          {workspaces.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/50">
                <span>No workspaces</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {workspaces.length > 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/70">
                <MoreHorizontalIcon />
                <span>More</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function hasActiveDescendant(
  item: WorkspaceNavItem,
  activeDatabaseId: string | null,
  activeWorkspaceId: string | null,
): boolean {
  return item.pages.some(
    (page) =>
      (page.isDatabase
        ? activeDatabaseId === page.databaseId
        : activeWorkspaceId === page.id) ||
      hasActiveDescendant(page, activeDatabaseId, activeWorkspaceId),
  )
}

function WorkspaceTreeItem({
  activeDatabaseId,
  activeWorkspaceId,
  databaseDropTargetId,
  isRoot = false,
  item,
  onDatabaseDropTargetChange,
  onDropPageOnDatabase,
}: {
  activeDatabaseId: string | null
  activeWorkspaceId: string | null
  databaseDropTargetId: string | null
  isRoot?: boolean
  item: WorkspaceNavItem
  onDatabaseDropTargetChange: (workspaceId: string | null) => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
}) {
  const isActive = item.isDatabase
    ? activeDatabaseId === item.databaseId
    : activeWorkspaceId === item.id
  const hasPages = item.pages.length > 0
  const isOpen =
    isActive || hasActiveDescendant(item, activeDatabaseId, activeWorkspaceId)
  const displayName = item.name.trim() || "Untitled"
  const isDatabaseDropTarget = databaseDropTargetId === item.id
  const canDropOnDatabase = Boolean(item.databaseId && onDropPageOnDatabase)
  const linkWorkspaceId = item.workspaceId
  const startPageDrag = (event: DragEvent<HTMLAnchorElement>) => {
    if (item.isDatabase) {
      return
    }

    event.dataTransfer.effectAllowed = "copyMove"
    event.dataTransfer.setData(
      DATABASE_PAGE_DRAG_MIME,
      JSON.stringify({
        pageId: item.id,
        title: displayName,
      })
    )
    event.dataTransfer.setData("text/plain", displayName)
  }
  const handleDatabaseDragOver = (event: DragEvent<HTMLAnchorElement>) => {
    if (!canDropOnDatabase || !hasDraggedPagePayload(event)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    onDatabaseDropTargetChange(item.id)
  }
  const handleDatabaseDragLeave = (event: DragEvent<HTMLAnchorElement>) => {
    if (
      !event.currentTarget.contains(
        event.relatedTarget as globalThis.Node | null
      )
    ) {
      onDatabaseDropTargetChange(null)
    }
  }
  const handleDatabaseDrop = (event: DragEvent<HTMLAnchorElement>) => {
    const dragPayload = getDraggedPagePayload(event)

    if (!canDropOnDatabase || !item.databaseId || !dragPayload) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onDatabaseDropTargetChange(null)
    onDropPageOnDatabase?.({
      databaseId: item.databaseId,
      pageId: dragPayload.pageId,
      targetPageId: linkWorkspaceId,
      title: dragPayload.title,
    })
  }
  const databaseDropProps = {
    className: isDatabaseDropTarget
      ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring"
      : undefined,
    onDragEnter: handleDatabaseDragOver,
    onDragLeave: handleDatabaseDragLeave,
    onDragOver: handleDatabaseDragOver,
    onDrop: handleDatabaseDrop,
  }

  if (!isRoot) {
    return (
      <Collapsible defaultOpen={isOpen}>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild isActive={isActive}>
            {item.isDatabase && item.databaseId ? (
              <Link
                draggable={false}
                to="/database/$databaseId"
                params={{ databaseId: item.databaseId }}
                {...databaseDropProps}
              >
                <span>{item.emoji}</span>
                <span>{displayName}</span>
                {item.isLinked ? (
                  <ArrowUpRightIcon
                    aria-label="Linked from another parent"
                    className="ml-auto size-3 text-sidebar-foreground/45"
                  />
                ) : null}
              </Link>
            ) : (
              <Link
                draggable
                onDragStart={startPageDrag}
                to="/workspace/$workspaceId"
                params={{ workspaceId: linkWorkspaceId }}
                {...databaseDropProps}
              >
                <span>{item.emoji}</span>
                <span>{displayName}</span>
                {item.isLinked ? (
                  <ArrowUpRightIcon
                    aria-label="Linked from another parent"
                    className="ml-auto size-3 text-sidebar-foreground/45"
                  />
                ) : null}
              </Link>
            )}
          </SidebarMenuSubButton>
          {hasPages ? (
            <CollapsibleTrigger asChild>
              <SidebarMenuAction
                className="top-1 left-1 bg-sidebar-accent text-sidebar-accent-foreground data-[state=open]:rotate-90 group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100"
                showOnHover
              >
                <ChevronRightIcon />
              </SidebarMenuAction>
            </CollapsibleTrigger>
          ) : null}
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.pages.map((page) => (
                <WorkspaceTreeItem
                  activeDatabaseId={activeDatabaseId}
                  activeWorkspaceId={activeWorkspaceId}
                  databaseDropTargetId={databaseDropTargetId}
                  item={page}
                  key={page.id}
                  onDatabaseDropTargetChange={onDatabaseDropTargetChange}
                  onDropPageOnDatabase={onDropPageOnDatabase}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuSubItem>
      </Collapsible>
    )
  }

  return (
    <Collapsible defaultOpen={isOpen}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive}>
          {item.isDatabase && item.databaseId ? (
            <Link
              draggable={false}
              to="/database/$databaseId"
              params={{ databaseId: item.databaseId }}
              {...databaseDropProps}
            >
              <span>{item.emoji}</span>
              <span>{displayName}</span>
              {item.isLinked ? (
                <ArrowUpRightIcon
                  aria-label="Linked from another parent"
                  className="ml-auto size-3 text-sidebar-foreground/45"
                />
              ) : null}
            </Link>
          ) : (
            <Link
              draggable
              onDragStart={startPageDrag}
              to="/workspace/$workspaceId"
              params={{ workspaceId: linkWorkspaceId }}
              {...databaseDropProps}
            >
              <span>{item.emoji}</span>
              <span>{displayName}</span>
              {item.isLinked ? (
                <ArrowUpRightIcon
                  aria-label="Linked from another parent"
                  className="ml-auto size-3 text-sidebar-foreground/45"
                />
              ) : null}
            </Link>
          )}
        </SidebarMenuButton>
        {hasPages ? (
          <CollapsibleTrigger asChild>
            <SidebarMenuAction
              className="left-2 bg-sidebar-accent text-sidebar-accent-foreground data-[state=open]:rotate-90"
              showOnHover
            >
              <ChevronRightIcon />
            </SidebarMenuAction>
          </CollapsibleTrigger>
        ) : null}
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.pages.map((page) => (
              <WorkspaceTreeItem
                activeDatabaseId={activeDatabaseId}
                activeWorkspaceId={activeWorkspaceId}
                databaseDropTargetId={databaseDropTargetId}
                item={page}
                key={page.id}
                onDatabaseDropTargetChange={onDatabaseDropTargetChange}
                onDropPageOnDatabase={onDropPageOnDatabase}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function getActiveWorkspaceId(pathname: string) {
  const match = pathname.match(/^\/workspace\/([^/?#]+)/)

  if (!match) {
    return null
  }

  return decodeURIComponent(match[1])
}

function getActiveDatabaseId(pathname: string) {
  const match = pathname.match(/^\/database\/([^/?#]+)/)

  if (!match) {
    return null
  }

  return decodeURIComponent(match[1])
}

function getDraggedPagePayload(event: DragEvent) {
  const payload = event.dataTransfer.getData(DATABASE_PAGE_DRAG_MIME)

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as {
      pageId?: unknown
      title?: unknown
    }

    if (typeof parsed.pageId !== "string" || !parsed.pageId) {
      return null
    }

    return {
      pageId: parsed.pageId,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    }
  } catch {
    return null
  }
}

function hasDraggedPagePayload(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes(DATABASE_PAGE_DRAG_MIME)
}
