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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { isTauri } from "@tauri-apps/api/core"
import { useLocation, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  ChevronRightIcon,
  MonitorUpIcon,
  SlidersHorizontalIcon,
} from "@/components/icons"
import * as React from "react"
import { toast } from "sonner"

import { AiChatHistoryList } from "@/components/ai-elements/ai-chat-history-list"
import { AppSidebarHeader, AppSidebarShell } from "@/components/app-sidebar-shell"
import { useAppSearch } from "@/components/app-search"
import { DatabaseViewIcon } from "@/components/database-view-icon"
import { NavFavorites } from "@/components/nav-favorites"
import { NavMeetings } from "@/components/nav-meetings"
import { NavPageSection } from "@/components/nav-pages"
import { SidebarCustomizePanel } from "@/components/sidebar-customize-panel"
import { SidebarDatabaseViewSection } from "@/components/sidebar-database-view-section"
import { SidebarShortcutIcon } from "@/components/sidebar-layout-icons"
import { getShortcutLabel, isShortcutActive } from "@/components/sidebar-layout-model"
import { SidebarLayoutTabs } from "@/components/sidebar-layout-tabs"
import { SidebarTasksSection } from "@/components/sidebar-tasks-section"
import { useSidebarSectionOpen } from "@/components/sidebar-section-open-state"
import {
  buildSidebarNavigation,
  type SidebarNavigationIcons,
} from "@/components/sidebar-navigation-model"
import {
  getActiveDatabaseId,
  getActiveDatabaseViewId,
  getActiveMeetingId,
  getActivePageId,
} from "@/components/sidebar-nav-list"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import { clearPromotedFullPagePath, usePromotedFullPagePath } from "@/contexts/page-side-pane"
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state"
import { buildDesktopDeepLink } from "@/lib/desktop-deep-link"
import { discoverRuntimeDesktopServer, getSelectedDesktopServer, type DesktopServer } from "@/lib/desktop-server"
import { DEFAULT_DATABASE_ITEM_ICON, DEFAULT_MEETING_ITEM_ICON } from "@/lib/item-icons"
import { getDatabaseIconNode, getPageIconNode, PageIconDisplay } from "@/lib/page-icon"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import { useSession } from "@zilobase/features/auth"
import {
  useAddDatabaseRow,
  useCreateDatabase,
  useSetDatabaseFavorite,
} from "@zilobase/features/databases"
import { useWorkspaceMeetings } from "@zilobase/features/meetings"
import {
  useCreatePage,
  usePageNavigation,
  useSetPageFavorite,
} from "@zilobase/features/pages"
import { useTeamspaces, useTeamspaceSettings } from "@zilobase/features/teamspaces"
import {
  defaultUserSettings,
  normalizeSidebarConfig,
  resolveSidebarWorkspaceLayout,
  useUpdateUserSettings,
  useUserSettings,
  withSidebarWorkspaceLayout,
  type LegacySidebarConfig,
  type SidebarConfig,
  type SidebarSection,
  type SidebarShortcut,
} from "@zilobase/features/user-settings"
import { useWorkspaces } from "@zilobase/features/workspaces"

const sidebarNavigationIcons: SidebarNavigationIcons = {
  getDatabaseIcon: (database: Parameters<typeof getDatabaseIconNode>[0]) =>
    getDatabaseIconNode(database) ?? <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />,
  getDatabaseViewIcon: (view) => <DatabaseViewIcon view={view} />,
  getMeetingIcon: (meeting: { emoji?: string | null }) =>
    <PageIconDisplay size="sm" value={meeting.emoji ?? DEFAULT_MEETING_ITEM_ICON} />,
  getPageIcon: getPageIconNode,
}

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
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const { data: session } = useSession()
  const { data: rawWorkspaces = [] } = useWorkspaces()
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
    if (desktopLinkServer || isTauri()) return
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
  const workspaces = React.useMemo(() => rawWorkspaces.filter(Boolean), [rawWorkspaces])
  const sessionWorkspaceId = session?.session?.activeWorkspaceId ?? null
  const storedWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null
  const sessionWorkspace = workspaces.find((workspace) => workspace.id === sessionWorkspaceId) ?? null
  const workspaceId = storedWorkspace?.id ?? sessionWorkspace?.id ?? workspaces[0]?.id ?? null
  const layout = React.useMemo(
    () => resolveSidebarWorkspaceLayout(sidebarConfig, workspaceId),
    [sidebarConfig, workspaceId],
  )
  const [activeTabId, setActiveTabId] = React.useState("home")
  React.useEffect(() => {
    const stored = readActiveTab(workspaceId)
    const next = layout.tabs.some((tab) => tab.id === stored) ? stored : "home"
    setActiveTabId(next)
  }, [layout.tabs, workspaceId])
  const selectTab = React.useCallback((tabId: string) => {
    setActiveTabId(tabId)
    writeActiveTab(workspaceId, tabId)
  }, [workspaceId])
  const activeTab = layout.tabs.find((tab) => tab.id === activeTabId) ?? layout.tabs[0]!
  const needsMeetings = activeTab.sections.some((section) => section.kind === "meetings")
  const { data: navigation } = usePageNavigation(workspaceId)
  const { data: teamspaces = [] } = useTeamspaces(workspaceId)
  const { data: teamspaceSettings } = useTeamspaceSettings(workspaceId)
  const { data: meetingsPayload } = useWorkspaceMeetings(needsMeetings ? workspaceId : null)
  const { isPending: isCreatingPage, mutateAsync: createPage } = useCreatePage()
  const { isPending: isCreatingDatabase, mutateAsync: createDatabase } = useCreateDatabase()
  const { setActiveThreadId } = useAiChatThreadState({ enabled: false })
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
    const legacyConfig = section.kind === "databaseView"
      ? null
      : createSectionPresentationConfig(sidebarConfig, layout, section)
    const storageKey = `zilobase:sidebar-section:v2:${workspaceId ?? "default"}:${activeTab.id}:${section.id}`
    if (section.kind === "databaseView") {
      return <SidebarDatabaseViewSection currentUserId={session?.user?.id} key={section.id} section={section} storageKey={storageKey} />
    }
    if (section.kind === "favorites") {
      return <NavFavorites favorites={favorites} key={section.id} onRemoveDatabaseFavorite={handleRemoveDatabaseFavorite} onRemoveFavorite={handleRemoveFavorite} sectionStorageKey={storageKey} sidebarConfig={legacyConfig!} workspaceId={workspaceId} />
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
      const sortedTeamspaces = [...teamspaces]
        .filter((teamspace) => teamspace.currentUserRole)
        .sort((left, right) => section.sort === "alphabetical" ? left.name.localeCompare(right.name) : Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, section.limit)
      return (
        <React.Fragment key={section.id}>
          {pageSections.teamspacePages.length ? <NavPageSection activeDatabaseId={getActiveDatabaseId(pathname)} activeDatabaseViewId={getActiveDatabaseViewId(location.search)} activeMeetingId={getActiveMeetingId(pathname, location.search)} activePageId={getActivePageId(pathname)} databaseDropTargetId={databaseDropTargetId} label={section.label || "Shared pages"} onDatabaseDropTargetChange={setDatabaseDropTargetId} onDropPageOnDatabase={handleDropPageOnDatabase} pages={pageSections.teamspacePages} sectionId="shared" sectionStorageKey={`${storageKey}:pages`} sidebarConfig={legacyConfig!} storageKey={`${storageKey}:pages:tree`} /> : null}
          {sortedTeamspaces.map((teamspace) => <NavPageSection activeDatabaseId={getActiveDatabaseId(pathname)} activeDatabaseViewId={getActiveDatabaseViewId(location.search)} activeMeetingId={getActiveMeetingId(pathname, location.search)} activePageId={getActivePageId(pathname)} databaseDropTargetId={databaseDropTargetId} key={`${section.id}:${teamspace.id}`} label={teamspace.name} onCreateDatabase={() => void handleCreateDatabase(teamspace.id)} onCreatePage={() => void handleCreatePage(teamspace.id)} onDatabaseDropTargetChange={setDatabaseDropTargetId} onDropPageOnDatabase={handleDropPageOnDatabase} pages={pageSections.teamspacePagesById[teamspace.id] ?? []} sectionId="shared" sectionStorageKey={`${storageKey}:${teamspace.id}`} showCreateAction sidebarConfig={legacyConfig!} storageKey={`${storageKey}:${teamspace.id}:tree`} teamspace={teamspace} workspaceCanManage={Boolean(teamspaceSettings?.canManage)} workspaceId={workspaceId} />)}
        </React.Fragment>
      )
    }
    const pages = section.kind === "recents" ? recents : pageSections.privatePages
    return <NavPageSection activeDatabaseId={getActiveDatabaseId(pathname)} activeDatabaseViewId={getActiveDatabaseViewId(location.search)} activeMeetingId={getActiveMeetingId(pathname, location.search)} activePageId={getActivePageId(pathname)} databaseDropTargetId={databaseDropTargetId} key={section.id} label={section.label || (section.kind === "recents" ? "Recents" : "Private")} onCreateDatabase={section.kind === "private" ? handleCreateDatabase : undefined} onCreatePage={section.kind === "private" ? handleCreatePage : undefined} onDatabaseDropTargetChange={setDatabaseDropTargetId} onDropPageOnDatabase={handleDropPageOnDatabase} pages={pages} sectionId={section.kind} sectionStorageKey={storageKey} showCreateAction={section.kind === "private"} sidebarConfig={legacyConfig!} storageKey={`${storageKey}:tree`} />
  }

  return (
    <AppSidebarShell {...props}>
      <AppSidebarHeader navigation={!customizing ? <SidebarLayoutTabs activeTabId={activeTab.id} onOpenSearch={openSearch} onSelectTab={selectTab} tabs={layout.tabs} /> : null}>
        <div className="flex h-full items-center px-1.5"><ZilobaseLogo className="h-5 w-auto" /><span className="sr-only">Zilobase</span></div>
      </AppSidebarHeader>
      {customizing ? (
        <SidebarCustomizePanel activeTabId={activeTab.id} databases={navigation?.databases ?? []} disabled={updateUserSettings.isPending} key={`${workspaceId}:${JSON.stringify(layout)}`} layout={layout} onActiveTabChange={selectTab} onCancel={() => setCustomizing(false)} onDone={saveLayout} onOpenSearch={openSearch} pages={navigation?.pages ?? []} workspaceId={workspaceId} />
      ) : (
        <SidebarContent>
          <div aria-hidden="true" className="h-3 shrink-0" />
          <ShortcutList databases={navigation?.databases ?? []} onCreateChat={handleCreateChat} onCreateDatabase={handleCreateDatabase} onCreatePage={handleCreatePage} onOpenSettings={onOpenSettings} pages={navigation?.pages ?? []} settingsOpen={settingsOpen} shortcuts={activeTab.shortcuts} />
          <DndContext collisionDetection={closestCenter} onDragEnd={handleRuntimeSectionDragEnd} sensors={runtimeSectionSensors}>
            <SortableContext items={activeTab.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
              {activeTab.sections.map((section) => <RuntimeSectionDragItem id={section.id} key={section.id}>{renderSection(section)}</RuntimeSectionDragItem>)}
            </SortableContext>
          </DndContext>
        </SidebarContent>
      )}
      <SidebarFooter className="relative z-10 bg-sidebar p-0">
        {!customizing ? (
          <SidebarMenu className="gap-3 px-4 pb-3 pt-2 group-data-[collapsible=icon]:px-1">
            <SidebarMenuItem><SidebarMenuButton onClick={() => setCustomizing(true)} tooltip="Customize sidebar" type="button"><SlidersHorizontalIcon /><span>Customize sidebar</span></SidebarMenuButton></SidebarMenuItem>
            {!isTauri() && desktopLinkServer ? <SidebarMenuItem><a className="flex w-full items-start gap-2.5 rounded-lg bg-accent p-3 text-foreground ring-1 ring-border transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2!" href={buildDesktopDeepLink(location.href, desktopLinkServer)}><MonitorUpIcon className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block text-sm font-medium">Open in desktop app</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Continue this page in the desktop experience.</span></span></a></SidebarMenuItem> : null}
          </SidebarMenu>
        ) : null}
        <div className="border-t border-border px-2 py-2"><WorkspaceSwitcher onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} /></div>
      </SidebarFooter>
    </AppSidebarShell>
  )
}

function RuntimeSectionDragItem({ children, id }: { children: React.ReactNode; id: string }) {
  const sortable = useSortable({
    animateLayoutChanges: ({ isSorting }) => isSorting,
    id,
  })
  return (
    <div
      className={cn((sortable.isDragging || sortable.isOver) && "relative z-20 bg-sidebar")}
      onPointerDown={(event) => {
        const target = event.target
        if (!(target instanceof Element) || !target.closest('[data-sidebar="group-label"]')) return
        sortable.listeners?.onPointerDown?.(event)
      }}
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
        transition: sortable.transition,
      }}
    >
      {children}
    </div>
  )
}

function ShortcutList({ databases, onCreateChat, onCreateDatabase, onCreatePage, onOpenSettings, pages, settingsOpen, shortcuts }: { databases: Array<{ id: string; name: string; views: Array<{ id: string }> }>; onCreateChat: () => Promise<void>; onCreateDatabase: () => Promise<void>; onCreatePage: () => Promise<void>; onOpenSettings?: () => void; pages: Array<{ id: string; name: string }>; settingsOpen: boolean; shortcuts: SidebarShortcut[] }) {
  const navigate = useNavigate()
  const location = useLocation()
  return <SidebarGroup className="pb-1"><SidebarGroupContent><SidebarMenu aria-label="Shortcuts">{shortcuts.map((shortcut) => {
    const target = shortcut.target
    const page = target.type === "page" ? pages.find((entry) => entry.id === target.pageId) : null
    const database = target.type === "database" ? databases.find((entry) => entry.id === target.databaseId) : null
    if ((target.type === "page" && !page) || (target.type === "database" && !database)) return null
    const label = shortcut.label || page?.name || database?.name || getShortcutLabel(shortcut)
    const activate = () => {
      if (target.type === "action") {
        if (target.action === "createPage") void onCreatePage()
        else if (target.action === "createDatabase") void onCreateDatabase()
        else void onCreateChat()
      } else if (target.type === "page") void navigate({ params: { pageId: target.pageId }, to: "/p/$pageId" })
      else if (target.type === "database") void navigate({ params: { databaseId: target.databaseId }, search: { view: target.viewId }, to: "/d/$databaseId" })
      else if (target.type === "library") void navigate({ search: { view: target.view }, to: "/recents" })
      else if (target.route === "meetings") void navigate({ search: { view: "meetings" }, to: "/recents" })
      else if (target.route === "settings") onOpenSettings?.()
      else void navigate({ to: target.route === "ai" ? "/ai" : target.route === "tasks" ? "/tasks" : "/trash" })
    }
    return <SidebarMenuItem key={shortcut.id}><SidebarMenuButton isActive={isShortcutActive(shortcut, location.pathname, location.search, settingsOpen)} onClick={activate} type="button"><SidebarShortcutIcon shortcut={shortcut} /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>
  })}</SidebarMenu></SidebarGroupContent></SidebarGroup>
}

function AiChatsSection({ limit, storageKey }: { limit: number; storageKey: string }) {
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState()
  const [open, setOpen] = useSidebarSectionOpen(storageKey)
  return <Collapsible asChild onOpenChange={setOpen} open={open}><SidebarGroup className="group/collapsible min-h-0"><CollapsibleTrigger asChild><SidebarGroupLabel asChild className="hover:bg-accent hover:text-accent-foreground"><button className="group/section-label w-full cursor-pointer" type="button"><span>AI chats</span><ChevronRightIcon className="ml-1 size-3 text-muted-foreground transition-transform group-data-[state=open]/section-label:rotate-90" /></button></SidebarGroupLabel></CollapsibleTrigger><CollapsibleContent className="pb-4 pt-0.5"><SidebarGroupContent><AiChatHistoryList activeThreadId={activeThreadId} className="px-0 py-0" limit={limit} onSelectThread={setActiveThreadId} /></SidebarGroupContent></CollapsibleContent></SidebarGroup></Collapsible>
}

function createSectionPresentationConfig(config: SidebarConfig, layout: ReturnType<typeof resolveSidebarWorkspaceLayout>, section: Exclude<SidebarSection, { kind: "databaseView" }>): LegacySidebarConfig {
  const sectionId = section.kind === "favorites" ? "favorites" : section.kind === "shared" ? "shared" : section.kind === "private" ? "private" : "recents"
  return {
    hiddenItems: [],
    libraryView: config.libraryView,
    sectionLimits: { favorites: 10, private: 10, recents: 10, shared: 10, [sectionId]: section.limit },
    sectionOrder: [sectionId],
    sectionSorts: { favorites: "lastEdited", private: "lastEdited", recents: "lastEdited", shared: "lastEdited", [sectionId]: section.sort },
    taskDatabaseIds: layout.taskDatabaseIds,
  }
}

function readActiveTab(workspaceId: string | null) {
  try { return window.localStorage.getItem(`zilobase:sidebar-active-tab:v2:${workspaceId ?? "default"}`) ?? "home" } catch { return "home" }
}
function writeActiveTab(workspaceId: string | null, tabId: string) {
  try { window.localStorage.setItem(`zilobase:sidebar-active-tab:v2:${workspaceId ?? "default"}`, tabId) } catch { /* Selection still works for this session. */ }
}
function showMutationError(fallback: string) {
  return (error: unknown) => toast.error(error instanceof Error ? error.message : fallback)
}
