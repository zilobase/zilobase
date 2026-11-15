import { CalendarWorkspaceProvider } from "@/sections/calendar/workspace/components/calendar-workspace";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronsRightIcon, SidebarSimpleIcon } from "@/components/icons";

import { useAppSidebar } from "@/app/shell/sidebar/hooks/sidebar-controller";
import { AppSidebar } from "@/app/shell/sidebar/components/app-sidebar";
import { AppSearchProvider } from "@/app/shell/search/components/app-search";
import { DesktopTabs, getDesktopTabTitle } from "@/sections/desktop/tabs/components/desktop-tabs";
import { ChatSidebarTrigger } from "@/sections/ai/workspace/components/chat-sidebar-trigger";
import { isFeatureEnabled } from "@/platform/environment";
import type { ChatPresentationMode } from "@/sections/ai/workspace/components/chat-sidebar";
import {
  usePageSidePaneState,
  PageSidePaneContext,
} from "@/sections/pages/presentation/components/page-presentation";
import { PageSidePaneShell } from "@/sections/pages/presentation/components/page-side-pane";
import { RightSidebarMobilePanels, RightSidebars } from "@/app/shell/panels/components/tool-panels";
import {
  getRightSidebarEditorDefaultSize,
  type SidebarResizeIntent,
} from "@/app/shell/panels/components/tool-panels";

import {
  PageHeaderControlsContext,
  useRoutePageId,
} from "@/sections/pages/header/components/page-header";
import { getDatabaseId } from "@/app/routing/route-identifiers";
import {
  getSettingsSection,
  type SettingsSection,
} from "@/sections/settings/shell/components/settings-sidebar";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  APP_SIDEBAR_PANEL_WIDTH,
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { isEmbeddedMobileViewer } from "@/sections/pages/layout/components/page-layout";
import { useDatabaseMetadata } from "@zilobase/features/databases/react";
import { getDatabaseEmoji } from "@zilobase/features/databases";
import { getPageIconValue } from "@/sections/pages/appearance/components/page-icon";
import { usePage, useRecordItemVisit } from "@zilobase/features/pages/react";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { useUserSettings } from "@zilobase/features/user-settings/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { PageDesignEditorProvider } from "@/sections/pages/design/components/page-design-editor";

import {
  PageDesignSidebarProvider,
  useOptionalPageDesignSidebar,
} from "@/sections/pages/design/components/page-design-sidebar";
import { Button } from "@/components/ui/button";
import { FloatingWidget } from "@/components/ui/floating-widget";
import { AppHeader } from "@/app/shell/header/components/app-header";

const EmbeddedPageDialogHost = lazy(() =>
  import("@/sections/pages/presentation/components/page-dialog").then((module) => ({
    default: module.PageDialog,
  })),
);
const SettingsDialog = lazy(() =>
  import("@/sections/settings/shell/components/settings-dialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);
const ChatSidebarPanel = lazy(() =>
  import("@/sections/ai/workspace/components/chat-sidebar").then((module) => ({
    default: module.ChatSidebarPanel,
  })),
);

const CHAT_PRESENTATION_MODE_STORAGE_KEY = "zilobase:ai-chat-presentation-mode";

const CalendarReminderHost = lazy(
  () => import("@/sections/calendar/reminders/components/calendar-reminder-host"),
);

export function AppShell({
  children,
  utilitySidebar,
  utilitySidebarOpen = false,
}: {
  children?: ReactNode;
  utilitySidebar?: ReactNode;
  utilitySidebarOpen?: boolean;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <SidebarProvider
      className="h-[var(--app-viewport-height,100svh)] min-h-0 overflow-hidden"
      style={
        {
          "--right-sidebar-panel-width": "24rem",
          "--sidebar-width": APP_SIDEBAR_PANEL_WIDTH,
          "--sidebar-width-mobile": "18rem",
        } as React.CSSProperties
      }
    >
      <AppSearchProvider>
        <CalendarWorkspaceProvider>
          <AppLayoutWithRoutePage
            pathname={pathname}
            utilitySidebar={utilitySidebar}
            utilitySidebarOpen={utilitySidebarOpen}
          >
            {children}
          </AppLayoutWithRoutePage>
        </CalendarWorkspaceProvider>
      </AppSearchProvider>
    </SidebarProvider>
  );
}

function AppLayoutWithRoutePage({
  children,
  pathname,
  utilitySidebar,
  utilitySidebarOpen,
}: {
  children?: ReactNode;
  pathname: string;
  utilitySidebar?: ReactNode;
  utilitySidebarOpen: boolean;
}) {
  const navigate = useNavigate();
  const routePageId = useRoutePageId(pathname);
  const isSettingsPage = pathname.startsWith("/settings");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(isSettingsPage);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>(() =>
    getSettingsSection(pathname),
  );

  useEffect(() => {
    if (!isSettingsPage) return;
    setActiveSettingsSection(getSettingsSection(pathname));
    setSettingsDialogOpen(true);
  }, [isSettingsPage, pathname]);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsDialogOpen(open);

      if (!open && isSettingsPage) {
        void navigate({ to: "/recents", replace: true });
      }
    },
    [isSettingsPage, navigate],
  );

  const sidebarProps = useAppSidebar({
    onOpenSettings: () => {
      setActiveSettingsSection("preferences");
      setSettingsDialogOpen(true);
    },
    settingsOpen: settingsDialogOpen,
  });

  return (
    <>
      <AppSidebar {...sidebarProps} />
      <PageDesignSidebarProvider pageId={routePageId}>
        <PageDesignEditorProvider>
          <AppShellContent
            activeSettingsSection={activeSettingsSection}
            isSettingsPage={isSettingsPage}
            onSettingsOpenChange={handleSettingsOpenChange}
            setActiveSettingsSection={setActiveSettingsSection}
            settingsDialogOpen={settingsDialogOpen}
            utilitySidebar={utilitySidebar}
            utilitySidebarOpen={utilitySidebarOpen}
          >
            {children}
          </AppShellContent>
        </PageDesignEditorProvider>
      </PageDesignSidebarProvider>
    </>
  );
}

function AppShellContent({
  activeSettingsSection,
  children,
  isSettingsPage,
  onSettingsOpenChange,
  setActiveSettingsSection,
  settingsDialogOpen,
  utilitySidebar,
  utilitySidebarOpen,
}: {
  activeSettingsSection: SettingsSection;
  children?: ReactNode;
  isSettingsPage: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  setActiveSettingsSection: Dispatch<SetStateAction<SettingsSection>>;
  settingsDialogOpen: boolean;
  utilitySidebar?: ReactNode;
  utilitySidebarOpen: boolean;
}) {
  const router = useRouter();
  const { hash, pathname, searchStr } = useRouterState({
    select: (state) => ({
      hash: state.location.hash,
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
  });
  const embeddedMobileViewer = isEmbeddedMobileViewer();
  const {
    isMobile,
    open: appSidebarOpen,
    setAutoCollapsed: setAppSidebarAutoCollapsed,
  } = useSidebar();
  const askAiEnabled = isFeatureEnabled("askAi");
  const isAiPage = askAiEnabled && pathname === "/ai";
  const aiWorkspacePanel = isAiPage ? new URLSearchParams(searchStr).get("panel") : null;
  const aiWorkspaceSidePaneOpen = aiWorkspacePanel === "settings" || aiWorkspacePanel === "history";
  const aiSettingsPageId =
    isAiPage && aiWorkspacePanel === "settings"
      ? new URLSearchParams(searchStr).get("settingsPage")
      : null;
  const closeAuxiliaryWorkspaceSidePane = useCallback(() => {
    const search = new URLSearchParams(searchStr);
    if (search.has("settingsPage")) search.delete("settingsPage");
    else {
      search.delete("panel");
      search.delete("settingsScope");
      search.delete("settingsTab");
    }
    const query = search.toString();
    router.history.replace(`${pathname}${query ? `?${query}` : ""}${hash}`);
  }, [hash, pathname, router.history, searchStr]);
  const isFullPanePage = pathname === "/calendar";
  const pageId = useRoutePageId(pathname);
  const databaseId = getDatabaseId(pathname);
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data: databasePayload } = useDatabaseMetadata(databaseId, {
    includeDeleted: true,
  });
  const hostPageId = pageId ?? databasePayload?.database.pageId ?? null;
  const { data: hostPage } = usePage(hostPageId, {
    refetchOnMount: false,
  });
  const desktopTabTitle =
    (databaseId ? databasePayload?.displayName.trim() : pageId ? hostPage?.name.trim() : null) ||
    getDesktopTabTitle(pathname);
  const desktopTabIcon = databasePayload?.activeDataSource
    ? getDatabaseEmoji(databasePayload.activeDataSource)
    : hostPage
      ? getPageIconValue(hostPage)
      : null;
  const recordItemVisit = useRecordItemVisit();
  const recordedVisitKeyRef = useRef<string | null>(null);
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const sidePaneState = usePageSidePaneState(pageId, userSettings.embeddedItemsOpenAs);
  const {
    closeSidePane,
    dialogPageId,
    openDatabaseSidePane: openDatabaseSidePaneBase,
    openSidePane: openSidePaneBase,
    renderedSidePaneDatabaseId,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneDatabaseId,
    sidePanePageId,
  } = sidePaneState;
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [chatPresentationMode, setChatPresentationMode] =
    useState<ChatPresentationMode>(readChatPresentationMode);
  const pageLayoutSidebar = useOptionalPageDesignSidebar();
  const pageLayoutSidebarOpen = Boolean(pageLayoutSidebar?.hasSidebar && pageLayoutSidebar.open);
  const primaryRightPanelOpen = Boolean(
    (utilitySidebarOpen && utilitySidebar) || pageLayoutSidebarOpen,
  );
  const desktopRightPanelCount = isMobile
    ? 0
    : Number(chatSidebarOpen && chatPresentationMode === "sidebar") + Number(primaryRightPanelOpen);
  const handleRightSidebarResizeIntent = useCallback(
    (intent: SidebarResizeIntent) => {
      if (isMobile) return;
      setAppSidebarAutoCollapsed(intent === "increase");
    },
    [isMobile, setAppSidebarAutoCollapsed],
  );
  const openSidePane = useCallback(
    (nextPageId: string, options?: { databaseId?: string | null }) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false);
      }

      pageLayoutSidebar?.setOpen(false);

      openSidePaneBase(nextPageId, options);
    },
    [appSidebarOpen, openSidePaneBase, pageLayoutSidebar],
  );
  const openDatabaseSidePane = useCallback(
    (nextDatabaseId: string) => {
      if (appSidebarOpen) {
        setChatSidebarOpen(false);
      }

      pageLayoutSidebar?.setOpen(false);

      openDatabaseSidePaneBase(nextDatabaseId);
    },
    [appSidebarOpen, openDatabaseSidePaneBase, pageLayoutSidebar],
  );
  const openChatSidebar = useCallback(() => {
    if (!askAiEnabled) return;
    if (appSidebarOpen) {
      closeSidePane();
    }
    setChatSidebarOpen(true);
  }, [appSidebarOpen, askAiEnabled, closeSidePane]);

  useEffect(() => {
    if (pathname === "/ai" && chatSidebarOpen) {
      setChatSidebarOpen(false);
    }
  }, [chatSidebarOpen, pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_PRESENTATION_MODE_STORAGE_KEY, chatPresentationMode);
    } catch {}
  }, [chatPresentationMode]);

  const togglePageLayoutSidebar = useCallback(() => {
    if (!pageLayoutSidebar?.hasSidebar) return;

    const nextOpen = !pageLayoutSidebar.open;
    if (nextOpen) {
      closeSidePane();
    }
    pageLayoutSidebar.setOpen(nextOpen);
  }, [closeSidePane, pageLayoutSidebar]);
  const sidePaneContext = useMemo(
    () => ({
      ...sidePaneState,
      openDatabaseSidePane,
      openSidePane,
      mainHeader:
        embeddedMobileViewer || isFullPanePage ? undefined : (
          <AppHeader
            pathname={pathname}
            isSettingsPage={isSettingsPage || isAiPage}
            auxiliarySidePaneOpen={
              aiWorkspaceSidePaneOpen && !utilitySidebarOpen && !pageLayoutSidebarOpen
            }
            auxiliarySidePanePageId={aiSettingsPageId}
            onCloseAuxiliarySidePane={closeAuxiliaryWorkspaceSidePane}
          />
        ),
    }),
    [
      embeddedMobileViewer,
      aiWorkspaceSidePaneOpen,
      aiSettingsPageId,
      closeAuxiliaryWorkspaceSidePane,
      utilitySidebarOpen,
      pageLayoutSidebarOpen,
      isAiPage,
      isFullPanePage,
      isSettingsPage,
      openDatabaseSidePane,
      openSidePane,
      pathname,
      sidePaneState,
    ],
  );

  useEffect(() => {
    const itemKind = databaseId ? "database" : pageId ? "page" : null;
    const itemId = databaseId ?? pageId;
    const workspaceId = databaseId
      ? databasePayload?.database.workspaceId
      : pageId
        ? hostPage?.workspaceId
        : activeWorkspaceId;

    if (!itemKind || !itemId || !workspaceId) {
      return;
    }

    const visitKey = `${itemKind}:${itemId}:${workspaceId}`;

    if (recordedVisitKeyRef.current === visitKey) {
      return;
    }

    recordedVisitKeyRef.current = visitKey;
    recordItemVisit.mutate({
      itemId,
      itemKind,
      workspaceId,
    });
  }, [
    databaseId,
    databasePayload?.database.workspaceId,
    activeWorkspaceId,
    hostPage?.workspaceId,
    recordItemVisit.mutate,
    pageId,
  ]);

  useEffect(() => {
    if (appSidebarOpen && (sidePanePageId || sidePaneDatabaseId) && chatSidebarOpen) {
      setChatSidebarOpen(false);
    }
  }, [appSidebarOpen, chatSidebarOpen, sidePaneDatabaseId, sidePanePageId]);

  const showEmbeddedSidePaneLayout =
    !utilitySidebarOpen &&
    !pageLayoutSidebarOpen &&
    Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId);
  const showAuxiliaryWorkspaceSidePaneLayout =
    !utilitySidebarOpen && !pageLayoutSidebarOpen && aiWorkspaceSidePaneOpen;
  const showSidePaneLayout = showAuxiliaryWorkspaceSidePaneLayout || showEmbeddedSidePaneLayout;
  const pageSidebarPanel = pageLayoutSidebar?.hasSidebar ? (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarSimpleIcon className="size-4 text-content-secondary" mirrored />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">Page sidebar</h2>
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
      <div className="min-h-0 flex-1 overflow-y-auto" ref={pageLayoutSidebar?.setPanelTarget} />
    </div>
  ) : undefined;
  const chatPanel = chatSidebarOpen ? (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-content-secondary text-sm">
          Loading chat...
        </div>
      }
    >
      <ChatSidebarPanel
        databaseId={databaseId}
        onClose={() => setChatSidebarOpen(false)}
        onPresentationModeChange={isMobile ? undefined : setChatPresentationMode}
        open
        pageId={pageId}
        presentationMode={isMobile ? "sidebar" : chatPresentationMode}
      />
    </Suspense>
  ) : null;
  const dockedChatOpen = chatSidebarOpen && (isMobile || chatPresentationMode === "sidebar");

  return (
    <PageHeaderControlsContext.Provider
      value={{
        pageId,
        onTogglePageSidebar: pageLayoutSidebar?.hasSidebar ? togglePageLayoutSidebar : undefined,
        pageSidebarOpen: pageLayoutSidebarOpen,
      }}
    >
      <PageSidePaneContext.Provider value={sidePaneContext}>
        {dialogPageId && !isMobile ? (
          <Suspense fallback={null}>
            <EmbeddedPageDialogHost
              contextPageId={hostPageId}
              databaseId={databaseId}
              hostPage={hostPage}
            />
          </Suspense>
        ) : null}
        <PageLayoutOverlayDrawer />
        {settingsDialogOpen ? (
          <Suspense fallback={null}>
            <SettingsDialog
              activeSection={activeSettingsSection}
              onOpenChange={onSettingsOpenChange}
              onSectionChange={setActiveSettingsSection}
              open
            />
          </Suspense>
        ) : null}
        <Suspense fallback={null}>
          <CalendarReminderHost />
        </Suspense>
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
                    <div className="h-full bg-surface-canvas" />
                  ) : (
                    (children ?? <Outlet />)
                  )
                }
                header={
                  embeddedMobileViewer ||
                  isFullPanePage ||
                  /^\/(?:p|d|m)\//.test(pathname) ||
                  pathname === "/recents" ||
                  isAiPage
                    ? undefined
                    : sidePaneContext.mainHeader
                }
                open={
                  showAuxiliaryWorkspaceSidePaneLayout ||
                  (showEmbeddedSidePaneLayout && sidePaneAnimatedOpen)
                }
                visible={showSidePaneLayout}
              />
            </SidebarInset>
          </ResizablePanel>
          <RightSidebars
            chatOpen={askAiEnabled && dockedChatOpen}
            chatPanel={askAiEnabled && dockedChatOpen ? chatPanel : null}
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
          chatOpen={askAiEnabled && chatSidebarOpen}
          chatPanel={askAiEnabled ? chatPanel : null}
          isMobile={isMobile}
          pageSidebarOpen={pageLayoutSidebarOpen}
          pageSidebarPanel={pageSidebarPanel}
        />
        {askAiEnabled && chatSidebarOpen && !isMobile && chatPresentationMode === "floating" ? (
          <FloatingWidget aria-label="Floating Ask AI chat">{chatPanel}</FloatingWidget>
        ) : null}
        {!askAiEnabled || chatSidebarOpen || isAiPage || isFullPanePage ? null : (
          <ChatSidebarTrigger
            adjacentSidebarOpen={utilitySidebarOpen || pageLayoutSidebarOpen}
            onOpen={openChatSidebar}
          />
        )}
      </PageSidePaneContext.Provider>
    </PageHeaderControlsContext.Provider>
  );
}

function readChatPresentationMode(): ChatPresentationMode {
  try {
    return window.localStorage.getItem(CHAT_PRESENTATION_MODE_STORAGE_KEY) === "floating"
      ? "floating"
      : "sidebar";
  } catch {
    return "sidebar";
  }
}

function PageLayoutOverlayDrawer() {
  const pageLayoutSidebar = useOptionalPageDesignSidebar();
  const open = Boolean(pageLayoutSidebar?.overlayPageId);

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) pageLayoutSidebar?.closeOverlay();
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
  );
}
