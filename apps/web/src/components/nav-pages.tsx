import { useState, type DragEvent } from "react"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useDeleteDatabase } from "@zilobase/features/databases"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  useDeletePage,
  useConvertPageToTeamspace,
  useMovePageToTeamspace,
} from "@zilobase/features/pages"
import {
  useSetTeamspaceMembership,
  useTeamspaceLifecycle,
  useTeamspaces,
  type Teamspace,
} from "@zilobase/features/teamspaces"
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  Building2Icon,
  CopyIcon,
  DatabaseIcon,
  FileIcon,
  FolderInputIcon,
  HandIcon,
  Layers3Icon,
  LinkIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
} from "@/components/icons"
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
  getActivePageId,
  SidebarNavList,
  type SidebarNavItem,
} from "@/components/sidebar-nav-list"
import {
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
  SidebarNavItemAction,
} from "@/components/sidebar-nav-item-action"
import { useOpenInNewTab } from "@/components/desktop-tabs"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"
import { cn } from "@/lib/utils"
import { getApiErrorMessage } from "@/lib/api"
import { PageIconDisplay } from "@/lib/page-icon"
import { getTeamspaceSidebarPermissions } from "@/components/teamspace-sidebar-permissions"
import { OfflineAvailabilityAction } from "@/components/offline-availability-action"
import { SidebarSectionMenu } from "@/components/sidebar-section-menu"
import { useSidebarSectionOpen } from "@/components/sidebar-section-open-state"
import { getConfiguredSidebarItems } from "@/components/sidebar-section-items"
import {
  getLibraryViewForSection,
  SidebarLibraryLink,
} from "@/components/sidebar-library-link"
import type {
  LegacySidebarConfig,
  SidebarSectionId,
} from "@zilobase/features/user-settings"

export type { SidebarNavItem } from "@/components/sidebar-nav-list"

type DatabaseDropInput = {
  databaseId: string
  pageId: string
  targetPageId: string | null
  title?: string
}

export function NavPageSection({
  activeDatabaseId,
  activeDatabaseViewId,
  activePageId,
  activeMeetingId,
  databaseDropTargetId,
  label,
  teamspace,
  workspaceCanManage = false,
  workspaceId,
  onCreateDatabase,
  onCreatePage,
  onImportNotion,
  onDatabaseDropTargetChange,
  onDropPageOnDatabase,
  showCreateAction = false,
  pages,
  sectionId,
  sidebarConfig,
  sectionStorageKey,
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
  teamspace?: Teamspace
  workspaceCanManage?: boolean
  workspaceId?: string | null
  onCreateDatabase?: () => void
  onCreatePage?: () => void
  onImportNotion?: () => void
  onDatabaseDropTargetChange: (pageId: string | null) => void
  onDropPageOnDatabase?: (input: DatabaseDropInput) => void
  showCreateAction?: boolean
  pages: SidebarNavItem[]
  sectionId: SidebarSectionId
  sidebarConfig?: LegacySidebarConfig
  sectionStorageKey?: string
  onSidebarConfigChange?: (config: LegacySidebarConfig) => void
  onCustomizeSidebar?: () => void
  storageKey: string
}) {
  const [sectionOpen, setSectionOpen] = useSidebarSectionOpen(sectionStorageKey ?? `${storageKey}:section`)
  const displayedPages = sidebarConfig
    ? getConfiguredSidebarItems(pages, sectionId, sidebarConfig)
    : pages
  const showSectionMenu = Boolean(
    sidebarConfig && onSidebarConfigChange && onCustomizeSidebar,
  )
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
          ? "bg-accent text-accent-foreground ring-1 ring-ring"
          : undefined,
      draggable: !item.isDatabase && !item.isDatabaseView && !item.isMeeting,
      onDragEnter: handleDatabaseDragOver,
      onDragLeave: handleDatabaseDragLeave,
      onDragOver: handleDatabaseDragOver,
      onDragStart: handlePageDragStart,
      onDrop: handleDatabaseDrop,
    }
  }

  if (teamspace) {
    const icon =
      typeof teamspace.icon === "string" && teamspace.icon ? (
        <PageIconDisplay size="sm" value={teamspace.icon} />
      ) : (
        <Layers3Icon className="size-4 text-muted-foreground" />
      )

    return (
      <Collapsible
        asChild
        onOpenChange={setSectionOpen}
        open={sectionOpen}
      >
        <SidebarGroup className="py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="group/nav-row relative">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    className={cn(
                      "peer/menu-button pr-20 text-muted-foreground",
                      SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
                    )}
                    title={teamspace.name}
                    type="button"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden transition-opacity group-hover/nav-row:opacity-0 group-has-[>[data-nav-menu-action=disclosure]:focus-visible]/nav-row:opacity-0">
                      {icon}
                    </span>
                    <span className="min-w-0 truncate">{teamspace.name}</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleTrigger asChild>
                  <SidebarNavItemAction
                    position="start"
                    title={`${sectionOpen ? "Collapse" : "Expand"} ${teamspace.name}`}
                    type="button"
                    variant="disclosure"
                  >
                    <ChevronRightIcon />
                    <span className="sr-only">
                      {sectionOpen ? "Collapse" : "Expand"}{" "}
                      {teamspace.name}
                    </span>
                  </SidebarNavItemAction>
                </CollapsibleTrigger>
                <DropDrawer>
                  <DropDrawerTrigger asChild>
                    <SidebarNavItemAction
                      aria-label={`Create in ${teamspace.name}`}
                      style={{ right: "34px" }}
                      title={`Create in ${teamspace.name}`}
                      variant="menu"
                    >
                      <PlusIcon />
                    </SidebarNavItemAction>
                  </DropDrawerTrigger>
                  <DropDrawerContent align="end" className="w-44 rounded-lg">
                    <DropDrawerItem onSelect={() => onCreatePage?.()}>
                      <FileIcon className="text-muted-foreground" />
                      <span>Page</span>
                    </DropDrawerItem>
                    <DropDrawerItem onSelect={() => onCreateDatabase?.()}>
                      <DatabaseIcon className="text-muted-foreground" />
                      <span>Database</span>
                    </DropDrawerItem>
                  </DropDrawerContent>
                </DropDrawer>
                <TeamspaceActionsMenu
                  teamspace={teamspace}
                  workspaceCanManage={workspaceCanManage}
                  workspaceId={workspaceId}
                />
              </div>
              <CollapsibleContent className="pt-0.5">
                <SidebarMenu aria-label={`${label} pages`}>
                  <SidebarNavList
                    activeDatabaseId={activeDatabaseId}
                    activeDatabaseViewId={activeDatabaseViewId}
                    activeMeetingId={activeMeetingId}
                    activePageId={activePageId}
                    depthOffset={1}
                    getLinkProps={getLinkProps}
                    items={displayedPages}
                    renderItemMenu={({ item }) =>
                      item.isDatabaseView || item.isMeeting ? null : (
                        <PageItemMenu item={item} />
                      )
                    }
                    storageKey={storageKey}
                  />
                  {displayedPages.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton className="text-muted-foreground">
                        <span>No pages</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </Collapsible>
    )
  }

  return (
    <Collapsible asChild onOpenChange={setSectionOpen} open={sectionOpen}>
      <SidebarGroup className="group/collapsible">
        <div className="group/section-header relative">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              asChild
              className={cn(
                "group-hover/section-header:bg-accent group-hover/section-header:text-accent-foreground group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:bg-accent group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:text-accent-foreground",
                showCreateAction
                  ? showSectionMenu
                    ? "pr-24"
                    : "pr-16"
                  : showSectionMenu
                    ? "pr-16"
                    : "pr-9",
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
          <SidebarLibraryLink
            className={
              showCreateAction
                ? showSectionMenu
                  ? "right-16"
                  : "right-9"
                : showSectionMenu
                  ? "right-9"
                  : "right-2"
            }
            label={label}
            onSidebarConfigChange={onSidebarConfigChange}
            sectionId={sectionId}
            sidebarConfig={sidebarConfig}
          />
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
        <CollapsibleContent className="pb-4 pt-0.5">
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
                  <SidebarMenuButton className="text-muted-foreground">
                    <span>No pages</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              {displayedPages.length > 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="text-muted-foreground"
                  >
                    <Link
                      onClick={() => {
                        const view = getLibraryViewForSection(sectionId)
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
                        view: getLibraryViewForSection(sectionId),
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

function TeamspaceActionsMenu({
  teamspace,
  workspaceCanManage,
  workspaceId,
}: {
  teamspace: Teamspace
  workspaceCanManage: boolean
  workspaceId?: string | null
}) {
  const navigate = useNavigate()
  const membership = useSetTeamspaceMembership()
  const lifecycle = useTeamspaceLifecycle()
  const { canArchive, canInvite, canLeave, canManage } =
    getTeamspaceSidebarPermissions(teamspace, workspaceCanManage)
  const openSettings = (tab: "general" | "members") => {
    void navigate({
      search: { tab, teamspace: teamspace.id },
      to: "/settings/teamspaces",
    })
  }

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarNavItemAction
          aria-label={`${teamspace.name} options`}
          title={`${teamspace.name} options`}
          variant="menu"
        >
          <MoreHorizontalIcon />
        </SidebarNavItemAction>
      </DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-72 rounded-lg" side="right">
        <DropDrawerItem
          disabled={!canInvite}
          onSelect={() => openSettings("members")}
        >
          <UserPlusIcon />
          <span>Add members</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem
          disabled={!canManage}
          onSelect={() => openSettings("general")}
        >
          <SettingsIcon />
          <span>Teamspace settings</span>
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <CopyIcon />
          <span className="min-w-0">
            <span className="block">Duplicate teamspace</span>
            <span className="block text-xs leading-snug">
              Duplicates permissions and settings, but not pages or members
            </span>
          </span>
        </DropDrawerItem>
        <DropDrawerItem
          disabled={!canLeave || membership.isPending}
          onSelect={() => {
            if (!workspaceId) return
            membership.mutate(
              {
                action: "leave",
                teamspaceId: teamspace.id,
                workspaceId,
              },
              {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: () => toast.success(`Left ${teamspace.name}.`),
              },
            )
          }}
        >
          <HandIcon />
          <span>Leave teamspace</span>
        </DropDrawerItem>
        <DropDrawerItem
          disabled={!canArchive || lifecycle.isPending}
          onSelect={() => {
            if (!workspaceId) return
            lifecycle.mutate(
              {
                action: "archive",
                teamspaceId: teamspace.id,
                workspaceId,
              },
              {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: () => toast.success(`${teamspace.name} archived.`),
              },
            )
          }}
          variant="destructive"
        >
          <ArchiveIcon />
          <span>Archive teamspace</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
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
  const convertPage = useConvertPageToTeamspace()
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
                {!item.teamspaceId ? (
                  <>
                    <DropDrawerSeparator />
                    <DropDrawerItem
                      disabled={convertPage.isPending}
                      onSelect={() => {
                        if (!workspaceId || !item.pageId) return
                        convertPage.mutate(
                          { name: displayName, pageId: item.pageId, workspaceId },
                          {
                            onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create teamspace."),
                            onSuccess: () => toast.success("Page turned into a teamspace."),
                          },
                        )
                      }}
                    >
                      <Building2Icon />
                      <span>Turn into teamspace</span>
                    </DropDrawerItem>
                  </>
                ) : null}
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
