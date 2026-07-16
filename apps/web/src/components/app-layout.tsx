import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { PanelRightIcon, XIcon } from "lucide-react"

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
  RightSidebarMobilePanels,
  RightSidebars,
} from "@/components/right-sidebars"
import {
  getRightSidebarEditorDefaultSize,
  getRightSidebarEditorMinSize,
  type SidebarResizeIntent,
} from "@/components/sidebar-panel-sizing"

import {
  getDatabaseId,
  getPageId,
  PagePaneHeader,
} from "@/components/page-pane-header"
import { SettingsSidebar } from "@/components/settings-sidebar"
import { Separator } from "@/components/ui/separator"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { isEmbeddedMobileViewer } from "@/lib/embedded-view"
import { useDatabase } from "@notelab/features/databases"
import {
  usePage,
  useRecordItemVisit,
} from "@notelab/features/pages"
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import { LayoutEditorProvider } from "@/components/layout-editor"
import { usePageEditorComments } from "@/components/page-editor-comments"
import { usePageCommentController } from "@/contexts/page-comments-registry"
import {
  PageLayoutSidebarProvider,
  useOptionalPageLayoutSidebar,
} from "@/contexts/page-layout-sidebar"
import { Button } from "@/components/ui/button"

export function AppLayout({
  children,
  utilitySidebar,
  utilitySidebarOpen = false,
}: {
  children?: ReactNode
  utilitySidebar?: ReactNode
  utilitySidebarOpen?: boolean
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

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
        <PageLayoutSidebarProvider
          key={getPageId(pathname) ?? pathname}
          pageId={getPageId(pathname)}
        >
          <LayoutEditorProvider>
            <AppLayoutContent
              utilitySidebar={utilitySidebar}
              utilitySidebarOpen={utilitySidebarOpen}
            >
              {children}
            </AppLayoutContent>
          </LayoutEditorProvider>
        </PageLayoutSidebarProvider>
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
  const {
    isMobile,
    open: appSidebarOpen,
    setOpen: setAppSidebarOpen,
  } = useSidebar()
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
  const pageLayoutSidebar = useOptionalPageLayoutSidebar()
  const pageLayoutSidebarOpen = Boolean(
    pageLayoutSidebar?.hasSidebar && pageLayoutSidebar.open,
  )
  const { editorCommentsOpenRequest } = usePageEditorComments()
  const commentController = usePageCommentController(pageId)
  const openDiscussionsSidebar = useCallback(() => {
    if (!discussionsEnabled) return
    if (appSidebarOpen) closeSidePane()
    pageLayoutSidebar?.setOpen(false)
    setDiscussionsSidebarOpen(true)
  }, [
    appSidebarOpen,
    closeSidePane,
    discussionsEnabled,
    pageLayoutSidebar,
  ])
  const toggleDiscussionsSidebar = useCallback(() => {
    if (!discussionsEnabled) return

    if (discussionsSidebarOpen) {
      setDiscussionsSidebarOpen(false)
      return
    }

    openDiscussionsSidebar()
  }, [
    discussionsEnabled,
    discussionsSidebarOpen,
    openDiscussionsSidebar,
  ])

  useEffect(() => {
    if (!discussionsEnabled) setDiscussionsSidebarOpen(false)
  }, [discussionsEnabled])

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
  const primaryRightPanelOpen = Boolean(
    (utilitySidebarOpen && utilitySidebar) ||
      pageLayoutSidebarOpen ||
      (discussionsEnabled && discussionsSidebarOpen),
  )
  const desktopRightPanelCount = isMobile
    ? 0
    : Number(chatSidebarOpen) + Number(primaryRightPanelOpen)
  const handleRightSidebarResizeIntent = useCallback(
    (intent: SidebarResizeIntent) => {
      if (isMobile) return
      const nextOpen = intent === "decrease"
      if (appSidebarOpen !== nextOpen) setAppSidebarOpen(nextOpen)
    },
    [appSidebarOpen, isMobile, setAppSidebarOpen],
  )
  const openSidePane = useCallback(
    (nextPageId: string, options?: { databaseId?: string | null }) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false)
        setDiscussionsSidebarOpen(false)
      }

      pageLayoutSidebar?.setOpen(false)

      openSidePaneBase(nextPageId, options)
    },
    [appSidebarOpen, openSidePaneBase, pageLayoutSidebar],
  )
  const openDatabaseSidePane = useCallback(
    (nextDatabaseId: string) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false)
        setDiscussionsSidebarOpen(false)
      }

      pageLayoutSidebar?.setOpen(false)

      openDatabaseSidePaneBase(nextDatabaseId)
    },
    [appSidebarOpen, openDatabaseSidePaneBase, pageLayoutSidebar],
  )
  const openChatSidebar = useCallback(() => {
    if (appSidebarOpen) {
      closeSidePane()
    }
    setChatSidebarOpen(true)
  }, [appSidebarOpen, closeSidePane])

  const togglePageLayoutSidebar = useCallback(() => {
    if (!pageLayoutSidebar?.hasSidebar) return

    const nextOpen = !pageLayoutSidebar.open
    if (nextOpen) {
      closeSidePane()
      setDiscussionsSidebarOpen(false)
    }
    pageLayoutSidebar.setOpen(nextOpen)
  }, [closeSidePane, pageLayoutSidebar])
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
    !pageLayoutSidebarOpen &&
    Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)
  const pageSidebarPanel = pageLayoutSidebar?.hasSidebar ? (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <PanelRightIcon className="size-4 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          Page sidebar
        </h2>
        <Button
          aria-label="Close page sidebar"
          onClick={() => pageLayoutSidebar?.setOpen(false)}
          size="icon-sm"
          title="Close page sidebar"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        ref={pageLayoutSidebar?.setPanelTarget}
      />
    </div>
  ) : undefined
  const chatPanel = (
    <ChatSidebarPanel
      databaseId={databaseId}
      onClose={() => setChatSidebarOpen(false)}
      open={chatSidebarOpen}
      pageId={pageId}
    />
  )
  const discussionsPanel = discussionsEnabled ? (
    <DiscussionsSidebarPanel
      onClose={() => setDiscussionsSidebarOpen(false)}
      open={discussionsSidebarOpen}
      pageId={pageId}
    />
  ) : undefined

  return (
    <PageSidePaneContext.Provider value={sidePaneContext}>
      <EmbeddedPageDialogHost
        contextPageId={hostPageId}
        databaseId={databaseId}
        hostPage={hostPage}
      />
      <PageLayoutOverlayDrawer />
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
                    discussionsOpen={discussionsSidebarOpen}
                    isSettingsPage={isSettingsPage || isAiPage}
                    onToggleDiscussions={
                      discussionsEnabled ? toggleDiscussionsSidebar : undefined
                    }
                    onTogglePageSidebar={
                      pageLayoutSidebar?.hasSidebar
                        ? togglePageLayoutSidebar
                        : undefined
                    }
                    pageSidebarOpen={pageLayoutSidebarOpen}
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
        <RightSidebars
          chatOpen={chatSidebarOpen}
          chatPanel={chatPanel}
          discussionsEnabled={discussionsEnabled}
          discussionsOpen={discussionsSidebarOpen}
          discussionsPanel={discussionsPanel}
          isMobile={isMobile}
          navigationSidebarOpen={appSidebarOpen}
          pageSidebarOpen={pageLayoutSidebarOpen}
          pageSidebarPanel={pageSidebarPanel}
          onResizeIntent={handleRightSidebarResizeIntent}
          utilitySidebarOpen={utilitySidebarOpen}
          utilitySidebarPanel={utilitySidebar}
        />
      </ResizablePanelGroup>
      <RightSidebarMobilePanels
        chatOpen={chatSidebarOpen}
        chatPanel={chatPanel}
        discussionsEnabled={discussionsEnabled}
        discussionsOpen={discussionsSidebarOpen}
        discussionsPanel={discussionsPanel}
        isMobile={isMobile}
        pageSidebarOpen={pageLayoutSidebarOpen}
        pageSidebarPanel={pageSidebarPanel}
      />
      {chatSidebarOpen ? null : (
        <ChatSidebarTrigger
          adjacentSidebarOpen={
            utilitySidebarOpen ||
            pageLayoutSidebarOpen ||
            (discussionsEnabled && discussionsSidebarOpen)
          }
          onOpen={openChatSidebar}
        />
      )}
    </PageSidePaneContext.Provider>
  )
}

function PageLayoutOverlayDrawer() {
  const pageLayoutSidebar = useOptionalPageLayoutSidebar()
  const open = Boolean(pageLayoutSidebar?.overlayPageId)

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) pageLayoutSidebar?.closeOverlay()
      }}
      open={open}
    >
      <SheetContent
        className="z-[60] w-[min(100vw,var(--right-sidebar-panel-width))] gap-0 p-0 sm:max-w-[var(--right-sidebar-panel-width)]"
        overlayClassName="z-[59]"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Page sidebar</SheetTitle>
          <SheetDescription className="sr-only">
            Customized page properties and layout modules.
          </SheetDescription>
        </SheetHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          ref={pageLayoutSidebar?.setOverlayPanelTarget}
        />
      </SheetContent>
    </Sheet>
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
  discussionsOpen,
  isSettingsPage,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  onCloseSidePane,
  pathname,
  renderedSidePaneDatabaseId,
  renderedSidePanePageId,
  sidePaneAnimatedOpen,
  sidePaneDatabaseId,
}: {
  discussionsOpen: boolean
  isSettingsPage: boolean
  onToggleDiscussions?: () => void
  onTogglePageSidebar?: () => void
  pageSidebarOpen?: boolean
  onCloseSidePane: () => void
  pathname: string
  renderedSidePaneDatabaseId: string | null
  renderedSidePanePageId: string | null
  sidePaneAnimatedOpen: boolean
  sidePaneDatabaseId: string | null
}) {
  const pageLayoutSidebar = useOptionalPageLayoutSidebar()
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
  const sidePaneHasLayoutSidebar =
    pageLayoutSidebar?.hasOverlaySidebar(renderedSidePanePageId) ?? false

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
          discussionsOpen={discussionsOpen}
          pathname={pathname}
          onToggleDiscussions={onToggleDiscussions}
          onTogglePageSidebar={onTogglePageSidebar}
          pageSidebarOpen={pageSidebarOpen}
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
            onTogglePageSidebar={
              renderedSidePanePageId && sidePaneHasLayoutSidebar
                ? () => pageLayoutSidebar?.toggleOverlay(renderedSidePanePageId)
                : undefined
            }
            pageSidebarOpen={
              pageLayoutSidebar?.overlayPageId === renderedSidePanePageId
            }
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
