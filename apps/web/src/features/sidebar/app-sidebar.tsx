"use client"

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { isDesktopApp } from "@/features/desktop/index"
import { useLocation, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  MonitorUpIcon,
  SlidersHorizontalIcon,
} from "@/shared/components/icons"
import * as React from "react"
import { toast } from "sonner"

import { useAppSearch } from "@/features/search"
import { DatabaseViewIcon } from "@/features/databases"
import { AiChatsSection } from "./components/ai-chats-section"
import { AgentsSection } from "./components/agents-section"
import { NavFavorites } from "./components/nav-favorites"
import { NavMeetings } from "./components/nav-meetings"
import { NavPageSection } from "./components/nav-pages"
import { RuntimeSectionDragItem } from "./components/runtime-section-drag-item"
import { SidebarCustomizePanel } from "./components/sidebar-customize-panel"
import { SidebarDatabaseViewSection } from "./components/sidebar-database-view-section"
import { SidebarLayoutTabs } from "./components/sidebar-layout-tabs"
import { SidebarShortcutList } from "./components/sidebar-shortcut-list"
import { SidebarTasksSection } from "./components/sidebar-tasks-section"
import {
  buildSidebarNavigation,
  type SidebarNavigationIcons,
} from "./model/sidebar-navigation-model.ts"
import {
  getActiveDatabaseId,
  getActiveDatabaseViewId,
  getActiveMeetingId,
  getActivePageId,
} from "./components/sidebar-nav-list"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"
import { WorkspaceSwitcher } from "./workspace-switcher"
import {
  clearPromotedFullPagePath,
  usePromotedFullPagePath,
} from "@/features/pages/pane/page-side-pane";
import { useAiChatThreadState } from "@/features/ai/index"
import { buildDesktopDeepLink } from "@/features/desktop/deep-links/index"
import {
  discoverRuntimeDesktopServer,
  getSelectedDesktopServer,
  type DesktopServer,
} from "@/features/desktop/server/index"
import { DEFAULT_DATABASE_ITEM_ICON, DEFAULT_MEETING_ITEM_ICON } from "@/features/pages/index"
import { getDatabaseIconNode, getPageIconNode, PageIconDisplay } from "@/features/pages/index"
import { useSession } from "@zilobase/features/auth/react";
import {
  useAddDatabaseRow,
  useCreateDatabase,
  useSetDatabaseFavorite,
} from "@zilobase/features/databases/react";
import { useWorkspaceMeetings } from "@zilobase/features/meetings/react";
import { useCreatePage, usePageNavigation, useSetPageFavorite } from "@zilobase/features/pages/react";
import { useTeamspaces, useTeamspaceSettings } from "@zilobase/features/teamspaces/react";
import {
  defaultUserSettings,
  isStaticSidebarTabId,
  normalizeSidebarConfig,
  resolveSidebarWorkspaceLayout,
  withSidebarWorkspaceLayout,
  type SidebarSection,
} from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { readActiveSidebarTab, writeActiveSidebarTab } from "./model/sidebar-persistence"
import { isFeatureEnabled } from "@/shared/config/feature-flags"
import { withoutMailFeatures } from "./model/sidebar-layout-model"
import { WorkspaceMailNavigation } from "./components/workspace-mail-navigation"
import { NotificationCenter } from "@/features/notifications"

const sidebarNavigationIcons: SidebarNavigationIcons<React.ReactNode> = {
  getDatabaseIcon: (database: Parameters<typeof getDatabaseIconNode>[0]) =>
    getDatabaseIconNode(database) ?? <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />,
  getDatabaseViewIcon: (view) => <DatabaseViewIcon view={view} />,
  getMeetingIcon: (meeting: { emoji?: string | null }) =>
    <PageIconDisplay size="sm" value={meeting.emoji ?? DEFAULT_MEETING_ITEM_ICON} />,
  getPageIcon: getPageIconNode,
}

const CalendarAccountsSidebar = React.lazy(() => import("@/features/calendar/connections/calendar-accounts-sidebar").then((module) => ({ default: module.CalendarAccountsSidebar })))

export function AppSidebar({
  onOpenSettings,
  settingsOpen = false,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  onOpenSettings?: () => void
  settingsOpen?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { openSearch } = useAppSearch()
  const routerPathname = useRouterState({ select: (state) => state.location.pathname })
  const promotedFullPagePath = usePromotedFullPagePath()
  const pathname = promotedFullPagePath ?? routerPathname
  const workspaceId = useActiveWorkspaceId()
  const { data: session } = useSession()
  const { data: userSettings = defaultUserSettings } = useUserSettings()
  const updateUserSettings = useUpdateUserSettings()
  const runtimeSectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )
  const [customizing, setCustomizing] = React.useState(false)
  const [databaseDropTargetId, setDatabaseDropTargetId] = React.useState<string | null>(null)
  const [desktopLinkServer, setDesktopLinkServer] = React.useState<DesktopServer | null>(getSelectedDesktopServer())

  React.useEffect(() => {
    const handlePopState = () => clearPromotedFullPagePath()
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])
  React.useEffect(() => {
    if (promotedFullPagePath && window.location.pathname !== promotedFullPagePath) clearPromotedFullPagePath()
  }, [promotedFullPagePath, routerPathname])
  React.useEffect(() => {
    if (desktopLinkServer || isDesktopApp()) return
    let disposed = false
    void discoverRuntimeDesktopServer().then((server) => {
      if (!disposed) setDesktopLinkServer(server)
    }).catch(() => undefined)
    return () => { disposed = true }
  }, [desktopLinkServer])

  const sidebarConfig = React.useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig],
  )
  const layout = React.useMemo(
    () => {
      const resolved = resolveSidebarWorkspaceLayout(sidebarConfig, workspaceId)
      const enabledLayout = isFeatureEnabled("mail") ? resolved : withoutMailFeatures(resolved)
      return isFeatureEnabled("calendar") ? enabledLayout : { ...enabledLayout, tabs: enabledLayout.tabs.filter((tab) => tab.id !== "calendar") }
    },
    [sidebarConfig, workspaceId],
  )
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState({ enabled: false })
  const activeAgentId = pathname.startsWith("/agents/") ? pathname.slice("/agents/".length).split("/")[0] ?? null : null
  const [activeTabId, setActiveTabId] = React.useState("home")
  React.useEffect(() => {
    const stored = readActiveSidebarTab(workspaceId)
    const next = layout.tabs.some((tab) => tab.id === stored) && !isStaticSidebarTabId(stored)
      ? stored
      : "home"
    setActiveTabId(next)
  }, [layout.tabs, workspaceId])
  const selectTab = React.useCallback((tabId: string) => {
    setActiveTabId(tabId)
    if (!isStaticSidebarTabId(tabId)) writeActiveSidebarTab(workspaceId, tabId)
  }, [workspaceId])
  const selectNavigationTab = React.useCallback((tabId: string) => {
    selectTab(tabId)
    if (tabId === "mail") {
      void navigate({ search: { view: "inbox" }, to: "/mail" })
    } else if (tabId === "calendar") {
      void navigate({ to: "/calendar" })
    } else if (tabId === "ai") {
      void navigate({ search: { thread: activeThreadId ?? undefined }, to: "/ai" })
    } else if (pathname === "/mail" || pathname === "/ai" || pathname === "/calendar") {
      void navigate({ search: { view: "recents" }, to: "/recents" })
    }
  }, [activeThreadId, navigate, pathname, selectTab])
  React.useEffect(() => {
    if (customizing) return
    const staticTabId = pathname === "/mail" ? "mail" : pathname === "/ai" ? "ai" : pathname === "/calendar" ? "calendar" : null
    if (staticTabId && layout.tabs.some((tab) => tab.id === staticTabId)) {
      setActiveTabId(staticTabId)
      return
    }
    if (!staticTabId && isStaticSidebarTabId(activeTabId)) {
      const stored = readActiveSidebarTab(workspaceId)
      const next = layout.tabs.some((tab) => tab.id === stored) && !isStaticSidebarTabId(stored)
        ? stored
        : "home"
      setActiveTabId(next)
    }
  }, [activeTabId, customizing, layout.tabs, pathname, workspaceId])
  const activeTab = layout.tabs.find((tab) => tab.id === activeTabId) ?? layout.tabs[0]!
  const needsMeetings = activeTab.sections.some((section) => section.kind === "meetings")
  const { data: navigation } = usePageNavigation(workspaceId)
  const { data: teamspaces = [] } = useTeamspaces(workspaceId)
  const { data: teamspaceSettings } = useTeamspaceSettings(workspaceId)
  const { data: meetingsPayload } = useWorkspaceMeetings(needsMeetings ? workspaceId : null)
  const { isPending: isCreatingPage, mutateAsync: createPage } = useCreatePage()
  const { isPending: isCreatingDatabase, mutateAsync: createDatabase } = useCreateDatabase()
  const { isPending: isSettingPageFavorite, mutate: setPageFavorite } = useSetPageFavorite()
  const { isPending: isAddingDatabaseRow, mutate: addDatabaseRow } = useAddDatabaseRow()
  const { isPending: isSettingDatabaseFavorite, mutate: setDatabaseFavorite } = useSetDatabaseFavorite()
  const { favorites, recents, sections: pageSections } = React.useMemo(
    () => buildSidebarNavigation(navigation?.pages ?? [], navigation?.databases ?? [], navigation?.placements ?? [], sidebarNavigationIcons),
    [navigation],
  )

  const handleCreatePage = React.useCallback(async (teamspaceId?: string) => {
    if (!workspaceId || isCreatingPage) return
    const page = await createPage({ teamspaceId, workspaceId })
    await navigate({ params: { pageId: page.id }, to: "/p/$pageId" })
  }, [createPage, isCreatingPage, navigate, workspaceId])
  const handleCreateDatabase = React.useCallback(async (teamspaceId?: string) => {
    if (!workspaceId || isCreatingDatabase) return
    const payload = await createDatabase({ standalone: true, teamspaceId, workspaceId })
    await navigate({ params: { databaseId: payload.database.id }, search: { view: undefined }, to: "/d/$databaseId" })
  }, [createDatabase, isCreatingDatabase, navigate, workspaceId])
  const handleCreateChat = React.useCallback(async () => {
    setActiveThreadId(null)
    await navigate({ search: { thread: undefined }, to: "/ai" })
  }, [navigate, setActiveThreadId])
  const handleDropPageOnDatabase = React.useCallback((input: { databaseId: string; pageId: string; targetPageId: string | null; title?: string }) => {
    if (input.targetPageId && input.pageId === input.targetPageId) {
      toast.error("You can't nest a page inside itself.")
      return
    }
    if (!isAddingDatabaseRow) addDatabaseRow(input, { onError: showMutationError("Could not move page.") })
  }, [addDatabaseRow, isAddingDatabaseRow])
  const handleRemoveFavorite = React.useCallback((pageId: string) => {
    if (!isSettingPageFavorite) setPageFavorite({ isFavorite: false, pageId }, { onError: showMutationError("Could not update favorite.") })
  }, [isSettingPageFavorite, setPageFavorite])
  const handleRemoveDatabaseFavorite = React.useCallback((databaseId: string) => {
    if (!isSettingDatabaseFavorite) setDatabaseFavorite({ databaseId, isFavorite: false }, { onError: showMutationError("Could not update favorite.") })
  }, [isSettingDatabaseFavorite, setDatabaseFavorite])
  const saveLayout = React.useCallback(async (nextLayout: typeof layout) => {
    if (!workspaceId) return
    await updateUserSettings.mutateAsync({
      sidebarConfig: withSidebarWorkspaceLayout(sidebarConfig, workspaceId, nextLayout),
    })
    setCustomizing(false)
  }, [sidebarConfig, updateUserSettings, workspaceId])
  const handleRuntimeSectionDragEnd = React.useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !workspaceId) return
    const from = activeTab.sections.findIndex((section) => section.id === active.id)
    const to = activeTab.sections.findIndex((section) => section.id === over.id)
    if (from < 0 || to < 0) return
    const sections = [...activeTab.sections]
    const [section] = sections.splice(from, 1)
    if (!section) return
    sections.splice(to, 0, section)
    const nextLayout = {
      ...layout,
      tabs: layout.tabs.map((tab) => tab.id === activeTab.id ? { ...tab, sections } : tab),
    }
    void updateUserSettings.mutateAsync({
      sidebarConfig: withSidebarWorkspaceLayout(sidebarConfig, workspaceId, nextLayout),
    }).catch(showMutationError("Could not reorder sidebar sections."))
  }, [activeTab.id, activeTab.sections, layout, sidebarConfig, updateUserSettings, workspaceId])

  const renderSection = (section: SidebarSection) => {
    const storageKey = `zilobase:sidebar-section:${workspaceId ?? "default"}:${activeTab.id}:${section.id}`
    if (section.kind === "databaseView") {
      return <SidebarDatabaseViewSection activePageId={getActivePageId(pathname)} currentUserId={session?.user?.id} key={section.id} section={section} storageKey={storageKey} />
    }
    if (section.kind === "favorites") {
      return <NavFavorites favorites={favorites} key={section.id} limit={section.limit} onRemoveDatabaseFavorite={handleRemoveDatabaseFavorite} onRemoveFavorite={handleRemoveFavorite} sectionStorageKey={storageKey} sort={section.sort} workspaceId={workspaceId} />
    }
    if (section.kind === "meetings") {
      return <NavMeetings activeMeetingId={getActiveMeetingId(pathname, location.search)} key={section.id} meetings={(meetingsPayload?.meetings ?? []).slice(0, section.limit)} storageKey={storageKey} />
    }
    if (section.kind === "aiChats") {
      return <AiChatsSection key={section.id} limit={section.limit} storageKey={storageKey} />
    }
    if (section.kind === "tasks") {
      return <SidebarTasksSection databaseIds={layout.taskDatabaseIds} key={section.id} limit={section.limit} storageKey={storageKey} />
    }
    if (section.kind === "shared") {
      return pageSections.teamspacePages.length
        ? <NavPageSection activeDatabaseId={getActiveDatabaseId(pathname)} activeDatabaseViewId={getActiveDatabaseViewId(location.search)} activeMeetingId={getActiveMeetingId(pathname, location.search)} activePageId={getActivePageId(pathname)} databaseDropTargetId={databaseDropTargetId} key={section.id} label={section.label || "Shared"} limit={section.limit} onDatabaseDropTargetChange={setDatabaseDropTargetId} onDropPageOnDatabase={handleDropPageOnDatabase} pages={pageSections.teamspacePages} sectionId="shared" sectionStorageKey={`${storageKey}:pages`} sort={section.sort} storageKey={`${storageKey}:pages:tree`} />
        : null
    }
    if (section.kind === "teamspaces") {
      const sortedTeamspaces = [...teamspaces]
        .filter((teamspace) => teamspace.currentUserRole)
        .sort((left, right) => section.sort === "alphabetical" ? left.name.localeCompare(right.name) : Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, section.limit)
      return (
        <React.Fragment key={section.id}>
          {sortedTeamspaces.map((teamspace) => <NavPageSection activeDatabaseId={getActiveDatabaseId(pathname)} activeDatabaseViewId={getActiveDatabaseViewId(location.search)} activeMeetingId={getActiveMeetingId(pathname, location.search)} activePageId={getActivePageId(pathname)} databaseDropTargetId={databaseDropTargetId} key={`${section.id}:${teamspace.id}`} label={teamspace.name} limit={section.limit} onCreateDatabase={() => void handleCreateDatabase(teamspace.id)} onCreatePage={() => void handleCreatePage(teamspace.id)} onDatabaseDropTargetChange={setDatabaseDropTargetId} onDropPageOnDatabase={handleDropPageOnDatabase} pages={pageSections.teamspacePagesById[teamspace.id] ?? []} sectionId="shared" sectionStorageKey={`${storageKey}:${teamspace.id}`} showCreateAction sort={section.sort} storageKey={`${storageKey}:${teamspace.id}:tree`} teamspace={teamspace} workspaceCanManage={Boolean(teamspaceSettings?.canManage)} workspaceId={workspaceId} />)}
        </React.Fragment>
      )
    }
    const pages = section.kind === "recents" ? recents : pageSections.privatePages
    return <NavPageSection activeDatabaseId={getActiveDatabaseId(pathname)} activeDatabaseViewId={getActiveDatabaseViewId(location.search)} activeMeetingId={getActiveMeetingId(pathname, location.search)} activePageId={getActivePageId(pathname)} databaseDropTargetId={databaseDropTargetId} key={section.id} label={section.label || (section.kind === "recents" ? "Recents" : "Private")} limit={section.limit} onCreateDatabase={section.kind === "private" ? handleCreateDatabase : undefined} onCreatePage={section.kind === "private" ? handleCreatePage : undefined} onDatabaseDropTargetChange={setDatabaseDropTargetId} onDropPageOnDatabase={handleDropPageOnDatabase} pages={pages} sectionId={section.kind} sectionStorageKey={storageKey} showCreateAction={section.kind === "private"} sort={section.sort} storageKey={`${storageKey}:tree`} />
  }

  const hasOverlayTitleBar =
    isDesktopApp() &&
    (navigator.userAgent.includes("Mac") || navigator.userAgent.includes("Linux"))

  return (
    <Sidebar aria-label="Application sidebar" {...props}>
      <SidebarHeader
        actions={workspaceId ? <NotificationCenter workspaceId={workspaceId} /> : null}
        className={hasOverlayTitleBar ? "shrink-0 pt-9" : "shrink-0"}
        data-desktop-drag-region={hasOverlayTitleBar ? "" : undefined}
        navigation={!customizing ? <SidebarLayoutTabs activeTabId={activeTab.id} onOpenSearch={openSearch} onSelectTab={selectNavigationTab} tabs={layout.tabs} /> : null}
      >
        <WorkspaceSwitcher onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />
      </SidebarHeader>
      {customizing ? (
        <SidebarCustomizePanel activeTabId={activeTabId} databases={navigation?.databases ?? []} disabled={updateUserSettings.isPending} key={`${workspaceId}:${JSON.stringify(layout)}`} layout={layout} onActiveTabChange={selectTab} onCancel={() => setCustomizing(false)} onDone={saveLayout} onOpenSearch={openSearch} pages={navigation?.pages ?? []} workspaceId={workspaceId} />
      ) : (
        <>
          {activeTab.id !== "mail" && activeTab.id !== "calendar" && (
            <div className="shrink-0 pt-3" data-sidebar="shortcuts">
              <SidebarShortcutList databases={navigation?.databases ?? []} onCreateChat={handleCreateChat} onCreateDatabase={handleCreateDatabase} onCreatePage={handleCreatePage} onOpenSettings={onOpenSettings} pages={navigation?.pages ?? []} settingsOpen={settingsOpen} shortcuts={activeTab.shortcuts} />
            </div>
          )}
          <SidebarContent className="block overflow-x-hidden overflow-y-auto overscroll-y-contain" aria-label="Sidebar sections">
            {activeTab.id === "mail" ? (
              <WorkspaceMailNavigation workspaceId={workspaceId} />
            ) : activeTab.id === "calendar" ? (
              workspaceId ? <React.Suspense fallback={null}><CalendarAccountsSidebar key={workspaceId} workspaceId={workspaceId} /></React.Suspense> : null
            ) : (
              <>
                <AgentsSection activeAgentId={activeAgentId} />
                <DndContext collisionDetection={closestCenter} onDragEnd={handleRuntimeSectionDragEnd} sensors={runtimeSectionSensors}>
                  <SortableContext items={activeTab.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
                    {activeTab.sections.map((section) => <RuntimeSectionDragItem id={section.id} key={section.id}>{renderSection(section)}</RuntimeSectionDragItem>)}
                  </SortableContext>
                </DndContext>
              </>
            )}
          </SidebarContent>
        </>
      )}
      <SidebarFooter className="relative z-10 shrink-0 bg-surface-navigation p-0">
        {!customizing ? (
          <SidebarMenu className="gap-2 p-2">
            <SidebarMenuItem><SidebarMenuButton onClick={() => setCustomizing(true)} title="Customize sidebar" type="button"><SlidersHorizontalIcon /><span>Customize sidebar</span></SidebarMenuButton></SidebarMenuItem>
            {!isDesktopApp() && desktopLinkServer ? <SidebarMenuItem><a className="flex w-full items-start gap-2.5 rounded-lg bg-action-neutral-hover p-3 text-content-primary ring-1 ring-stroke-default transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none" href={buildDesktopDeepLink(location.href, desktopLinkServer)}><MonitorUpIcon className="mt-0.5 size-4 shrink-0" /><span className="min-w-0"><span className="block text-sm font-medium">Open in desktop app</span><span className="mt-0.5 block text-xs leading-snug text-content-secondary">Continue this page in the desktop experience.</span></span></a></SidebarMenuItem> : null}
          </SidebarMenu>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}

function showMutationError(fallback: string) {
  return (error: unknown) => toast.error(error instanceof Error ? error.message : fallback)
}
