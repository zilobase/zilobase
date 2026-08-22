import { useState, type DragEvent } from "react"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useDeleteDatabase } from "@zilobase/features/databases"
import { useActiveWorkspaceId } from "@zilobase/features/integrations"
import {
  useDeletePage,
  useMovePageToTeamspace,
} from "@zilobase/features/pages"
import { useTeamspaces } from "@zilobase/features/teamspaces"
import {
  ArrowUpRightIcon,
  DatabaseIcon,
  FileIcon,
  FolderInputIcon,
  LinkIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  getActiveDatabaseId,
  getActiveDatabaseViewId,
  getActiveMeetingId,
  getActivePageId,
  SidebarNavList,
  type SidebarNavItem,
} from "@/components/sidebar-nav-list"
import { SidebarNavItemAction } from "@/components/sidebar-nav-item-action"
import { useOpenInNewTab } from "@/components/desktop-tabs"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"
import { getSidebarExpansionStorageKey } from "@/components/sidebar-expansion-state"
import { cn } from "@/lib/utils"
import { OfflineAvailabilityAction } from "@/components/offline-availability-action"
import { SidebarSectionMenu } from "@/components/sidebar-section-menu"
import { getConfiguredSidebarItems } from "@/components/sidebar-section-items"
import type {
  SidebarConfig,
  SidebarSectionId,
} from "@zilobase/features/user-settings"

export type { SidebarNavItem } from "@/components/sidebar-nav-list"

type DatabaseDropInput = {
  databaseId: string
  pageId: string
  targetPageId: string | null
  title?: string
}

export function NavPages({
  onCreateDatabase,
  onCreatePage,
  onImportNotion,
  onDropPageOnDatabase,
  privatePages,
  teamspacePages,
  workspaceId,
}: {
  onCreateDatabase?: () => void
  onCreatePage: () => void
  onImportNotion?: () => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  privatePages: SidebarNavItem[]
  teamspacePages: SidebarNavItem[]
  workspaceId: string | null
}) {
  const location = useLocation()
  const activePageId = getActivePageId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const activeDatabaseViewId = getActiveDatabaseViewId(location.search)
  const activeMeetingId = getActiveMeetingId(
    location.pathname,
    location.search,
  )
  const [databaseDropTargetId, setDatabaseDropTargetId] = useState<
    string | null
  >(null)

  return (
    <>
      <NavPageSection
        activeDatabaseId={activeDatabaseId}
        activeDatabaseViewId={activeDatabaseViewId}
        activePageId={activePageId}
        activeMeetingId={activeMeetingId}
        databaseDropTargetId={databaseDropTargetId}
        label="Private"
        sectionId="private"
        onCreateDatabase={onCreateDatabase}
        onCreatePage={onCreatePage}
        onImportNotion={onImportNotion}
        onDatabaseDropTargetChange={setDatabaseDropTargetId}
        onDropPageOnDatabase={onDropPageOnDatabase}
        showCreateAction
        pages={privatePages}
        storageKey={getSidebarExpansionStorageKey(workspaceId, "private")}
      />
      <NavPageSection
        activeDatabaseId={activeDatabaseId}
        activeDatabaseViewId={activeDatabaseViewId}
        activePageId={activePageId}
        activeMeetingId={activeMeetingId}
        databaseDropTargetId={databaseDropTargetId}
        label="Shared"
        sectionId="shared"
        onDatabaseDropTargetChange={setDatabaseDropTargetId}
        onDropPageOnDatabase={onDropPageOnDatabase}
        pages={teamspacePages}
        storageKey={getSidebarExpansionStorageKey(workspaceId, "team")}
      />
    </>
  )
}

export function NavPageSection({
  activeDatabaseId,
  activeDatabaseViewId,
  activePageId,
  activeMeetingId,
  databaseDropTargetId,
  label,
  onCreateDatabase,
  onCreatePage,
  onImportNotion,
  onDatabaseDropTargetChange,
  onDropPageOnDatabase,
  showCreateAction = false,
  pages,
  sectionId,
  sidebarConfig,
  onSidebarConfigChange,
  onCustomizeSidebar,
  storageKey,
}: {
  activeDatabaseId: string | null
  activeDatabaseViewId: string | null
  activePageId: string | null
  activeMeetingId?: string | null
  databaseDropTargetId: string | null
  label: string
  onCreateDatabase?: () => void
  onCreatePage?: () => void
  onImportNotion?: () => void
  onDatabaseDropTargetChange: (pageId: string | null) => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  showCreateAction?: boolean
  pages: SidebarNavItem[]
  sectionId: SidebarSectionId
  sidebarConfig?: SidebarConfig
  onSidebarConfigChange?: (config: SidebarConfig) => void
  onCustomizeSidebar?: () => void
  storageKey: string
}) {
  const displayedPages = sidebarConfig
    ? getConfiguredSidebarItems(pages, sectionId, sidebarConfig)
    : pages
  const getLinkProps = ({
    displayName,
    item,
  }: {
    displayName: string
    item: SidebarNavItem
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
      if (item.isDatabase || item.isDatabaseView || item.isMeeting) {
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
      draggable: !item.isDatabase && !item.isDatabaseView && !item.isMeeting,
      onDragEnter: handleDatabaseDragOver,
      onDragLeave: handleDatabaseDragLeave,
      onDragOver: handleDatabaseDragOver,
      onDragStart: handlePageDragStart,
      onDrop: handleDatabaseDrop,
    }
  }

  return (
    <Collapsible asChild defaultOpen>
      <SidebarGroup>
        <div className="group/section-header relative">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              asChild
              className={cn(
                "group-hover/section-header:bg-sidebar-accent group-hover/section-header:text-sidebar-accent-foreground group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:bg-sidebar-accent group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:text-sidebar-accent-foreground",
                showCreateAction ? "pr-16" : "pr-9",
              )}
            >
              <button
                className="group/section-label w-full cursor-pointer"
                type="button"
              >
                <span>{label}</span>
                <ChevronRightIcon className="ml-1 size-3 transition-transform group-data-[state=open]/section-label:rotate-90" />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          {sidebarConfig && onSidebarConfigChange && onCustomizeSidebar ? (
            <SidebarSectionMenu
              className={showCreateAction ? "right-9" : "right-2"}
              config={sidebarConfig}
              onChange={onSidebarConfigChange}
              onCustomize={onCustomizeSidebar}
              sectionId={sectionId}
            />
          ) : null}
          {showCreateAction ? (
            <DropDrawer>
              <DropDrawerTrigger asChild>
                <SidebarGroupAction
                  aria-label="Create"
                  className="right-2 transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
                  title="Create"
                >
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
                {onImportNotion ? (
                  <DropDrawerItem
                    onSelect={() => {
                      onImportNotion()
                    }}
                  >
                    <UploadIcon className="text-muted-foreground" />
                    <span>Import Notion</span>
                  </DropDrawerItem>
                ) : null}
              </DropDrawerContent>
            </DropDrawer>
          ) : null}
        </div>
        <CollapsibleContent className="pt-0.5">
          <SidebarGroupContent>
            <SidebarMenu aria-label={`${label} pages`}>
              <SidebarNavList
                activeDatabaseId={activeDatabaseId}
                activeDatabaseViewId={activeDatabaseViewId}
                activePageId={activePageId}
                activeMeetingId={activeMeetingId}
                getLinkProps={getLinkProps}
                items={displayedPages}
                renderItemMenu={({ item }) =>
                  item.isDatabaseView || item.isMeeting
                    ? null
                    : <PageItemMenu item={item} />
                }
                storageKey={storageKey}
              />
              {displayedPages.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton className="text-sidebar-foreground/50">
                    <span>No pages</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              {displayedPages.length > 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="text-sidebar-foreground/70"
                  >
                    <Link
                      onClick={() => {
                        const view = getViewForSection(sectionId)
                        if (
                          sidebarConfig &&
                          onSidebarConfigChange &&
                          sidebarConfig.libraryView !== view
                        ) {
                          onSidebarConfigChange({
                            ...sidebarConfig,
                            libraryView: view,
                          })
                        }
                      }}
                      search={{
                        view: getViewForSection(sectionId),
                      }}
                      to="/recents"
                    >
                      <MoreHorizontalIcon />
                      <span>More</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

function getViewForSection(sectionId: SidebarSectionId) {
  if (sectionId === "favorites") return "favourites" as const
  return sectionId
}

function PageItemMenu({ item }: { item: SidebarNavItem }) {
  const workspaceId = useActiveWorkspaceId()
  const { isMobile } = useSidebar()
  const openInNewTab = useOpenInNewTab()
  const location = useLocation()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deletePage = useDeletePage()
  const deleteDatabase = useDeleteDatabase()
  const movePage = useMovePageToTeamspace()
  const { data: teamspaces = [] } = useTeamspaces(workspaceId)
  const activePageId = getActivePageId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const linkPath =
    (item.isDatabase || item.isDatabaseView) && item.databaseId
      ? `/d/${item.databaseId}`
      : `/p/${item.pageId}`
  const displayName = item.name.trim() || "Untitled"
  const isDeleting = deletePage.isPending || deleteDatabase.isPending

  const redirectIfDeleted = (result: {
    deletedDatabaseIds: string[]
    deletedPageIds: string[]
  }) => {
    const deletedActivePage =
      activePageId && result.deletedPageIds.includes(activePageId)
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
            error instanceof Error
              ? error.message
              : "Could not delete database.",
          )
        },
      })
      return
    }

    if (!item.pageId) {
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
          <SidebarNavItemAction variant="menu">
            <MoreHorizontalIcon />
            <span className="sr-only">More</span>
          </SidebarNavItemAction>
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
              openInNewTab({ href: linkPath, title: displayName })
            }}
          >
            <ArrowUpRightIcon className="text-muted-foreground" />
            <span>Open in New Tab</span>
          </DropDrawerItem>
          <OfflineAvailabilityAction
            databaseId={item.isDatabase ? item.databaseId : null}
            name={displayName}
            pageId={item.pageId}
            workspaceId={workspaceId}
          />
          {!item.isDatabase && !item.isDatabaseView && item.pageId ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <FolderInputIcon className="text-muted-foreground" />
                <span>Move to</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent>
                <DropDrawerItem
                  disabled={!item.teamspaceId || movePage.isPending}
                  onSelect={() => {
                    if (!workspaceId || !item.pageId) return
                    movePage.mutate(
                      { pageId: item.pageId, teamspaceId: null, workspaceId },
                      {
                        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not move page."),
                        onSuccess: () => toast.success("Moved to Private."),
                      },
                    )
                  }}
                >
                  <span>Private</span>
                </DropDrawerItem>
                {teamspaces
                  .filter((teamspace) => teamspace.currentUserRole)
                  .map((teamspace) => (
                    <DropDrawerItem
                      disabled={item.teamspaceId === teamspace.id || movePage.isPending}
                      key={teamspace.id}
                      onSelect={() => {
                        if (!workspaceId || !item.pageId) return
                        movePage.mutate(
                          { pageId: item.pageId, teamspaceId: teamspace.id, workspaceId },
                          {
                            onError: (error) => toast.error(error instanceof Error ? error.message : "Could not move page."),
                            onSuccess: () => toast.success(`Moved to ${teamspace.name}.`),
                          },
                        )
                      }}
                    >
                      <span>{teamspace.name}</span>
                    </DropDrawerItem>
                  ))}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
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
