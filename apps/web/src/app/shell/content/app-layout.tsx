import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, ReactNode, SetStateAction } from "react"
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { ChevronsRightIcon, SidebarSimpleIcon } from "@/shared/components/icons"

import { AppSidebar } from "@/features/sidebar"
import { AppSearchProvider } from "@/features/sidebar"
import {
  DesktopTabs,
  getDesktopTabTitle,
} from "@/features/desktop/components/index"
import {
  ChatSidebarPanel,
  ChatSidebarTrigger,
  type ChatPresentationMode,
} from "@/features/ai/components/index"
import {
  usePageSidePaneState,
  PageSidePaneContext,
  PageSidePaneHeaderCell,
  PageSidePaneShell,
} from "@/features/pages/context/index"
import { DiscussionsSidebarPanel } from "@/features/comments/index"
import {
  RightSidebarMobilePanels,
  RightSidebars,
} from "@/app/shell/side-panel/right-sidebars"
import {
  APP_SIDEBAR_PANEL_WIDTH,
  getRightSidebarEditorDefaultSize,
  type SidebarResizeIntent,
} from "@/features/sidebar"

import {
  getDatabaseId,
  PagePaneHeader,
  useRoutePageId,
} from "@/features/pages/components/index"
import {
  ApiKeysSettingsPage,
  getSettingsSection,
  PreferencesSettingsPage,
  ProfileSettingsPage,
  SettingsDialog,
  type SettingsSection,
  ZilobaseAiSettingsPage,
} from "@/features/settings"
import { Separator } from "@/shared/ui/separator"
import { ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/shared/ui/sidebar"
import { isEmbeddedMobileViewer } from "@/features/pages/model/embedded-view"
import {
  getDatabaseEmoji,
  useDatabase,
} from "@zilobase/features/databases"
import {
  getPageEmoji,
  usePage,
  useRecordItemVisit,
} from "@zilobase/features/pages"
import {
  defaultUserSettings,
  useUserSettings,
} from "@zilobase/features/user-settings"
import { EmbeddedPageDialog } from "@/features/pages/components/index"
import { PageEditorPane } from "@/features/pages/pages/index"
import { useOpenEmbeddedPage } from "@/features/pages/hooks/index"
import { LayoutEditorProvider } from "@/features/pages/layout/index"
import { usePageEditorComments } from "@/features/comments/index"
import { usePageCommentController } from "@/features/comments/index"
import {
  PageLayoutSidebarProvider,
  useOptionalPageLayoutSidebar,
} from "@/features/pages/context/index"
import { Button } from "@/shared/ui/button"
import { TeamSettingsPage, TeamspacesSettingsPage } from "@/features/teamspaces"
import { WorkspaceSettingsPage } from "@/features/workspaces"
import { editionWebModule } from "@zilobase/edition-web"

const CHAT_PRESENTATION_MODE_STORAGE_KEY = "zilobase:ai-chat-presentation-mode"

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
      className="h-[var(--app-viewport-height,100svh)] min-h-0 overflow-hidden"
      style={
        {
          "--app-sidebar-panel-width": APP_SIDEBAR_PANEL_WIDTH,
          "--right-sidebar-panel-width": "24rem",
          "--sidebar-width": "var(--app-sidebar-panel-width)",
        } as React.CSSProperties
      }
    >
      <AppSearchProvider>
        <AppLayoutWithRoutePage
          pathname={pathname}
          utilitySidebar={utilitySidebar}
          utilitySidebarOpen={utilitySidebarOpen}
        >
          {children}
        </AppLayoutWithRoutePage>
      </AppSearchProvider>
    </SidebarProvider>
  )
}

function AppLayoutWithRoutePage({
  children,
  pathname,
  utilitySidebar,
  utilitySidebarOpen,
}: {
  children?: ReactNode
  pathname: string
  utilitySidebar?: ReactNode
  utilitySidebarOpen: boolean
}) {
  const navigate = useNavigate()
  const routePageId = useRoutePageId(pathname)
  const isSettingsPage = pathname.startsWith("/settings")
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(isSettingsPage)
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>(() => getSettingsSection(pathname))

  useEffect(() => {
    if (!isSettingsPage) return
    setActiveSettingsSection(getSettingsSection(pathname))
    setSettingsDialogOpen(true)
  }, [isSettingsPage, pathname])

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsDialogOpen(open)

      if (!open && isSettingsPage) {
        void navigate({ to: "/recents", replace: true })
      }
    },
    [isSettingsPage, navigate],
  )

  return (
    <>
      <AppSidebar
        onOpenSettings={() => {
          setActiveSettingsSection("preferences")
          setSettingsDialogOpen(true)
        }}
        settingsOpen={settingsDialogOpen}
      />
      <PageLayoutSidebarProvider pageId={routePageId}>
        <LayoutEditorProvider>
          <AppLayoutContent
            activeSettingsSection={activeSettingsSection}
            isSettingsPage={isSettingsPage}
            onSettingsOpenChange={handleSettingsOpenChange}
            setActiveSettingsSection={setActiveSettingsSection}
            settingsDialogOpen={settingsDialogOpen}
            utilitySidebar={utilitySidebar}
            utilitySidebarOpen={utilitySidebarOpen}
          >
            {children}
          </AppLayoutContent>
        </LayoutEditorProvider>
      </PageLayoutSidebarProvider>
    </>
  )
}

function AppLayoutContent({
  activeSettingsSection,
  children,
  isSettingsPage,
  onSettingsOpenChange,
  setActiveSettingsSection,
  settingsDialogOpen,
  utilitySidebar,
  utilitySidebarOpen,
}: {
  activeSettingsSection: SettingsSection
  children?: ReactNode
  isSettingsPage: boolean
  onSettingsOpenChange: (open: boolean) => void
  setActiveSettingsSection: Dispatch<SetStateAction<SettingsSection>>
  settingsDialogOpen: boolean
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
  const isAiPage = pathname === "/ai"
  const pageId = useRoutePageId(pathname)
  const databaseId = getDatabaseId(pathname)
  const { data: databasePayload } = useDatabase(databaseId, {
    includeDeleted: true,
  })
  const hostPageId = pageId ?? databasePayload?.database.pageId ?? null
  const { data: hostPage } = usePage(hostPageId, {
    refetchOnMount: false,
  })
  const desktopTabTitle =
    (databaseId
      ? databasePayload?.database.name.trim()
      : pageId
        ? hostPage?.name.trim()
        : null) || getDesktopTabTitle(pathname)
  const desktopTabIcon = databasePayload?.activeDataSource
    ? getDatabaseEmoji(databasePayload.activeDataSource)
    : hostPage
      ? getPageEmoji(hostPage)
      : null
  const recordItemVisit = useRecordItemVisit()
  const recordedVisitKeyRef = useRef<string | null>(null)
  const discussionsEnabled = Boolean(pageId && !databaseId)
  const { data: userSettings = defaultUserSettings } = useUserSettings()
  const sidePaneState = usePageSidePaneState(
    pageId,
    userSettings.embeddedItemsOpenAs,
  )
  const {
    closeSidePane,
    openDatabaseSidePane: openDatabaseSidePaneBase,
    openSidePane: openSidePaneBase,
    renderedSidePaneDatabaseId,
    renderedSidePanePageId,
    mainPaneNavigationActive,
    sidePaneAnimatedOpen,
    sidePaneDatabaseId,
    sidePanePageId,
  } = sidePaneState
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [chatPresentationMode, setChatPresentationMode] =
    useState<ChatPresentationMode>(readChatPresentationMode)
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
    : Number(chatSidebarOpen && chatPresentationMode === "sidebar") +
      Number(primaryRightPanelOpen)
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

  useEffect(() => {
    if (pathname === "/ai" && chatSidebarOpen) {
      setChatSidebarOpen(false)
    }
  }, [chatSidebarOpen, pathname])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CHAT_PRESENTATION_MODE_STORAGE_KEY,
        chatPresentationMode,
      )
    } catch {
      // Storage is optional; the in-memory preference remains active.
    }
  }, [chatPresentationMode])

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
      !mainPaneNavigationActive &&
      chatSidebarOpen
    ) {
      setChatSidebarOpen(false)
    }
  }, [
    appSidebarOpen,
    chatSidebarOpen,
    mainPaneNavigationActive,
    sidePaneDatabaseId,
    sidePanePageId,
  ])

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
        <SidebarSimpleIcon
          className="size-4 text-muted-foreground"
          mirrored
        />
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
          <ChevronsRightIcon />
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
      onPresentationModeChange={isMobile ? undefined : setChatPresentationMode}
      open={chatSidebarOpen}
      pageId={pageId}
      presentationMode={isMobile ? "sidebar" : chatPresentationMode}
    />
  )
  const dockedChatOpen =
    chatSidebarOpen && (isMobile || chatPresentationMode === "sidebar")
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
      <SettingsDialog
        activeSection={activeSettingsSection}
        onOpenChange={onSettingsOpenChange}
        onSectionChange={setActiveSettingsSection}
        open={settingsDialogOpen}
      >
        <SettingsSectionContent section={activeSettingsSection} />
      </SettingsDialog>
      <ResizablePanelGroup
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden has-data-[desktop-tabs]:pt-9"
        orientation="horizontal"
        style={{ height: "100%" }}
      >
        <DesktopTabs icon={desktopTabIcon} title={desktopTabTitle} />
        {/* The dock owns the width limit; keeping this minimum relaxed avoids
            clamping the layout before a sidebar transition can run. */}
        <ResizablePanel
          className="min-h-0 min-w-0"
          defaultSize={getRightSidebarEditorDefaultSize(desktopRightPanelCount)}
          id="app-editor-pane"
          minSize="0%"
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <SidebarInset className="flex h-full min-h-0 flex-col overflow-hidden">
            <PageSidePaneShell
              body={
                isSettingsPage ? (
                  <div className="h-full bg-background" />
                ) : (
                  children ?? <Outlet />
                )
              }
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
          chatOpen={dockedChatOpen}
          chatPanel={dockedChatOpen ? chatPanel : null}
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
      {chatSidebarOpen && !isMobile && chatPresentationMode === "floating" ? (
        <aside
          aria-label="Floating Ask AI chat"
          className="fixed bottom-16 right-4 z-50 flex h-[min(44rem,calc(var(--app-viewport-height,100svh)-6rem))] w-[min(28rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border bg-background text-foreground shadow-2xl"
        >
          {chatPanel}
        </aside>
      ) : null}
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

function readChatPresentationMode(): ChatPresentationMode {
  try {
    return window.localStorage.getItem(CHAT_PRESENTATION_MODE_STORAGE_KEY) ===
      "floating"
      ? "floating"
      : "sidebar"
  } catch {
    return "sidebar"
  }
}

function SettingsSectionContent({ section }: { section: SettingsSection }) {
  const editionSection = editionWebModule.settingsSections.find(
    (candidate) => candidate.id === section,
  )

  if (editionSection) {
    const EditionSettings = editionSection.component
    return <EditionSettings />
  }

  switch (section) {
    case "preferences":
      return <PreferencesSettingsPage />
    case "workspace":
      return <WorkspaceSettingsPage />
    case "zilobase-ai":
      return <ZilobaseAiSettingsPage />
    case "api-keys":
      return <ApiKeysSettingsPage />
    case "team":
      return <TeamSettingsPage />
    case "teamspaces":
      return <TeamspacesSettingsPage />
    case "profile":
    default:
      return <ProfileSettingsPage />
  }
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

  return (
    <EmbeddedPageDialog
      onOpenPage={openPage}
      pageRenderer={PageEditorPane}
    />
  )
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
        className="z-10"
        side="main"
        splitActive={splitActive}
      >
        <PagePaneHeader
          className="min-w-0 flex-1"
          leadingControl={
            <MainPaneHeaderLeadingControl />
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
          side="side"
          splitActive={splitActive}
        >
          <PagePaneHeader
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

function MainPaneHeaderLeadingControl() {
  const { isMobile, open, openMobile } = useSidebar()
  const isCollapsed = isMobile ? !openMobile : !open

  if (isCollapsed) {
    return <CollapsedSidebarTrigger />
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
