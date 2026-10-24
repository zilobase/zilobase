import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { isDesktopApp } from "@/platform/environment";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  HashIcon,
  XIcon,
  MonitorUpIcon,
  SlidersHorizontalIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  ArchiveIcon,
  Building2Icon,
  CopyIcon,
  DatabaseIcon,
  FileIcon,
  HandIcon,
  Layers3Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  UserPlusIcon,
  ListChecksIcon,
  CheckIcon,
  ChevronDownIcon,
  ServerIcon,
  Settings2Icon,
} from "@/components/icons";
import * as React from "react";
import { type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { DatabaseViewIcon } from "@/sections/databases/views/shared/components/database-view-icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarNavItemAction,
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
} from "@/components/ui/sidebar";
import { buildDesktopDeepLink } from "@/platform/desktop/deep-links/desktop-deep-link";
import { type DesktopServerProfile } from "@/platform/server/desktop-server";
import { executeDesktopServerSwitch } from "@/platform/server/operations/desktop-server-switch";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_MEETING_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";
import {
  getDatabaseIconNode,
  getPageIconNode,
  getPageIconValue,
  PageIconDisplay,
} from "@/sections/pages/appearance/components/page-icon";
import type { PageMetadata } from "@zilobase/features/pages";
import type { useSession } from "@zilobase/features/auth/react";
import {
  useSetTeamspaceMembership,
  useTeamspaceLifecycle,
} from "@zilobase/features/teamspaces/react";
import {
  type SidebarSection,
  isStaticSidebarTabId,
  sidebarSectionLimits,
  type LibraryView,
} from "@zilobase/features/user-settings";
import { NotificationCenter } from "@/app/shell/notifications/components/notification-center";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type Teamspace, getTeamspaceSidebarPermissions } from "@zilobase/features/teamspaces";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
  DropDrawerLabel,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";
import { DesktopConnectServerDialog } from "@/sections/desktop/servers/components/desktop-connect-server-dialog";
import { getApiErrorMessage } from "@/platform/network/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isDatabaseLocked } from "@zilobase/features/databases";
import { SidebarEntryMenu } from "@/components/navigation/components/navigation-actions";
import {
  useSidebarTree,
  useSidebarSectionOpen,
  useSidebarDatabaseSection,
  useSidebarTasksSection,
  useSidebarPageLinks,
  useSidebarWorkspaceIdentity,
  useSidebarWorkspaceSummary,
  useSidebarWorkspaceSwitcher,
  readTriggerLabel,
  serverSectionLabel,
  getWorkspaceInitials,
  getSidebarDatabaseViewSearchId,
  getSectionLabel,
  isActiveItem,
  type SidebarIcon,
  type SidebarNavItem,
  type SidebarSectionModel,
  type SidebarLinkProps,
  type useAppSidebar,
} from "@/app/shell/sidebar/hooks/sidebar-controller";
import {
  SidebarCustomizePanel,
  SidebarLayoutTabs,
  SidebarShortcutIcon,
} from "@/app/shell/sidebar/components/sidebar-customization";

type AppSidebarProps = ReturnType<typeof useAppSidebar> &
  Pick<React.ComponentProps<typeof Sidebar>, "className" | "style">;

const CalendarAccountsSidebar = React.lazy(() =>
  import("@/sections/calendar/connections/components/calendar-accounts-sidebar").then((module) => ({
    default: module.CalendarAccountsSidebar,
  })),
);

export function AppSidebar(sidebar: AppSidebarProps) {
  const {
    openSearch,
    workspaceId,
    activeTabId,
    activeTab,
    layout,
    navItems,
    shortcuts,
    activateShortcut,
    navigation,
    customizing,
    setCustomizing,
    desktopLinkServer,
    location,
    saveLayout,
    handleRuntimeSectionDragEnd,
    selectTab,
    selectNavigationTab,
    isSaving,
    onOpenSettings,
    settingsOpen,
    className,
    style,
  } = sidebar;
  const runtimeSectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const hasOverlayTitleBar =
    isDesktopApp() &&
    (navigator.userAgent.includes("Mac") || navigator.userAgent.includes("Linux"));
  const emptyAiChats =
    navItems.some((model) => model.kind === "aiChats") &&
    navItems.every((model) => model.kind === "aiChats") &&
    sidebar.chatThreads.isSuccess &&
    sidebar.chatThreads.data.length === 0;

  return (
    <Sidebar aria-label="Application sidebar" className={className} style={style}>
      <SidebarHeader
        actions={workspaceId ? <NotificationCenter workspaceId={workspaceId} /> : null}
        className={hasOverlayTitleBar ? "shrink-0 pt-9" : "shrink-0"}
        data-desktop-drag-region={hasOverlayTitleBar ? "" : undefined}
        navigation={
          !customizing ? (
            <SidebarLayoutTabs
              activeTabId={activeTab.id}
              onOpenSearch={openSearch}
              onSelectTab={selectNavigationTab}
              tabs={layout.tabs}
            />
          ) : null
        }
      >
        <WorkspaceSwitcher onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />
      </SidebarHeader>
      {customizing ? (
        <SidebarCustomizePanel
          activeTabId={activeTabId}
          databases={navigation?.databases ?? []}
          disabled={isSaving}
          key={`${workspaceId}:${JSON.stringify(layout)}`}
          layout={layout}
          onActiveTabChange={selectTab}
          onCancel={() => setCustomizing(false)}
          onDone={saveLayout}
          onOpenSearch={openSearch}
          pages={navigation?.pages ?? []}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          {activeTab.id !== "calendar" && (
            <div className="shrink-0 pt-3" data-sidebar="shortcuts">
              <SidebarShortcutList shortcuts={shortcuts} onActivate={activateShortcut} />
            </div>
          )}
          <SidebarContent
            className={cn(
              "overflow-x-hidden overflow-y-auto overscroll-y-contain",
              emptyAiChats ? "flex" : "block",
            )}
            aria-label="Sidebar sections"
          >
            {activeTab.id === "calendar" ? (
              workspaceId ? (
                <React.Suspense fallback={null}>
                  <CalendarAccountsSidebar key={workspaceId} workspaceId={workspaceId} />
                </React.Suspense>
              ) : null
            ) : emptyAiChats ? (
              <div className="flex flex-1 items-center justify-center px-6 py-8 text-center">
                <div className="max-w-56 space-y-2">
                  <p className="text-sm font-medium text-content-primary">No AI chats yet</p>
                  <p className="text-xs leading-relaxed text-content-secondary">
                    Start a new chat to ask questions, explore ideas, or work on your pages. Your
                    conversations will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleRuntimeSectionDragEnd}
                  sensors={runtimeSectionSensors}
                >
                  <SortableContext
                    items={activeTab.sections.map((section) => section.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {activeTab.sections.map((section) => (
                      <RuntimeSectionDragItem id={section.id} key={section.id}>
                        {section.kind === "teamspaces" ? (
                          <TeamspacesSection section={section} sidebar={sidebar} />
                        ) : (
                          navItems
                            .filter((model) => model.section.id === section.id)
                            .map((model) => (
                              <NavigationSection key={model.id} model={model} sidebar={sidebar} />
                            ))
                        )}
                      </RuntimeSectionDragItem>
                    ))}
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
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setCustomizing(true)}
                title="Customize sidebar"
                type="button"
              >
                <SlidersHorizontalIcon />
                <span>Customize sidebar</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {!isDesktopApp() && desktopLinkServer ? (
              <SidebarMenuItem>
                <a
                  className="flex w-full items-start gap-2.5 rounded-lg bg-action-neutral-hover p-3 text-content-primary ring-1 ring-stroke-default transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
                  href={buildDesktopDeepLink(location.href, desktopLinkServer)}
                >
                  <MonitorUpIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Open in desktop app</span>
                    <span className="mt-0.5 block text-xs leading-snug text-content-secondary">
                      Continue this page in the desktop experience.
                    </span>
                  </span>
                </a>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}

function RuntimeSectionDragItem({ children, id }: { children: React.ReactNode; id: string }) {
  const sortable = useSortable({
    animateLayoutChanges: ({ isSorting }) => isSorting,
    id,
  });

  return (
    <div
      className={cn(
        (sortable.isDragging || sortable.isOver) && "relative z-20 bg-surface-navigation",
      )}
      onPointerDown={(event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('[data-sidebar="group-label"]')) {
          return;
        }
        sortable.listeners?.onPointerDown?.(event);
      }}
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
        transition: sortable.transition,
      }}
    >
      {children}
    </div>
  );
}

function WorkspaceSwitcher({
  onOpenSettings,
  settingsOpen = false,
}: {
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
}) {
  const { sessionData, isWorkspacePinned, isDesktop } = useSidebarWorkspaceIdentity();

  if (isWorkspacePinned && !isDesktop) {
    return <SingleWorkspaceLabel onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />;
  }

  return (
    <MultiWorkspaceSwitcher
      onOpenSettings={onOpenSettings}
      sessionData={sessionData}
      settingsOpen={settingsOpen}
    />
  );
}

function SingleWorkspaceLabel({
  onOpenSettings,
  settingsOpen,
}: {
  onOpenSettings?: () => void;
  settingsOpen: boolean;
}) {
  const { activeWorkspace, isError, isLoading } = useSidebarWorkspaceSummary();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropDrawer>
          <DropDrawerTrigger asChild>
            <SidebarMenuButton className="h-7 w-full max-w-full px-1.5" disabled={isLoading}>
              <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-action-selected text-action-on-selected">
                {activeWorkspace ? (
                  <span className="text-[10px] font-semibold">
                    {getWorkspaceInitials(activeWorkspace.name)}
                  </span>
                ) : (
                  <Building2Icon className="size-3.5" />
                )}
              </div>
              <span className="truncate font-medium">
                {readTriggerLabel({
                  activeWorkspaceName: activeWorkspace?.name,
                  isError,
                  isLoading,
                })}
              </span>
              <ChevronDownIcon className="opacity-50" />
            </SidebarMenuButton>
          </DropDrawerTrigger>
          <DropDrawerContent align="start" className="w-64 rounded-lg" side="bottom" sideOffset={4}>
            <WorkspaceSettingsItem onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />
          </DropDrawerContent>
        </DropDrawer>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function MultiWorkspaceSwitcher({
  onOpenSettings,
  sessionData,
  settingsOpen,
}: {
  onOpenSettings?: () => void;
  sessionData: ReturnType<typeof useSession>["data"];
  settingsOpen: boolean;
}) {
  const {
    navigate,
    isDesktop,
    isWorkspacePinned,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    isConnectDialogOpen,
    setIsConnectDialogOpen,
    workspaces,
    isError,
    isLoading,
    createWorkspace,
    setActiveWorkspace,
    activeWorkspace,
    currentServer,
    otherProfiles,
    showServerCaption,
    handleCreateWorkspace,
  } = useSidebarWorkspaceSwitcher(sessionData);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropDrawer>
            <DropDrawerTrigger asChild>
              <SidebarMenuButton className="h-7 w-full max-w-full px-1.5 py-0" disabled={isLoading}>
                <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-action-selected text-action-on-selected">
                  {activeWorkspace ? (
                    <span className="text-[10px] font-semibold">
                      {getWorkspaceInitials(activeWorkspace.name)}
                    </span>
                  ) : (
                    <Building2Icon className="size-3.5" />
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {readTriggerLabel({
                      activeWorkspaceName: activeWorkspace?.name,
                      isError,
                      isLoading,
                    })}
                  </span>
                  {showServerCaption ? (
                    <span className="block truncate text-[11px] font-normal text-content-secondary">
                      {serverSectionLabel(currentServer?.displayName, currentServer?.apiOrigin)}
                    </span>
                  ) : null}
                </span>
                <ChevronDownIcon className="opacity-50" />
              </SidebarMenuButton>
            </DropDrawerTrigger>
            <DropDrawerContent
              className={isDesktop ? "w-80 rounded-lg" : "w-64 rounded-lg"}
              align="start"
              side="bottom"
              sideOffset={4}
            >
              {isDesktop ? (
                <DropDrawerLabel className="text-xs text-content-secondary">
                  {serverSectionLabel(currentServer?.displayName, currentServer?.apiOrigin)}
                </DropDrawerLabel>
              ) : (
                <DropDrawerLabel className="text-xs text-content-secondary">
                  Workspaces
                </DropDrawerLabel>
              )}
              {workspaces.map((workspace, index) => (
                <DropDrawerItem
                  key={workspace.id}
                  onClick={() => {
                    void navigate({ to: "/recents" });
                    setActiveWorkspace.mutate(workspace.id);
                  }}
                  disabled={workspace.id === activeWorkspace?.id || setActiveWorkspace.isPending}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-xs border">
                    <span className="text-xs font-medium">
                      {getWorkspaceInitials(workspace.name)}
                    </span>
                  </div>
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {workspace.id === activeWorkspace?.id ? (
                    <CheckIcon className="size-4 opacity-70" />
                  ) : (
                    <DropDrawerShortcut>⌘{index + 1}</DropDrawerShortcut>
                  )}
                </DropDrawerItem>
              ))}
              {isWorkspacePinned ? null : (
                <>
                  <DropDrawerSeparator />
                  <DropDrawerItem
                    className="gap-2 p-2"
                    onSelect={() => setIsCreateDialogOpen(true)}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-surface-canvas">
                      <PlusIcon className="size-4" />
                    </div>
                    <div className="font-medium text-content-secondary">Add workspace</div>
                  </DropDrawerItem>
                </>
              )}
              {isDesktop
                ? otherProfiles.map((profile) => (
                    <OtherServerSection
                      key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}
                      onSwitch={(workspaceId) => {
                        void executeDesktopServerSwitch({
                          hasCredentials: profile.hasCredentials,
                          path: profile.hasCredentials
                            ? (profile.lastPath ?? "/recents")
                            : "/login",
                          server: profile.server,
                          workspaceId,
                        });
                      }}
                      profile={profile}
                    />
                  ))
                : null}
              {isDesktop ? (
                <>
                  <DropDrawerSeparator />
                  <DropDrawerItem
                    className="gap-2 p-2"
                    onSelect={() => setIsConnectDialogOpen(true)}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-surface-canvas">
                      <ServerIcon className="size-4" />
                    </div>
                    <div className="font-medium text-content-secondary">Connect another server</div>
                  </DropDrawerItem>
                </>
              ) : null}
              <DropDrawerSeparator />
              <WorkspaceSettingsItem onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />
            </DropDrawerContent>
          </DropDrawer>
        </SidebarMenuItem>
      </SidebarMenu>
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          createWorkspace.reset();
        }}
      >
        <DialogContent>
          <form onSubmit={handleCreateWorkspace}>
            <DialogHeader>
              <DialogTitle>Add workspace</DialogTitle>
              <DialogDescription className="sr-only">
                Create a new workspace and switch to it.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="new-workspace-name">Workspace name</FieldLabel>
                <Input
                  id="new-workspace-name"
                  name="workspaceName"
                  placeholder="Acme Inc."
                  autoComplete="workspace"
                  disabled={createWorkspace.isPending}
                  required
                />
              </Field>
              {createWorkspace.isError && (
                <FieldError>{getApiErrorMessage(createWorkspace.error)}</FieldError>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={createWorkspace.isPending}
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createWorkspace.isPending}>
                {createWorkspace.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {isDesktop ? (
        <DesktopConnectServerDialog
          onOpenChange={setIsConnectDialogOpen}
          open={isConnectDialogOpen}
        />
      ) : null}
    </>
  );
}

function OtherServerSection({
  onSwitch,
  profile,
}: {
  onSwitch: (workspaceId?: string | null) => void;
  profile: DesktopServerProfile;
}) {
  const label = serverSectionLabel(profile.server.displayName, profile.server.apiOrigin);
  const workspaces = profile.workspaces;
  const signInHint = !profile.hasCredentials;

  return (
    <>
      <DropDrawerSeparator />
      <DropDrawerLabel className="text-xs text-content-secondary">{label}</DropDrawerLabel>
      {workspaces.length > 0 ? (
        workspaces.map((workspace) => (
          <DropDrawerItem
            key={workspace.id}
            className="gap-2 p-2"
            onClick={() => onSwitch(workspace.id)}
          >
            <div className="flex size-6 items-center justify-center rounded-xs border">
              <span className="text-xs font-medium">{getWorkspaceInitials(workspace.name)}</span>
            </div>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {signInHint ? (
              <span className="text-[11px] text-content-secondary">Sign in</span>
            ) : null}
          </DropDrawerItem>
        ))
      ) : (
        <DropDrawerItem className="gap-2 p-2" onClick={() => onSwitch(null)}>
          <div className="flex size-6 items-center justify-center rounded-md border bg-surface-canvas">
            <ServerIcon className="size-4" />
          </div>
          <span className="min-w-0 flex-1 truncate">
            {signInHint ? "Sign in to see workspaces" : profile.server.displayName}
          </span>
        </DropDrawerItem>
      )}
    </>
  );
}

function WorkspaceSettingsItem({
  onOpenSettings,
  settingsOpen,
}: {
  onOpenSettings?: () => void;
  settingsOpen: boolean;
}) {
  return (
    <DropDrawerItem
      className={settingsOpen ? "bg-action-neutral-hover text-action-on-neutral" : undefined}
      onSelect={onOpenSettings}
    >
      <Settings2Icon />
      <span>Settings</span>
    </DropDrawerItem>
  );
}

type LinkProps = SidebarLinkProps;

type SidebarNavListProps = {
  activeDatabaseId: string | null;
  activeDatabaseViewId?: string | null;
  activePageId: string | null;
  activeMeetingId?: string | null;
  depthOffset?: number;
  getLinkProps?: (input: { displayName: string; item: SidebarNavItem }) => LinkProps | undefined;
  items: SidebarNavItem[];
  renderItemMenu: (input: { item: SidebarNavItem; nested: boolean }) => ReactNode;
  storageKey: string;
};

const rowClassName = cn("peer/menu-button pr-8", SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME);

function SidebarNavList(props: SidebarNavListProps) {
  return <SidebarNavListContent key={props.storageKey} {...props} />;
}

function SidebarNavListContent({
  activeDatabaseId,
  activeDatabaseViewId = null,
  activePageId,
  activeMeetingId = null,
  depthOffset = 0,
  getLinkProps,
  items,
  renderItemMenu,
  storageKey,
}: SidebarNavListProps) {
  const { defaultViewIds, expandedIds, setExpanded } = useSidebarTree(storageKey, items);

  return items.map((item) => (
    <SidebarNavRow
      activeDatabaseId={activeDatabaseId}
      activeDatabaseViewId={activeDatabaseViewId}
      activePageId={activePageId}
      activeMeetingId={activeMeetingId}
      defaultViewIds={defaultViewIds}
      depth={depthOffset}
      expandedIds={expandedIds}
      getLinkProps={getLinkProps}
      item={item}
      key={item.navNodeId ?? item.id}
      renderItemMenu={renderItemMenu}
      setExpanded={setExpanded}
    />
  ));
}

function SidebarNavRow({
  activeDatabaseId,
  activeDatabaseViewId,
  activePageId,
  activeMeetingId,
  defaultViewIds,
  depth,
  expandedIds,
  getLinkProps,
  item,
  renderItemMenu,
  setExpanded,
}: Omit<SidebarNavListProps, "items" | "storageKey"> & {
  defaultViewIds: Map<string, string>;
  depth: number;
  expandedIds: ReadonlySet<string>;
  item: SidebarNavItem;
  setExpanded: (id: string, expanded: boolean) => void;
}) {
  const id = item.navNodeId ?? item.id;
  const displayName = item.name.trim() || "Untitled";
  const hasChildren = item.pages.length > 0;
  const expanded = expandedIds.has(id);
  const defaultViewId = item.databaseId ? defaultViewIds.get(item.databaseId) : undefined;
  const viewId = getSidebarDatabaseViewSearchId({
    databaseId: item.databaseId,
    databaseViewId: item.databaseViewId,
    defaultDatabaseViewId: defaultViewId,
    isDatabaseView: item.isDatabaseView,
  });
  const selectedViewId = item.databaseId ? (viewId ?? defaultViewId ?? null) : null;
  const linkProps = getLinkProps?.({ displayName, item });
  const linkStyle = {
    ...linkProps?.style,
    paddingLeft: `${8 + depth * 16}px`,
  } as CSSProperties;
  const active = isActiveItem(
    item,
    activePageId,
    activeMeetingId ?? null,
    activeDatabaseId,
    activeDatabaseViewId ?? null,
    defaultViewIds,
  );

  const content = (
    <>
      <span
        className={`flex size-4 shrink-0 items-center justify-center overflow-hidden ${
          hasChildren
            ? "group-hover/nav-row:opacity-0 group-has-[>[data-nav-menu-action=disclosure]:focus-visible]/nav-row:opacity-0"
            : ""
        }`}
      >
        <SidebarItemIcon icon={item.emoji} />
      </span>
      <span className="min-w-0 truncate">{displayName}</span>
      <ItemIndicators item={item} />
    </>
  );

  return (
    <Collapsible asChild onOpenChange={(open) => setExpanded(id, open)} open={expanded}>
      <SidebarMenuItem>
        <div className="group/nav-row relative">
          <SidebarMenuButton asChild className={rowClassName} isActive={active}>
            {item.href ? (
              <Link to={item.href} title={displayName} {...linkProps} style={linkStyle}>
                {content}
              </Link>
            ) : item.isMeeting && item.meetingId ? (
              <Link
                params={{ meetingId: item.meetingId } as never}
                title={displayName}
                to="/m/$meetingId"
                {...linkProps}
                style={linkStyle}
              >
                {content}
              </Link>
            ) : (item.isDatabase || item.isDatabaseView) && item.databaseId ? (
              <Link
                params={{ databaseId: item.databaseId } as never}
                search={{ view: viewId } as never}
                state={
                  ((previous: Record<string, unknown>) => ({
                    ...previous,
                    zilobaseDatabaseViewSelection: {
                      databaseId: item.databaseId,
                      token: crypto.randomUUID(),
                      viewId: selectedViewId,
                    },
                  })) as never
                }
                title={displayName}
                to="/d/$databaseId"
                {...linkProps}
                style={linkStyle}
              >
                {content}
              </Link>
            ) : (
              <Link
                params={{ pageId: item.pageId as string } as never}
                title={displayName}
                to="/p/$pageId"
                {...linkProps}
                style={linkStyle}
              >
                {content}
              </Link>
            )}
          </SidebarMenuButton>
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <SidebarNavItemAction
                depth={depth}
                position="start"
                title={`${expanded ? "Collapse" : "Expand"} ${displayName}`}
                type="button"
                variant="disclosure"
              >
                <ChevronRightIcon weight="fill" />
                <span className="sr-only">
                  {expanded ? "Collapse" : "Expand"} {displayName}
                </span>
              </SidebarNavItemAction>
            </CollapsibleTrigger>
          ) : null}
          {renderItemMenu({ item, nested: depth > 0 })}
        </div>
        {hasChildren ? (
          <CollapsibleContent className="pt-0.5">
            <ul className="flex min-w-0 flex-col gap-px">
              {item.pages.map((child) => (
                <SidebarNavRow
                  activeDatabaseId={activeDatabaseId}
                  activeDatabaseViewId={activeDatabaseViewId}
                  activePageId={activePageId}
                  activeMeetingId={activeMeetingId}
                  defaultViewIds={defaultViewIds}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  getLinkProps={getLinkProps}
                  item={child}
                  key={child.navNodeId ?? child.id}
                  renderItemMenu={renderItemMenu}
                  setExpanded={setExpanded}
                />
              ))}
            </ul>
          </CollapsibleContent>
        ) : null}
      </SidebarMenuItem>
    </Collapsible>
  );
}

function ItemIndicators({ item }: { item: SidebarNavItem }) {
  if (!item.isLinked) {
    return null;
  }

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 transition-opacity group-hover/nav-row:opacity-0 group-has-[>[data-nav-menu-action=menu]:focus-visible]/nav-row:opacity-0 group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:opacity-0 group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:opacity-0">
      {item.isLinked ? (
        <ArrowUpRightIcon
          aria-label="Linked from another parent"
          className="size-3 text-content-secondary"
        />
      ) : null}
    </span>
  );
}

function TeamspaceActionsMenu({
  teamspace,
  workspaceCanManage,
  workspaceId,
}: {
  teamspace: Teamspace;
  workspaceCanManage: boolean;
  workspaceId?: string | null;
}) {
  const navigate = useNavigate();
  const membership = useSetTeamspaceMembership();
  const lifecycle = useTeamspaceLifecycle();
  const { canArchive, canInvite, canLeave, canManage } = getTeamspaceSidebarPermissions(
    teamspace,
    workspaceCanManage,
  );
  const openSettings = (tab: "general" | "members") => {
    void navigate({
      search: { tab, teamspace: teamspace.id },
      to: "/settings/teamspaces",
    });
  };

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
        <DropDrawerItem disabled={!canInvite} onSelect={() => openSettings("members")}>
          <UserPlusIcon />
          <span>Add members</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem disabled={!canManage} onSelect={() => openSettings("general")}>
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
            if (!workspaceId) return;
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
            );
          }}
        >
          <HandIcon />
          <span>Leave teamspace</span>
        </DropDrawerItem>
        <DropDrawerItem
          disabled={!canArchive || lifecycle.isPending}
          onSelect={() => {
            if (!workspaceId) return;
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
            );
          }}
          variant="destructive"
        >
          <ArchiveIcon />
          <span>Archive teamspace</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  );
}

function TeamspaceHeader({
  teamspace,
  open,
  sidebar,
}: {
  teamspace: Teamspace;
  open: boolean;
  sidebar: AppSidebarProps;
}) {
  const icon =
    typeof teamspace.icon === "string" && teamspace.icon ? (
      <PageIconDisplay size="sm" value={teamspace.icon} />
    ) : (
      <Layers3Icon className="size-4 text-content-secondary" />
    );
  return (
    <div className="group/nav-row relative">
      <CollapsibleTrigger asChild>
        <SidebarMenuButton
          className={cn("peer/menu-button pr-20", SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME)}
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
          title={`${open ? "Collapse" : "Expand"} ${teamspace.name}`}
          type="button"
          variant="disclosure"
        >
          <ChevronRightIcon weight="fill" />
          <span className="sr-only">
            {open ? "Collapse" : "Expand"} {teamspace.name}
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
          <DropDrawerItem onSelect={() => sidebar.handleCreatePage(teamspace.id)}>
            <FileIcon className="text-content-secondary" />
            <span>Page</span>
          </DropDrawerItem>
          <DropDrawerItem onSelect={() => sidebar.handleCreateDatabase(teamspace.id)}>
            <DatabaseIcon className="text-content-secondary" />
            <span>Database</span>
          </DropDrawerItem>
        </DropDrawerContent>
      </DropDrawer>
      <TeamspaceActionsMenu
        teamspace={teamspace}
        workspaceCanManage={sidebar.workspaceCanManage}
        workspaceId={sidebar.workspaceId}
      />
    </div>
  );
}

function SidebarItemIcon({ icon }: { icon: SidebarIcon | null }) {
  if (!icon) return null;
  if (icon.kind === "page") return getPageIconNode(icon.page);
  if (icon.kind === "database")
    return (
      getDatabaseIconNode(icon.database) ?? (
        <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />
      )
    );
  if (icon.kind === "view") return <DatabaseViewIcon view={icon.view} />;
  if (icon.kind === "meeting")
    return <PageIconDisplay size="sm" value={icon.value ?? DEFAULT_MEETING_ITEM_ICON} />;
  if (icon.kind === "task") return <ListChecksIcon />;
  if (icon.kind === "file") return <FileIcon />;
  return <PageIconDisplay size="sm" value={icon.value} />;
}

function SectionShell({
  label,
  open,
  onOpenChange,
  actions,
  header,
  section,
  sidebar,
  children,
}: {
  section?: SidebarSection;
  sidebar?: AppSidebarProps;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible asChild open={open} onOpenChange={onOpenChange}>
      <SidebarGroup className="group/collapsible">
        {header ?? (
          <div className="group/section-header relative">
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel
                asChild
                className="pr-24 group-hover/section-header:bg-action-neutral-hover group-hover/section-header:text-action-on-neutral [&>svg]:size-2.5"
              >
                <button className="group/section-label w-full cursor-pointer" type="button">
                  <span>{label}</span>
                  <ChevronRightIcon className="ml-1 size-2.5 transition-transform group-data-[state=open]/section-label:rotate-90" />
                </button>
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            {actions}
            {section && sidebar ? <SectionActionsMenu section={section} sidebar={sidebar} /> : null}
          </div>
        )}
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function SectionActionsMenu({
  section,
  sidebar,
}: {
  section: SidebarSection;
  sidebar: AppSidebarProps;
}) {
  const index = sidebar.activeTab.sections.findIndex((entry) => entry.id === section.id);
  const destinations = sidebar.layout.tabs.filter(
    (tab) => tab.id !== sidebar.activeTab.id && !isStaticSidebarTabId(tab.id),
  );
  const label = getSectionLabel(section);
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarGroupAction
          aria-label={`${label} section options`}
          title={`${label} section options`}
          disabled={sidebar.isSaving}
          className="right-2 transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon />
        </SidebarGroupAction>
      </DropDrawerTrigger>
      <DropDrawerContent align="start" side="right" className="w-56 rounded-xl">
        <DropDrawerSub title="Show">
          <DropDrawerSubTrigger>
            <HashIcon />
            <span>Show</span>
            <span className="ml-auto text-xs text-content-secondary">{section.limit}</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-36">
            {sidebarSectionLimits.map((limit) => (
              <DropDrawerItem
                key={limit}
                onSelect={() => sidebar.changeRuntimeSection(section.id, { limit })}
              >
                <span className="flex size-4 items-center">
                  {section.limit === limit ? <CheckIcon /> : null}
                </span>
                {limit} items
              </DropDrawerItem>
            ))}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSeparator />
        <DropDrawerItem
          disabled={index <= 0}
          onSelect={() => sidebar.changeRuntimeSection(section.id, { offset: -1 })}
        >
          <ArrowUpIcon />
          Move up
        </DropDrawerItem>
        <DropDrawerItem
          disabled={index === sidebar.activeTab.sections.length - 1}
          onSelect={() => sidebar.changeRuntimeSection(section.id, { offset: 1 })}
        >
          <ArrowDownIcon />
          Move down
        </DropDrawerItem>
        <DropDrawerSub title="Move to tab">
          <DropDrawerSubTrigger disabled={isStaticSidebarTabId(sidebar.activeTab.id)}>
            <ArrowRightIcon />
            Move to tab
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-48">
            {destinations.length ? (
              destinations.map((tab) => (
                <DropDrawerItem
                  key={tab.id}
                  disabled={
                    tab.sections.length >= 24 ||
                    tab.sections.some((entry) => entry.id === section.id)
                  }
                  onSelect={() => sidebar.changeRuntimeSection(section.id, { targetTabId: tab.id })}
                >
                  {tab.name}
                </DropDrawerItem>
              ))
            ) : (
              <DropDrawerItem onSelect={() => sidebar.setCustomizing(true)}>
                <PlusIcon />
                Create a tab…
              </DropDrawerItem>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerItem onSelect={() => sidebar.changeRuntimeSection(section.id, { remove: true })}>
          <XIcon />
          Remove section
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem onSelect={() => sidebar.setCustomizing(true)}>
          <SlidersHorizontalIcon />
          Customize sidebar
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  );
}

function SidebarViewAll({ label, view }: { label: string; view: LibraryView }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="text-content-secondary">
        <Link aria-label={`View all ${label}`} to="/recents" search={{ view }}>
          <MoreHorizontalIcon />
          <span>View all</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function TeamspacesSection({
  section,
  sidebar,
}: {
  section: SidebarSection;
  sidebar: AppSidebarProps;
}) {
  const [open, setOpen] = useSidebarSectionOpen(
    `zilobase:sidebar-section:${sidebar.workspaceId ?? "default"}:${sidebar.activeTab.id}:${section.id}`,
  );
  const models = sidebar.navItems.filter((model) => model.section.id === section.id);
  return (
    <SectionShell
      label={section.label || "Teamspaces"}
      section={section}
      sidebar={sidebar}
      open={open}
      onOpenChange={setOpen}
      actions={<SidebarLibraryLink className="right-9" label="Teamspaces" sectionId="teamspaces" />}
    >
      {models.map((model) => (
        <NavigationSection key={model.id} model={model} sidebar={sidebar} />
      ))}
      <SidebarMenu>
        <SidebarViewAll label="Teamspaces" view="teamspaces" />
      </SidebarMenu>
    </SectionShell>
  );
}

function CreateMenu({
  onCreatePage,
  onCreateDatabase,
}: {
  onCreatePage: () => void;
  onCreateDatabase: () => void;
}) {
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarGroupAction
          aria-label="Create"
          className="right-9 transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          title="Create"
        >
          <PlusIcon />
        </SidebarGroupAction>
      </DropDrawerTrigger>
      <DropDrawerContent align="end" className="w-44 rounded-lg">
        <DropDrawerItem onSelect={onCreatePage}>
          <FileIcon className="text-content-secondary" />
          <span>Page</span>
        </DropDrawerItem>
        <DropDrawerItem onSelect={onCreateDatabase}>
          <DatabaseIcon className="text-content-secondary" />
          <span>Database</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  );
}

function NavigationSection({
  model,
  sidebar,
}: {
  model: SidebarSectionModel;
  sidebar: AppSidebarProps;
}) {
  if (model.section.kind === "databaseView")
    return (
      <DatabaseSection section={model.section} storageKey={model.storageKey} sidebar={sidebar} />
    );
  if (model.kind === "tasks") return <TasksSection model={model} sidebar={sidebar} />;
  if (model.kind === "aiChats") return <AiChatsSection model={model} sidebar={sidebar} />;
  return <StaticSection model={model} sidebar={sidebar} />;
}

function AiChatsSection({
  model,
  sidebar,
}: {
  model: SidebarSectionModel;
  sidebar: AppSidebarProps;
}) {
  const [open, setOpen] = useSidebarSectionOpen(model.storageKey);
  const threads = [...(sidebar.chatThreads.data ?? [])]
    .sort((left, right) =>
      "sort" in model.section && model.section.sort === "alphabetical"
        ? left.title.localeCompare(right.title)
        : right.updatedAt.localeCompare(left.updatedAt),
    )
    .slice(0, model.section.limit);
  return (
    <SectionShell
      label={model.label}
      open={open}
      onOpenChange={setOpen}
      section={model.section}
      sidebar={sidebar}
    >
      <SidebarMenu aria-label="AI chats">
        {threads.map((thread) => (
          <SidebarMenuItem key={thread.id}>
            <SidebarMenuButton
              type="button"
              isActive={sidebar.chatSelection.id === thread.id}
              aria-current={sidebar.chatSelection.id === thread.id ? "page" : undefined}
              title={thread.title}
              onClick={() => {
                void sidebar.handleOpenChat(thread.id);
              }}
            >
              <span>{thread.title.trim() || "Untitled chat"}</span>
              {["queued", "running"].includes(thread.status ?? "") && (
                <span
                  aria-hidden="true"
                  title="Writing answer"
                  className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-content-secondary"
                />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        {sidebar.chatThreads.isLoading ? (
          <li role="status" className="px-2 py-1.5 text-xs text-content-secondary">
            Loading chats…
          </li>
        ) : null}
        {sidebar.chatThreads.isError ? (
          <li className="px-2 py-1.5 text-xs text-content-secondary">
            <p role="alert">Could not load chats.</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                void sidebar.chatThreads.refetch();
              }}
            >
              Retry
            </Button>
          </li>
        ) : null}
      </SidebarMenu>
    </SectionShell>
  );
}

function StaticSection({
  model,
  sidebar,
}: {
  model: SidebarSectionModel;
  sidebar: AppSidebarProps;
}) {
  const [open, setOpen] = useSidebarSectionOpen(model.storageKey);
  const getLinkProps = useSidebarPageLinks({
    databaseDropTargetId: sidebar.databaseDropTargetId,
    onDatabaseDropTargetChange: sidebar.setDatabaseDropTargetId,
    onDropPageOnDatabase: sidebar.handleDropPageOnDatabase,
  });
  const librarySection =
    model.kind === "favorites" ||
    model.kind === "private" ||
    model.kind === "recents" ||
    model.kind === "shared" ||
    model.kind === "meetings" ||
    model.kind === "teamspaces"
      ? model.kind
      : null;
  return (
    <SectionShell
      label={model.label}
      section={model.section}
      sidebar={sidebar}
      open={open}
      onOpenChange={setOpen}
      header={
        model.teamspace ? (
          <TeamspaceHeader teamspace={model.teamspace} open={open} sidebar={sidebar} />
        ) : undefined
      }
      actions={
        <>
          {librarySection ? (
            <SidebarLibraryLink
              className={model.create ? "right-16" : "right-9"}
              label={model.label}
              sectionId={librarySection}
            />
          ) : null}
          {model.create ? (
            <CreateMenu
              onCreatePage={() => void sidebar.handleCreatePage()}
              onCreateDatabase={() => void sidebar.handleCreateDatabase()}
            />
          ) : null}
        </>
      }
    >
      <SidebarMenu
        aria-label={
          model.kind === "favorites"
            ? "Favorite pages"
            : model.kind === "meetings"
              ? "Meetings"
              : model.label + " pages"
        }
      >
        <SidebarNavList
          {...sidebar.activeNavigation}
          items={model.items}
          storageKey={model.treeKey}
          depthOffset={model.teamspace ? 1 : 0}
          getLinkProps={
            model.kind === "favorites" || model.kind === "meetings" ? undefined : getLinkProps
          }
          renderItemMenu={({ item }) =>
            item.isMeeting || item.isDatabaseView ? null : (
              <SidebarEntryMenu
                item={item}
                favoriteOnly={model.kind === "favorites"}
                onRemoveFavorite={sidebar.handleRemoveFavorite}
                onRemoveDatabaseFavorite={sidebar.handleRemoveDatabaseFavorite}
              />
            )
          }
        />
        {librarySection ? (
          <SidebarViewAll label={model.label} view={getLibraryViewForSection(librarySection)} />
        ) : null}
        {model.items.length === 0 ? (
          <li className="px-2 py-1.5 text-xs text-content-secondary">
            {sidebar.navigationLoading && model.kind !== "meetings"
              ? "Loading…"
              : sidebar.navigationError && model.kind !== "meetings"
                ? "Source unavailable"
                : model.kind === "favorites"
                  ? "No favorites"
                  : model.kind === "meetings"
                    ? "Meeting blocks on pages appear here."
                    : "No pages"}
          </li>
        ) : null}
      </SidebarMenu>
    </SectionShell>
  );
}

function SidebarShortcutList({
  shortcuts,
  onActivate,
}: {
  shortcuts: AppSidebarProps["shortcuts"];
  onActivate: AppSidebarProps["activateShortcut"];
}) {
  return (
    <SidebarGroup className="pb-1">
      <SidebarGroupContent>
        <SidebarMenu aria-label="Shortcuts">
          {shortcuts.map((shortcut) => (
            <SidebarMenuItem key={shortcut.id}>
              <SidebarMenuButton
                isActive={shortcut.active}
                onClick={() => onActivate(shortcut)}
                type="button"
              >
                <SidebarShortcutIcon shortcut={shortcut} />
                <span>{shortcut.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function TasksSection({
  model,
  sidebar,
}: {
  model: SidebarSectionModel;
  sidebar: AppSidebarProps;
}) {
  const { open, setOpen, rows, loading } = useSidebarTasksSection({
    databaseIds: sidebar.layout.taskDatabaseIds,
    limit: model.section.limit,
    storageKey: model.storageKey,
  });
  const items: SidebarNavItem[] = rows.map((row) => ({
    id: row.databaseId + ":" + row.rowId,
    name: row.title.trim() || "Untitled",
    emoji: { kind: "task" },
    pageId: row.pageId,
    pages: [],
    isShared: false,
  }));
  if (!sidebar.layout.taskDatabaseIds.length)
    items.push({
      id: "configure-tasks",
      name: "Configure My Tasks",
      emoji: { kind: "task" },
      pageId: null,
      href: "/tasks",
      pages: [],
      isShared: false,
    });
  return (
    <SectionShell
      label={model.label}
      open={open}
      onOpenChange={setOpen}
      section={model.section}
      sidebar={sidebar}
    >
      <SidebarMenu aria-label="My tasks">
        <SidebarNavList
          {...sidebar.activeNavigation}
          items={items}
          storageKey={model.treeKey}
          renderItemMenu={() => null}
        />
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link to="/tasks">
              <MoreHorizontalIcon />
              <span>View all</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {!items.length ? (
          <li className="px-2 py-1.5 text-xs text-content-secondary">
            {loading ? "Loading tasks…" : "No tasks assigned to you"}
          </li>
        ) : null}
      </SidebarMenu>
    </SectionShell>
  );
}

function DatabaseSection({
  section,
  storageKey,
  sidebar,
}: {
  section: Extract<SidebarSection, { kind: "databaseView" }>;
  storageKey: string;
  sidebar: AppSidebarProps;
}) {
  const { open, setOpen, database, records, rows, title, activeDataSourceId, addRow, hasMore } =
    useSidebarDatabaseSection({ section, storageKey, currentUserId: sidebar.currentUserId });
  const pagesByRowId = new Map(records.records.map((record) => [record.id, record.page]));
  const items: SidebarNavItem[] = rows.map((row) => ({
    id: row.id,
    name: row.page.name.trim() || "Untitled",
    emoji: section.showPageIcon
      ? {
          kind: "value",
          value: getPageIconValue({
            hasContent: pagesByRowId.get(row.id)?.hasContent,
            metadata: pagesByRowId.get(row.id)?.metadata as PageMetadata | null,
          }),
        }
      : null,
    pageId: row.pageId,
    pages: [],
    isShared: false,
  }));
  return (
    <SectionShell
      label={title}
      section={section}
      sidebar={sidebar}
      open={open}
      onOpenChange={setOpen}
      actions={
        <>
          {database.data &&
          activeDataSourceId &&
          database.data.database.accessLevel !== "view" &&
          !isDatabaseLocked(database.data.database) ? (
            <SidebarGroupAction
              aria-label={"Add row to " + title}
              className="right-16 text-content-secondary hover:bg-action-neutral-hover hover:text-action-on-neutral"
              title="Add row"
              onClick={() =>
                addRow.mutate(
                  { databaseId: activeDataSourceId, title: "Untitled" },
                  {
                    onError: (error) =>
                      toast.error(error instanceof Error ? error.message : "Could not add row."),
                  },
                )
              }
            >
              <PlusIcon />
            </SidebarGroupAction>
          ) : null}
          <SidebarGroupAction
            asChild
            className="right-9 text-content-secondary hover:bg-action-neutral-hover hover:text-action-on-neutral"
            title="View all"
          >
            <Link
              params={{ databaseId: section.databaseId }}
              search={{ view: section.viewId }}
              to="/d/$databaseId"
            >
              <DatabaseIcon />
              <span className="sr-only">View all</span>
            </Link>
          </SidebarGroupAction>
        </>
      }
    >
      {database.isLoading || records.status === "loading" ? (
        <p className="px-2 py-1.5 text-xs text-content-secondary">Loading…</p>
      ) : database.isError || records.status === "error" || !database.data ? (
        <p className="rounded-md bg-surface-muted px-2 py-2 text-xs text-content-secondary">
          Source unavailable
        </p>
      ) : !items.length ? (
        <p className="px-2 py-1.5 text-xs text-content-secondary">No matching rows</p>
      ) : (
        <SidebarMenu aria-label={title + " rows"}>
          <SidebarNavList
            {...sidebar.activeNavigation}
            items={items}
            storageKey={storageKey + ":tree"}
            renderItemMenu={() => null}
          />
          {hasMore ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link
                  params={{ databaseId: section.databaseId }}
                  search={{ view: section.viewId }}
                  to="/d/$databaseId"
                >
                  View all
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      )}
    </SectionShell>
  );
}

function SidebarLibraryLink({
  className,
  label,
  sectionId,
  view: viewOverride,
}: {
  className?: string;
  label: string;
  sectionId: "recents" | "favorites" | "private" | "shared" | "meetings" | "teamspaces";
  view?: LibraryView;
}) {
  const view = viewOverride ?? getLibraryViewForSection(sectionId);

  return (
    <SidebarGroupAction
      asChild
      className={cn(
        "transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100",
        className,
      )}
    >
      <Link
        aria-label={`Open ${label} in Library`}
        search={{ view }}
        title={`Open ${label} in Library`}
        to="/recents"
      >
        <ArrowUpRightIcon />
      </Link>
    </SidebarGroupAction>
  );
}

function getLibraryViewForSection(
  sectionId: "recents" | "favorites" | "private" | "shared" | "meetings" | "teamspaces",
): LibraryView {
  return sectionId === "favorites" ? "favourites" : sectionId;
}
