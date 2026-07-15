import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"

import { AppSidebar } from "@/components/app-sidebar"
import { AppSearchProvider } from "@/components/app-search"
import { ChatSidebarPanel, ChatSidebarTrigger } from "@/components/chat-sidebar"
import {
  usePageSidePaneState,
  PageSidePaneContext,
  PageSidePaneHeaderCell,
  PageSidePaneShell,
} from "@/contexts/page-side-pane"
import { DiscussionsSidebarPanel } from "@/components/discussions-sidebar"
import {
  getRightSidebarEditorDefaultSize,
  getRightSidebarEditorMinSize,
  RightSidebarMobilePanels,
  RightSidebars,
} from "@/components/right-sidebars"

import {
  getDatabaseId,
  getPageId,
  PagePaneHeader,
} from "@/components/page-pane-header"
import { SettingsSidebar } from "@/components/settings-sidebar"
import { Separator } from "@/components/ui/separator"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { isEmbeddedMobileViewer } from "@/lib/embedded-view"
import { useDatabase } from "@notelab/features/databases"
import { useRecordItemVisit, usePage } from "@notelab/features/pages"
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import { LayoutEditorProvider } from "@/components/layout-editor"
import { usePageEditorComments } from "@/components/page-editor-comments"
import { usePageCommentController } from "@/contexts/page-comments-registry"

export function AppLayout({
  children,
  utilitySidebar,
  utilitySidebarOpen = false,
}: {
  children?: ReactNode
  utilitySidebar?: ReactNode
  utilitySidebarOpen?: boolean
}) {
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
        <LayoutEditorProvider>
          <AppLayoutContent
            utilitySidebar={utilitySidebar}
            utilitySidebarOpen={utilitySidebarOpen}
          >
            {children}
          </AppLayoutContent>
        </LayoutEditorProvider>
      </AppSearchProvider>
    </SidebarProvider>
  )
}

function AppLayoutContent({
  children,
  utilitySidebar,
  utilitySidebarOpen,
}: {
  children?: ReactNode
  utilitySidebar?: ReactNode
  utilitySidebarOpen: boolean
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const embeddedMobileViewer = isEmbeddedMobileViewer()
  const { isMobile, open: appSidebarOpen } = useSidebar()
  const isSettingsPage = pathname.startsWith("/settings")
  const isAiPage = pathname === "/ai"
  const pageId = getPageId(pathname)
  const databaseId = getDatabaseId(pathname)
  const { data: databasePayload } = useDatabase(databaseId, {
    includeDeleted: true,
  })
  const hostPageId = pageId ?? databasePayload?.database.pageId ?? null
  const { data: hostPage } = usePage(hostPageId, {
    refetchOnMount: false,
  })
  const recordItemVisit = useRecordItemVisit()
  const recordedVisitKeyRef = useRef<string | null>(null)
  const discussionsEnabled = Boolean(pageId && !databaseId)
  const sidePaneState = usePageSidePaneState(pageId)
  const {
    closeSidePane,
    openDatabaseSidePane: openDatabaseSidePaneBase,
    openSidePane: openSidePaneBase,
    renderedSidePaneDatabaseId,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneDatabaseId,
    sidePanePageId,
  } = sidePaneState
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [discussionsSidebarOpen, setDiscussionsSidebarOpen] = useState(false)
  const { editorCommentsOpenRequest } = usePageEditorComments()
  const commentController = usePageCommentController(pageId)
  const openDiscussionsSidebar = useCallback(() => {
    if (appSidebarOpen) closeSidePane()
    setDiscussionsSidebarOpen(true)
  }, [appSidebarOpen, closeSidePane])

  useEffect(() => {
    if (!commentController) return
    commentController.setOpenThreadHandler(() => openDiscussionsSidebar())
    return () => commentController.setOpenThreadHandler(null)
  }, [commentController, openDiscussionsSidebar])

  useEffect(() => {
    if (editorCommentsOpenRequest > 0) {
      openDiscussionsSidebar()
    }
  }, [editorCommentsOpenRequest, openDiscussionsSidebar])
  const openRightPanelCount =
    (chatSidebarOpen ? 1 : 0) +
    (discussionsEnabled && discussionsSidebarOpen ? 1 : 0)
  const desktopRightPanelCount = isMobile ? 0 : openRightPanelCount
  const openSidePane = useCallback(
    (nextPageId: string, options?: { databaseId?: string | null }) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false)
        setDiscussionsSidebarOpen(false)
      }

      openSidePaneBase(nextPageId, options)
    },
    [appSidebarOpen, openSidePaneBase],
  )
  const openDatabaseSidePane = useCallback(
    (nextDatabaseId: string) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false)
        setDiscussionsSidebarOpen(false)
      }

      openDatabaseSidePaneBase(nextDatabaseId)
    },
    [appSidebarOpen, openDatabaseSidePaneBase],
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
      openDatabaseSidePane,
      openSidePane,
    }),
    [openDatabaseSidePane, openSidePane, sidePaneState],
  )

  useEffect(() => {
    if (databaseId) {
      setDiscussionsSidebarOpen(false)
    }
  }, [databaseId])

  useEffect(() => {
    const itemKind = databaseId ? "database" : pageId ? "page" : null
    const itemId = databaseId ?? pageId
    const workspaceId = databaseId
      ? databasePayload?.database.workspaceId
      : hostPage?.workspaceId

    if (!itemKind || !itemId || !workspaceId) {
      return
    }

    const visitKey = `${itemKind}:${itemId}:${workspaceId}`

    if (recordedVisitKeyRef.current === visitKey) {
      return
    }

    recordedVisitKeyRef.current = visitKey
    recordItemVisit.mutate({
      itemId,
      itemKind,
      workspaceId,
    })
  }, [
    databaseId,
    databasePayload?.database.workspaceId,
    hostPage?.workspaceId,
    recordItemVisit.mutate,
    pageId,
  ])

  useEffect(() => {
    if (
      appSidebarOpen &&
      (sidePanePageId || sidePaneDatabaseId) &&
      chatSidebarOpen
    ) {
      setChatSidebarOpen(false)
    }
  }, [appSidebarOpen, chatSidebarOpen, sidePaneDatabaseId, sidePanePageId])

  useEffect(() => {
    if (
      appSidebarOpen &&
      (sidePanePageId || sidePaneDatabaseId) &&
      discussionsSidebarOpen
    ) {
      setDiscussionsSidebarOpen(false)
    }
  }, [
    appSidebarOpen,
    discussionsSidebarOpen,
    sidePaneDatabaseId,
    sidePanePageId,
  ])

  const showSidePaneLayout =
    !utilitySidebarOpen &&
    Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)

  return (
    <PageSidePaneContext.Provider value={sidePaneContext}>
      <EmbeddedPageDialogHost
        contextPageId={hostPageId}
        databaseId={databaseId}
        hostPage={hostPage}
      />
      {isSettingsPage ? <SettingsSidebar /> : <AppSidebar />}
      <ResizablePanelGroup
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        orientation="horizontal"
        style={{ height: "100svh" }}
      >
        <ResizablePanel
          className="min-h-0 min-w-0"
          defaultSize={getRightSidebarEditorDefaultSize(desktopRightPanelCount)}
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
            <PageSidePaneShell
              body={children ?? <Outlet />}
              header={
                embeddedMobileViewer ? undefined : (
                  <AppHeader
                    isSettingsPage={isSettingsPage || isAiPage}
                    onOpenDiscussions={discussionsEnabled ? openDiscussionsSidebar : undefined}
                    onCloseSidePane={closeSidePane}
                    pathname={pathname}
                    renderedSidePanePageId={
                      showSidePaneLayout ? renderedSidePanePageId : null
                    }
                    renderedSidePaneDatabaseId={
                      showSidePaneLayout ? renderedSidePaneDatabaseId : null
                    }
                    sidePaneAnimatedOpen={
                      showSidePaneLayout && sidePaneAnimatedOpen
                    }
                    sidePaneDatabaseId={sidePaneDatabaseId}
                  />
                )
              }
              open={showSidePaneLayout && sidePaneAnimatedOpen}
              visible={showSidePaneLayout}
            />
          </SidebarInset>
        </ResizablePanel>
        {utilitySidebarOpen && utilitySidebar ? (
          <ResizablePanel
            className="min-h-0 min-w-0 border-l border-border"
            defaultSize="320px"
            id="app-utility-sidebar"
            maxSize="320px"
            minSize="320px"
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <aside
              aria-label="View settings sidebar"
              className="h-full min-h-0 w-full overflow-hidden bg-background text-foreground"
            >
              {utilitySidebar}
            </aside>
          </ResizablePanel>
        ) : null}
        <RightSidebars
          chatOpen={chatSidebarOpen}
          chatPanel={
            <ChatSidebarPanel
              databaseId={databaseId}
              onClose={() => setChatSidebarOpen(false)}
              open={chatSidebarOpen}
              pageId={pageId}
            />
          }
          discussionsEnabled={discussionsEnabled}
          discussionsOpen={discussionsSidebarOpen}
          discussionsPanel={
            discussionsEnabled ? (
              <DiscussionsSidebarPanel
                onClose={() => setDiscussionsSidebarOpen(false)}
                open={discussionsSidebarOpen}
                pageId={pageId}
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
            open={chatSidebarOpen}
            pageId={pageId}
          />
        }
        discussionsEnabled={discussionsEnabled}
        discussionsOpen={discussionsSidebarOpen}
        discussionsPanel={
          discussionsEnabled ? (
            <DiscussionsSidebarPanel
              onClose={() => setDiscussionsSidebarOpen(false)}
              open={discussionsSidebarOpen}
              pageId={pageId}
            />
          ) : undefined
        }
      />
      {chatSidebarOpen ? null : (
        <ChatSidebarTrigger
          discussionsSidebarOpen={discussionsEnabled && discussionsSidebarOpen}
          onOpen={openChatSidebar}
        />
      )}
    </PageSidePaneContext.Provider>
  )
}

function EmbeddedPageDialogHost({
  contextPageId,
  databaseId,
  hostPage,
}: {
  contextPageId: string | null
  databaseId: string | null
  hostPage: ReturnType<typeof usePage>["data"]
}) {
  const { openPage } = useOpenEmbeddedPage({
    contextPageId,
    databaseId,
    page: hostPage,
  })

  return <EmbeddedPageDialog onOpenPage={openPage} />
}

function AppHeader({
  isSettingsPage,
  onOpenDiscussions,
  onCloseSidePane,
  pathname,
  renderedSidePaneDatabaseId,
  renderedSidePanePageId,
  sidePaneAnimatedOpen,
  sidePaneDatabaseId,
}: {
  isSettingsPage: boolean
  onOpenDiscussions?: () => void
  onCloseSidePane: () => void
  pathname: string
  renderedSidePaneDatabaseId: string | null
  renderedSidePanePageId: string | null
  sidePaneAnimatedOpen: boolean
  sidePaneDatabaseId: string | null
}) {
  const showSidePaneHeader = Boolean(
    renderedSidePanePageId || renderedSidePaneDatabaseId,
  )
  const splitActive = showSidePaneHeader && sidePaneAnimatedOpen
  const sidePanePathname = renderedSidePaneDatabaseId
    ? `/d/${encodeURIComponent(renderedSidePaneDatabaseId)}`
    : `/p/${encodeURIComponent(renderedSidePanePageId ?? "")}`
  const routeDatabaseId = getDatabaseId(pathname)
  const rowNavigationDatabaseId = renderedSidePanePageId
    ? (sidePaneDatabaseId ?? routeDatabaseId)
    : null

  return (
    <>
      <PageSidePaneHeaderCell
        className="z-20"
        side="main"
        splitActive={splitActive}
      >
        <PagePaneHeader
          bordered={false}
          className="min-w-0 flex-1"
          leadingControl={
            <MainPaneHeaderLeadingControl splitActive={splitActive} />
          }
          pathname={pathname}
          onOpenDiscussions={onOpenDiscussions}
          showActions={!isSettingsPage}
        />
      </PageSidePaneHeaderCell>
      {showSidePaneHeader ? (
        <PageSidePaneHeaderCell
          className="z-20"
          side="side"
          splitActive={splitActive}
        >
          <PagePaneHeader
            bordered={false}
            className="min-w-0 flex-1"
            onClose={onCloseSidePane}
            pathname={sidePanePathname}
            rowNavigationDatabaseId={rowNavigationDatabaseId}
          />
        </PageSidePaneHeaderCell>
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
