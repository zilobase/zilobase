import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"

import { AppSidebar } from "@/components/app-sidebar"
import { AppSearchProvider } from "@/components/app-search"
import {
  ChatSidebarPanel,
  ChatSidebarTrigger,
} from "@/components/chat-sidebar"
import { WorkspaceEditorRegistryProvider } from "@/contexts/workspace-editor-registry"
import {
  useWorkspaceSidePaneState,
  WorkspaceSidePaneContext,
  WorkspaceSidePaneHeaderCell,
  WorkspaceSidePaneShell,
} from "@/contexts/workspace-side-pane"
import { DiscussionsSidebarPanel } from "@/components/discussions-sidebar"
import {
  getRightSidebarEditorDefaultSize,
  getRightSidebarEditorMinSize,
  RightSidebarMobilePanels,
  RightSidebars,
} from "@/components/right-sidebars"
import { WorkspaceEditorCommentsProvider } from "@/components/workspace-editor-comments"

import {
  getDatabaseId,
  getWorkspaceId,
  WorkspacePaneHeader,
} from "@/components/workspace-pane-header"
import { SettingsSidebar } from "@/components/settings-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { isEmbeddedMobileViewer } from "@/lib/embedded-view"
import { useDatabase } from "@notelab/features/databases"
import { useWorkspace } from "@notelab/features/workspaces"
import { useUserSettings } from "@notelab/features/user-settings"
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog"
import {
  useOpenEmbeddedPage,
  useResolvedOpenPagesAs,
} from "@/hooks/use-open-embedded-page"

export function AppLayout({ children }: { children?: ReactNode }) {
  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const embeddedMobileViewer = isEmbeddedMobileViewer()
  const { isMobile, open: appSidebarOpen } = useSidebar()
  const isSettingsPage = pathname.startsWith("/settings")
  const isAiPage = pathname === "/ai"
  const workspaceId = getWorkspaceId(pathname)
  const databaseId = getDatabaseId(pathname)
  const { data: databasePayload } = useDatabase(databaseId)
  const hostWorkspaceId =
    workspaceId ?? databasePayload?.database.pageId ?? null
  const { data: hostWorkspace } = useWorkspace(hostWorkspaceId, {
    refetchOnMount: false,
  })
  const { data: userSettings } = useUserSettings()
  const openPagesAs = useResolvedOpenPagesAs(hostWorkspace, userSettings)
  const discussionsEnabled = Boolean(workspaceId && !databaseId)
  const sidePaneState = useWorkspaceSidePaneState(workspaceId)
  const {
    closeSidePane,
    openSidePane: openSidePaneBase,
    renderedSidePaneWorkspaceId,
    sidePaneAnimatedOpen,
    sidePaneWorkspaceId,
  } = sidePaneState
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [discussionsSidebarOpen, setDiscussionsSidebarOpen] = useState(false)
  const openRightPanelCount =
    (chatSidebarOpen ? 1 : 0) +
    (discussionsEnabled && discussionsSidebarOpen ? 1 : 0)
  const desktopRightPanelCount = isMobile ? 0 : openRightPanelCount
  const openSidePane = useCallback(
    (
      nextWorkspaceId: string,
      options?: { databaseId?: string | null },
    ) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false)
        setDiscussionsSidebarOpen(false)
      }

      openSidePaneBase(nextWorkspaceId, options)
    },
    [appSidebarOpen, openSidePaneBase],
  )
  const openChatSidebar = useCallback(() => {
    if (appSidebarOpen) {
      closeSidePane()
    }
    setChatSidebarOpen(true)
  }, [appSidebarOpen, closeSidePane])
  const sidePaneContext = useMemo(
    () => ({
      ...sidePaneState,
      openSidePane,
    }),
    [openSidePane, sidePaneState],
  )

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

  useEffect(() => {
    if (openPagesAs === "dialog" && sidePaneWorkspaceId) {
      closeSidePane()
    }
  }, [closeSidePane, openPagesAs, sidePaneWorkspaceId])

  const showSidePaneLayout =
    openPagesAs === "sidepanel" && renderedSidePaneWorkspaceId !== null

  return (
    <WorkspaceEditorRegistryProvider>
      <WorkspaceEditorCommentsProvider>
        <WorkspaceSidePaneContext.Provider value={sidePaneContext}>
          <EmbeddedPageDialogHost
            contextWorkspaceId={hostWorkspaceId}
            databaseId={databaseId}
            hostWorkspace={hostWorkspace}
            userSettings={userSettings}
          />
          {isSettingsPage ? (
            <SettingsSidebar />
          ) : (
            <AppSidebar />
          )}
          <ResizablePanelGroup
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            orientation="horizontal"
            style={{ height: "100svh" }}
          >
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={getRightSidebarEditorDefaultSize(
                desktopRightPanelCount,
              )}
              id="app-editor-pane"
              minSize={getRightSidebarEditorMinSize(desktopRightPanelCount)}
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <SidebarInset className="flex h-full min-h-0 flex-col overflow-hidden">
                <WorkspaceSidePaneShell
                  body={children ?? <Outlet />}
                  header={
                    embeddedMobileViewer ? undefined : (
                      <AppHeader
                        isSettingsPage={isSettingsPage || isAiPage}
                        onCloseSidePane={closeSidePane}
                        pathname={pathname}
                        renderedSidePaneWorkspaceId={
                          showSidePaneLayout
                            ? renderedSidePaneWorkspaceId
                            : null
                        }
                        sidePaneAnimatedOpen={
                          showSidePaneLayout && sidePaneAnimatedOpen
                        }
                      />
                    )
                  }
                  open={showSidePaneLayout && sidePaneAnimatedOpen}
                  visible={showSidePaneLayout}
                />
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

function EmbeddedPageDialogHost({
  contextWorkspaceId,
  databaseId,
  hostWorkspace,
  userSettings,
}: {
  contextWorkspaceId: string | null
  databaseId: string | null
  hostWorkspace: ReturnType<typeof useWorkspace>["data"]
  userSettings: ReturnType<typeof useUserSettings>["data"]
}) {
  const { openPage } = useOpenEmbeddedPage({
    contextWorkspaceId,
    databaseId,
    userSettings,
    workspace: hostWorkspace,
  })

  return <EmbeddedPageDialog onOpenPage={openPage} />
}

function AppHeader({
  isSettingsPage,
  onCloseSidePane,
  pathname,
  renderedSidePaneWorkspaceId,
  sidePaneAnimatedOpen,
}: {
  isSettingsPage: boolean
  onCloseSidePane: () => void
  pathname: string
  renderedSidePaneWorkspaceId: string | null
  sidePaneAnimatedOpen: boolean
}) {
  const showSidePaneHeader = renderedSidePaneWorkspaceId !== null
  const splitActive = showSidePaneHeader && sidePaneAnimatedOpen

  return (
    <>
      <WorkspaceSidePaneHeaderCell
        className="z-20"
        side="main"
        splitActive={splitActive}
      >
        <WorkspacePaneHeader
          bordered={false}
          className="min-w-0 flex-1"
          leadingControl={
            <MainPaneHeaderLeadingControl splitActive={splitActive} />
          }
          pathname={pathname}
          showActions={!isSettingsPage}
        />
      </WorkspaceSidePaneHeaderCell>
      {showSidePaneHeader ? (
        <WorkspaceSidePaneHeaderCell
          className="z-20"
          side="side"
          splitActive={splitActive}
        >
          <WorkspacePaneHeader
            bordered={false}
            className="min-w-0 flex-1"
            onClose={onCloseSidePane}
            pathname={`/workspace/${encodeURIComponent(renderedSidePaneWorkspaceId ?? "")}`}
          />
        </WorkspaceSidePaneHeaderCell>
      ) : null}
    </>
  )
}

function MainPaneHeaderLeadingControl({
  splitActive,
}: {
  splitActive: boolean
}) {
  const { isMobile, open, openMobile } = useSidebar()
  const isCollapsed = isMobile ? !openMobile : !open

  if (isCollapsed) {
    return <CollapsedSidebarTrigger />
  }

  if (splitActive) {
    return <div aria-hidden className="size-8 shrink-0" />
  }

  return null
}

function CollapsedSidebarTrigger() {
  const { isMobile, open, openMobile } = useSidebar()
  const isCollapsed = isMobile ? !openMobile : !open

  if (!isCollapsed) {
    return null
  }

  return (
    <>
      <SidebarTrigger className="shrink-0" />
      <Separator
        orientation="vertical"
        className="data-[orientation=vertical]:h-4"
      />
    </>
  )
}


