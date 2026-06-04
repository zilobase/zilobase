import { useState, type DragEvent } from "react"
import { useLocation } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  getActiveDatabaseId,
  getActiveWorkspaceId,
  NavTree,
  type WorkspaceNavItem,
} from "@/components/nav-tree"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"

export type { WorkspaceNavItem } from "@/components/nav-tree"

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
  const getLinkProps = ({
    displayName,
    item,
  }: {
    displayName: string
    item: WorkspaceNavItem
  }) => {
    const canDropOnDatabase = Boolean(item.databaseId && onDropPageOnDatabase)
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
          event.relatedTarget as globalThis.Node | null,
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
        targetPageId: item.workspaceId,
        title: dragPayload.title,
      })
    }
    const handlePageDragStart = (event: DragEvent<HTMLAnchorElement>) => {
      if (item.isDatabase) {
        return
      }

      event.dataTransfer.effectAllowed = "copyMove"
      event.dataTransfer.setData(
        DATABASE_PAGE_DRAG_MIME,
        JSON.stringify({
          pageId: item.id,
          title: displayName,
        }),
      )
      event.dataTransfer.setData("text/plain", displayName)
    }

    return {
      className:
        databaseDropTargetId === item.id
          ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring"
          : undefined,
      draggable: !item.isDatabase,
      onDragEnter: handleDatabaseDragOver,
      onDragLeave: handleDatabaseDragLeave,
      onDragOver: handleDatabaseDragOver,
      onDragStart: handlePageDragStart,
      onDrop: handleDatabaseDrop,
    }
  }

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
          <NavTree
            activeDatabaseId={activeDatabaseId}
            activeWorkspaceId={activeWorkspaceId}
            getLinkProps={getLinkProps}
            items={workspaces}
            renderItemMenu={({ item, nested }) => (
              <WorkspaceItemMenu item={item} nested={nested} />
            )}
          />
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

function WorkspaceItemMenu({
  item,
  nested,
}: {
  item: WorkspaceNavItem
  nested: boolean
}) {
  const { isMobile } = useSidebar()
  const linkPath =
    item.isDatabase && item.databaseId
      ? `/database/${item.databaseId}`
      : `/workspace/${item.workspaceId}`
  const hoverClassName = nested
    ? "top-1 opacity-0 group-hover/nav-row:opacity-100 focus-visible:opacity-100"
    : "top-1.5 opacity-0 group-hover/nav-row:opacity-100 focus-visible:opacity-100"

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarMenuAction
          className={`${hoverClassName} aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground`}
          data-nav-menu-action="more"
        >
          <MoreHorizontalIcon />
          <span className="sr-only">More</span>
        </SidebarMenuAction>
      </DropDrawerTrigger>
      <DropDrawerContent
        align={isMobile ? "end" : "start"}
        className="w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
      >
        <DropDrawerItem
          onSelect={() => {
            void navigator.clipboard?.writeText(
              `${window.location.origin}${linkPath}`,
            )
          }}
        >
          <LinkIcon className="text-muted-foreground" />
          <span>Copy Link</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem
          onSelect={() => {
            window.open(linkPath, "_blank", "noopener")
          }}
        >
          <ArrowUpRightIcon className="text-muted-foreground" />
          <span>Open in New Tab</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
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
