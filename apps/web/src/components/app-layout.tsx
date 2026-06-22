import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { AppSearchProvider } from "@/components/app-search"
import {
  ChatSidebarPanel,
  ChatSidebarTrigger,
} from "@/components/chat-sidebar"
import { WorkspaceEditorRegistryProvider } from "@/contexts/workspace-editor-registry"
import {
  getWorkspaceSidePaneWidthClass,
  WorkspaceSidePaneContext,
  type WorkspaceSidePaneContextValue,
} from "@/contexts/workspace-side-pane"
import { DiscussionsSidebarPanel } from "@/components/discussions-sidebar"
import {
  getRightSidebarEditorDefaultSize,
  getRightSidebarEditorMinSize,
  RightSidebarMobilePanels,
  RightSidebars,
} from "@/components/right-sidebars"
import { WorkspaceEditorCommentsProvider } from "@/components/workspace-editor-comments"
import { useActiveOrganizationId } from "@notelab/features/integrations"
import { NavActions } from "@/components/nav-actions"
import { HistorySidebar } from "@/components/history-sidebar"
import { SettingsSidebar } from "@/components/settings-sidebar"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { isEmbeddedMobileViewer } from "@/lib/embedded-view"
import {
  getWorkspaceEmoji,
  readParentItemId,
  type Workspace,
} from "@notelab/features/workspaces"
import { useWorkspaces } from "@notelab/features/workspaces"
import { useDatabase } from "@notelab/features/databases"

export function AppLayout({ children }: { children?: ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          "--app-sidebar-panel-width": "18rem",
          "--right-sidebar-panel-width": "24rem",
          "--sidebar-width": "var(--app-sidebar-panel-width)",
        } as React.CSSProperties
      }
    >
      <AppSearchProvider>
        <AppLayoutContent>{children}</AppLayoutContent>
      </AppSearchProvider>
    </SidebarProvider>
  )
}

function AppLayoutContent({ children }: { children?: ReactNode }) {
  const location = useLocation()
  const embeddedMobileViewer = isEmbeddedMobileViewer()
  const { isMobile, open: appSidebarOpen } = useSidebar()
  const isSettingsPage = location.pathname.startsWith("/settings")
  const isAiPage = location.pathname === "/ai"
  const workspaceId = getWorkspaceId(location.pathname)
  const databaseId = getDatabaseId(location.pathname)
  const discussionsEnabled = Boolean(workspaceId && !databaseId)
  const [sidePaneWorkspaceId, setSidePaneWorkspaceId] = useState<string | null>(
    null,
  )
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [discussionsSidebarOpen, setDiscussionsSidebarOpen] = useState(false)
  const openRightPanelCount =
    (chatSidebarOpen ? 1 : 0) +
    (discussionsEnabled && discussionsSidebarOpen ? 1 : 0)
  const desktopRightPanelCount = isMobile ? 0 : openRightPanelCount
  const closeSidePane = useCallback(() => {
    setSidePaneWorkspaceId(null)
  }, [])
  const openSidePane = useCallback((nextWorkspaceId: string) => {
    if (appSidebarOpen) {
      setChatSidebarOpen(false)
      setDiscussionsSidebarOpen(false)
    }

    setSidePaneWorkspaceId(nextWorkspaceId)
  }, [appSidebarOpen])
  const openChatSidebar = useCallback(() => {
    if (appSidebarOpen) {
      closeSidePane()
    }
    setChatSidebarOpen(true)
  }, [appSidebarOpen, closeSidePane])
  const openDiscussionsSidebar = useCallback(() => {
    if (appSidebarOpen) {
      closeSidePane()
    }
    setDiscussionsSidebarOpen(true)
  }, [appSidebarOpen, closeSidePane])
  const sidePaneContext = useMemo<WorkspaceSidePaneContextValue>(
    () => ({
      closeSidePane,
      openSidePane,
      sidePaneWorkspaceId,
    }),
    [closeSidePane, openSidePane, sidePaneWorkspaceId],
  )

  useEffect(() => {
    closeSidePane()
  }, [closeSidePane, workspaceId])

  useEffect(() => {
    if (databaseId) {
      setDiscussionsSidebarOpen(false)
    }
  }, [databaseId])

  useEffect(() => {
    if (appSidebarOpen && sidePaneWorkspaceId && chatSidebarOpen) {
      setChatSidebarOpen(false)
    }
  }, [appSidebarOpen, chatSidebarOpen, sidePaneWorkspaceId])

  useEffect(() => {
    if (appSidebarOpen && sidePaneWorkspaceId && discussionsSidebarOpen) {
      setDiscussionsSidebarOpen(false)
    }
  }, [appSidebarOpen, discussionsSidebarOpen, sidePaneWorkspaceId])

  return (
    <WorkspaceEditorRegistryProvider>
      <WorkspaceEditorCommentsProvider>
        <WorkspaceSidePaneContext.Provider value={sidePaneContext}>
          {isSettingsPage ? (
            <SettingsSidebar />
          ) : isAiPage ? (
            <HistorySidebar />
          ) : (
            <AppSidebar />
          )}
          <ResizablePanelGroup
            className="min-w-0 flex-1"
            orientation="horizontal"
          >
            <ResizablePanel
              className="min-w-0"
              defaultSize={getRightSidebarEditorDefaultSize(
                desktopRightPanelCount,
              )}
              id="app-editor-pane"
              minSize={getRightSidebarEditorMinSize(desktopRightPanelCount)}
            >
              <SidebarInset className="h-svh overflow-hidden">
                {embeddedMobileViewer ? null : (
                  <AppHeader
                    isSettingsPage={isSettingsPage || isAiPage}
                    onCloseSidePane={closeSidePane}
                    onOpenDiscussions={
                      discussionsEnabled ? openDiscussionsSidebar : undefined
                    }
                    pathname={location.pathname}
                    sidePaneWorkspaceId={sidePaneWorkspaceId}
                  />
                )}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {children ?? <Outlet />}
                </div>
              </SidebarInset>
            </ResizablePanel>
            <RightSidebars
              chatOpen={chatSidebarOpen}
              chatPanel={
                <ChatSidebarPanel
                  databaseId={databaseId}
                  onClose={() => setChatSidebarOpen(false)}
                  workspaceId={workspaceId}
                />
              }
              discussionsEnabled={discussionsEnabled}
              discussionsOpen={discussionsSidebarOpen}
              discussionsPanel={
                discussionsEnabled ? (
                  <DiscussionsSidebarPanel
                    onClose={() => setDiscussionsSidebarOpen(false)}
                    open={discussionsSidebarOpen}
                    workspaceId={workspaceId}
                  />
                ) : undefined
              }
            />
          </ResizablePanelGroup>
          <RightSidebarMobilePanels
            chatOpen={chatSidebarOpen}
            chatPanel={
              <ChatSidebarPanel
                databaseId={databaseId}
                onClose={() => setChatSidebarOpen(false)}
                workspaceId={workspaceId}
              />
            }
            discussionsEnabled={discussionsEnabled}
            discussionsOpen={discussionsSidebarOpen}
            discussionsPanel={
              discussionsEnabled ? (
                <DiscussionsSidebarPanel
                  onClose={() => setDiscussionsSidebarOpen(false)}
                  open={discussionsSidebarOpen}
                  workspaceId={workspaceId}
                />
              ) : undefined
            }
          />
          {chatSidebarOpen ? null : (
            <ChatSidebarTrigger
              discussionsSidebarOpen={
                discussionsEnabled && discussionsSidebarOpen
              }
              onOpen={openChatSidebar}
            />
          )}
        </WorkspaceSidePaneContext.Provider>
      </WorkspaceEditorCommentsProvider>
    </WorkspaceEditorRegistryProvider>
  )
}

function AppHeader({
  isSettingsPage,
  onCloseSidePane,
  onOpenDiscussions,
  pathname,
  sidePaneWorkspaceId,
}: {
  isSettingsPage: boolean
  onCloseSidePane: () => void
  onOpenDiscussions?: () => void
  pathname: string
  sidePaneWorkspaceId: string | null
}) {
  return (
    <header className="relative z-20 flex h-12 shrink-0 bg-background">
      <PaneHeaderContent
        className="min-w-0 flex-1"
        leadingControl={null}
        onOpenDiscussions={onOpenDiscussions}
        pathname={pathname}
        showActions={!isSettingsPage}
      />
      {sidePaneWorkspaceId ? (
        <PaneHeaderContent
          className={cn(
            "animate-in slide-in-from-right-8 absolute inset-0 z-10 bg-background duration-200 md:static md:z-auto md:border-l",
            getWorkspaceSidePaneWidthClass(),
          )}
          leadingControl={
            <Button
              aria-label="Close side pane"
              onClick={onCloseSidePane}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowRight />
            </Button>
          }
          onOpenDiscussions={onOpenDiscussions}
          pathname={`/workspace/${encodeURIComponent(sidePaneWorkspaceId)}`}
          showActions
        />
      ) : null}
    </header>
  )
}

function PaneHeaderContent({
  className,
  leadingControl,
  onOpenDiscussions,
  pathname,
  showActions,
}: {
  className?: string
  leadingControl: ReactNode | null
  onOpenDiscussions?: () => void
  pathname: string
  showActions: boolean
}) {
  return (
    <div className={`${className ?? ""} flex items-center gap-2`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {leadingControl ? (
          <>
            {leadingControl}
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
          </>
        ) : null}
        <AppBreadcrumbs pathname={pathname} />
      </div>
      {showActions ? (
        <div className="ml-auto px-3">
          <PaneNavActions onOpenDiscussions={onOpenDiscussions} pathname={pathname} />
        </div>
      ) : null}
    </div>
  )
}

function PaneNavActions({ onOpenDiscussions, pathname }: { onOpenDiscussions?: () => void; pathname: string }) {
  const workspaceId = getWorkspaceId(pathname)
  const databaseId = getDatabaseId(pathname)

  return (
    <NavActions
      databaseId={databaseId}
      onOpenDiscussions={onOpenDiscussions}
      pathname={pathname}
      workspaceId={workspaceId}
    />
  )
}

function WorkspaceBreadcrumb({ workspaceId }: { workspaceId: string }) {
  const organizationId = useActiveOrganizationId()
  const { data: workspaces = [] } = useWorkspaces(organizationId)
  const workspace = workspaces.find((item) => item.id === workspaceId)
  const breadcrumbs = workspace
    ? buildWorkspaceBreadcrumbs(workspace, workspaces)
    : []

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((item, index) => {
            const isCurrent = index === breadcrumbs.length - 1
            const label = getWorkspaceBreadcrumbLabel(item)

            return (
              <BreadcrumbFragment
                isCurrent={isCurrent}
                item={item}
                key={item.id}
                label={label}
              />
            )
          })
        ) : (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
              Workspace
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function BreadcrumbFragment({
  isCurrent,
  item,
  label,
}: {
  isCurrent: boolean
  item: Workspace
  label: string
}) {
  return (
    <>
      <BreadcrumbItem className="min-w-0">
        {isCurrent ? (
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {label}
          </BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild className="block max-w-32 truncate sm:max-w-48">
            <Link to="/workspace/$workspaceId" params={{ workspaceId: item.id }}>
              {label}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
      {!isCurrent ? <BreadcrumbSeparator /> : null}
    </>
  )
}

function buildWorkspaceBreadcrumbs(
  workspace: Workspace,
  workspaces: Workspace[],
) {
  const workspacesById = new Map(
    [...workspaces, workspace].map((item) => [item.id, item]),
  )
  const breadcrumbs: Workspace[] = []
  const visited = new Set<string>()
  let current: Workspace | undefined = workspace

  while (current && !visited.has(current.id)) {
    breadcrumbs.unshift(current)
    visited.add(current.id)

    const parentItemId = readParentItemId(current.metadata)

    current = parentItemId ? workspacesById.get(parentItemId) : undefined
  }

  return breadcrumbs
}

function getWorkspaceBreadcrumbLabel(workspace: Workspace) {
  const label = workspace.name.trim() || "Untitled"
  const emoji = getWorkspaceEmoji(workspace)

  return emoji ? `${emoji} ${label}` : label
}

function AppBreadcrumbs({ pathname }: { pathname: string }) {
  const workspaceId = getWorkspaceId(pathname)
  const databaseId = getDatabaseId(pathname)

  if (workspaceId) {
    return <WorkspaceBreadcrumb workspaceId={workspaceId} />
  }

  if (databaseId) {
    return <DatabaseBreadcrumb databaseId={databaseId} />
  }

  if (pathname.startsWith("/settings")) {
    const settingsPageTitle = getSettingsPageTitle(pathname)

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink asChild>
              <Link to="/settings">Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {settingsPageTitle && (
            <>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">
                  {settingsPageTitle}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (pathname === "/canvas") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Canvas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage className="line-clamp-1">Dashboard</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function getWorkspaceId(pathname: string) {
  const match = pathname.match(/^\/workspace\/([^/]+)/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function getDatabaseId(pathname: string) {
  const match = pathname.match(/^\/database\/([^/]+)/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function DatabaseBreadcrumb({ databaseId }: { databaseId: string }) {
  const organizationId = useActiveOrganizationId()
  const { data: payload } = useDatabase(databaseId)
  const databasePageId = payload?.database.pageId
  const { data: workspaces = [] } = useWorkspaces(organizationId)
  const workspace = databasePageId
    ? workspaces.find((item) => item.id === databasePageId)
    : undefined
  const breadcrumbs = workspace
    ? buildWorkspaceBreadcrumbs(workspace, workspaces)
    : []

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        {breadcrumbs.map((item) => (
          <BreadcrumbFragment
            isCurrent={false}
            item={item}
            key={item.id}
            label={getWorkspaceBreadcrumbLabel(item)}
          />
        ))}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {payload?.database.name.trim() || "Database"}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function getSettingsPageTitle(pathname: string) {
  const pathParts = pathname.split("/").filter(Boolean)
  const page = pathParts[1]

  if (!page) {
    return null
  }

  const titles: Record<string, string> = {
    integrations: "Integrations",
    "notelab-ai": "Notelab AI",
    organization: "Organization",
    profile: "Profile",
    team: "Team",
  }

  return titles[page] ?? null
}
