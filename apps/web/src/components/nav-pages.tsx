import { useState, type DragEvent } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useDeleteDatabase } from "@notelab/features/databases"
import { useDeletePage } from "@notelab/features/pages"
import {
  ArrowUpRightIcon,
  DatabaseIcon,
  FileIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
  getActiveDatabaseViewId,
  getActivePageId,
  NavTree,
  type PageNavItem,
} from "@/components/nav-tree"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"

export type { PageNavItem } from "@/components/nav-tree"

type DatabaseDropInput = {
  databaseId: string
  pageId: string
  targetPageId: string
  title?: string
}

export function NavPages({
  onCreateDatabase,
  onCreatePage,
  onDropPageOnDatabase,
  privatePages,
  teamspacePages,
}: {
  onCreateDatabase?: () => void
  onCreatePage: () => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  privatePages: PageNavItem[]
  teamspacePages: PageNavItem[]
}) {
  const location = useLocation()
  const activePageId = getActivePageId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const activeDatabaseViewId = getActiveDatabaseViewId(location.search)
  const [databaseDropTargetId, setDatabaseDropTargetId] = useState<
    string | null
  >(null)

  return (
    <>
      <PageSection
        activeDatabaseId={activeDatabaseId}
        activeDatabaseViewId={activeDatabaseViewId}
        activePageId={activePageId}
        databaseDropTargetId={databaseDropTargetId}
        label="Private"
        onCreateDatabase={onCreateDatabase}
        onCreatePage={onCreatePage}
        onDatabaseDropTargetChange={setDatabaseDropTargetId}
        onDropPageOnDatabase={onDropPageOnDatabase}
        showCreateAction
        pages={privatePages}
      />
      <PageSection
        activeDatabaseId={activeDatabaseId}
        activeDatabaseViewId={activeDatabaseViewId}
        activePageId={activePageId}
        databaseDropTargetId={databaseDropTargetId}
        label="Team"
        onDatabaseDropTargetChange={setDatabaseDropTargetId}
        onDropPageOnDatabase={onDropPageOnDatabase}
        pages={teamspacePages}
      />
    </>
  )
}

function PageSection({
  activeDatabaseId,
  activeDatabaseViewId,
  activePageId,
  databaseDropTargetId,
  label,
  onCreateDatabase,
  onCreatePage,
  onDatabaseDropTargetChange,
  onDropPageOnDatabase,
  showCreateAction = false,
  pages,
}: {
  activeDatabaseId: string | null
  activeDatabaseViewId: string | null
  activePageId: string | null
  databaseDropTargetId: string | null
  label: string
  onCreateDatabase?: () => void
  onCreatePage?: () => void
  onDatabaseDropTargetChange: (pageId: string | null) => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  showCreateAction?: boolean
  pages: PageNavItem[]
}) {
  const getLinkProps = ({
    displayName,
    item,
  }: {
    displayName: string
    item: PageNavItem
  }) => {
    const canDropOnDatabase = Boolean(
      item.isDatabase && item.databaseId && onDropPageOnDatabase,
    )
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
        targetPageId: item.pageId,
        title: dragPayload.title,
      })
    }
    const handlePageDragStart = (event: DragEvent<HTMLAnchorElement>) => {
      if (item.isDatabase || item.isDatabaseView) {
        return
      }

      event.dataTransfer.effectAllowed = "copyMove"
      event.dataTransfer.setData(
        DATABASE_PAGE_DRAG_MIME,
        JSON.stringify({
          pageId: item.pageId,
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
      draggable: !item.isDatabase && !item.isDatabaseView,
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
        <DropDrawer>
          <DropDrawerTrigger asChild>
            <SidebarGroupAction aria-label="Create" title="Create">
              <PlusIcon />
            </SidebarGroupAction>
          </DropDrawerTrigger>
          <DropDrawerContent align="end" className="w-44 rounded-lg">
            <DropDrawerItem
              onSelect={() => {
                onCreatePage?.()
              }}
            >
              <FileIcon className="text-muted-foreground" />
              <span>Page</span>
            </DropDrawerItem>
            <DropDrawerItem
              onSelect={() => {
                onCreateDatabase?.()
              }}
            >
              <DatabaseIcon className="text-muted-foreground" />
              <span>Database</span>
            </DropDrawerItem>
          </DropDrawerContent>
        </DropDrawer>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu>
          <NavTree
            activeDatabaseId={activeDatabaseId}
            activeDatabaseViewId={activeDatabaseViewId}
            activePageId={activePageId}
            getLinkProps={getLinkProps}
            items={pages}
            renderItemMenu={({ item }) =>
              item.isDatabaseView ? null : (
                <PageItemMenu item={item} />
              )
            }
          />
          {pages.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/50">
                <span>No pages</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {pages.length > 0 ? (
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

function PageItemMenu({ item }: {
  item: PageNavItem
}) {
  const { isMobile } = useSidebar()
  const location = useLocation()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deletePage = useDeletePage()
  const deleteDatabase = useDeleteDatabase()
  const activePageId = getActivePageId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const linkPath =
    (item.isDatabase || item.isDatabaseView) && item.databaseId
      ? `/database/${item.databaseId}`
      : `/page/${item.pageId}`
  const displayName = item.name.trim() || "Untitled"
  const isDeleting = deletePage.isPending || deleteDatabase.isPending

  const redirectIfDeleted = (result: {
    deletedDatabaseIds: string[]
    deletedPageIds: string[]
  }) => {
    const deletedActivePage =
      activePageId &&
      result.deletedPageIds.includes(activePageId)
    const deletedActiveDatabase =
      activeDatabaseId && result.deletedDatabaseIds.includes(activeDatabaseId)

    if (deletedActivePage || deletedActiveDatabase) {
      void navigate({ to: "/" })
    }
  }

  const runDelete = () => {
    if (item.isDatabase && item.databaseId) {
      deleteDatabase.mutate(item.databaseId, {
        onSuccess: (result) => {
          setConfirmOpen(false)
          toast.success("Moved to trash.")
          redirectIfDeleted(result)
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Could not delete database.",
          )
        },
      })
      return
    }

    deletePage.mutate(item.pageId, {
      onSuccess: (result) => {
        setConfirmOpen(false)
        toast.success("Moved to trash.")
        redirectIfDeleted(result)
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Could not delete page.",
        )
      },
    })
  }

  return (
    <>
      <DropDrawer>
        <DropDrawerTrigger asChild>
          <SidebarMenuAction
            className="opacity-0 group-hover/nav-row:opacity-100 focus-visible:opacity-100 aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
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
          <DropDrawerSeparator />
          <DropDrawerItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              setConfirmOpen(true)
            }}
          >
            <Trash2Icon className="text-destructive" />
            <span>Delete</span>
          </DropDrawerItem>
        </DropDrawerContent>
      </DropDrawer>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.isDatabase
                ? `${displayName} and its row pages will be moved to trash.`
                : `${displayName} and its subpages will be moved to trash. Linked pages elsewhere will not be deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={runDelete}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
