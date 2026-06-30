"use client"

import { useMemo, type ComponentProps, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, ChevronRightIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { type NotelabAiMode } from "@notelab/features/workspaces"

export type WorkspaceNavItem = {
  databaseId?: string | null
  databaseViewId?: string | null
  id: string
  isDatabase?: boolean
  isDatabaseView?: boolean
  isFavorite?: boolean
  isLinked?: boolean
  isTeamspace: boolean
  name: string
  navNodeId?: string
  emoji: ReactNode
  notelabai?: NotelabAiMode | null
  workspaceId: string
  pages: WorkspaceNavItem[]
}

type NavTreeLinkProps = Partial<
  Omit<ComponentProps<typeof Link>, "params" | "title" | "to">
>

type NavTreeItemMenuRender = (input: {
  item: WorkspaceNavItem
  nested: boolean
}) => ReactNode

type NavTreeLinkPropsGetter = (input: {
  displayName: string
  item: WorkspaceNavItem
}) => NavTreeLinkProps | undefined

const rowHoverClassName =
  "group-hover/nav-row:bg-sidebar-accent group-hover/nav-row:text-sidebar-accent-foreground group-has-[>[data-nav-menu-action=more][aria-expanded=true]]/nav-row:bg-sidebar-accent group-has-[>[data-nav-menu-action=more][aria-expanded=true]]/nav-row:text-sidebar-accent-foreground"
const inactiveRowClassName = "data-[active=false]:text-sidebar-foreground/70"
const disclosureActionClassName =
  "left-2 opacity-0 text-sidebar-foreground/70 data-[state=open]:rotate-90 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground peer-data-[active=false]/menu-button:text-sidebar-foreground/70 group-hover/nav-row:opacity-100 group-hover/nav-row:text-sidebar-accent-foreground hover:bg-transparent hover:text-sidebar-accent-foreground focus-visible:opacity-100"
const leadingIconClassName =
  "flex size-5 shrink-0 items-center justify-center"
const treeSubClassName =
  "ml-6 mr-0 translate-x-0 gap-1 py-1 pl-0 pr-0"

export function NavTree({
  activeDatabaseId,
  activeDatabaseViewId,
  activeWorkspaceId,
  getLinkProps,
  items,
  renderItemMenu,
}: {
  activeDatabaseId: string | null
  activeDatabaseViewId?: string | null
  activeWorkspaceId: string | null
  getLinkProps?: NavTreeLinkPropsGetter
  items: WorkspaceNavItem[]
  renderItemMenu: NavTreeItemMenuRender
}) {
  const defaultDatabaseViewIds = useMemo(
    () => getDefaultDatabaseViewIds(items),
    [items],
  )

  return items.map((item) => (
    <NavTreeItem
      activeDatabaseId={activeDatabaseId}
      activeDatabaseViewId={activeDatabaseViewId ?? null}
      activeWorkspaceId={activeWorkspaceId}
      defaultDatabaseViewIds={defaultDatabaseViewIds}
      getLinkProps={getLinkProps}
      isRoot
      item={item}
      key={item.navNodeId ?? item.id}
      renderItemMenu={renderItemMenu}
    />
  ))
}

function NavTreeItem({
  activeDatabaseId,
  activeDatabaseViewId,
  activeWorkspaceId,
  defaultDatabaseViewIds,
  getLinkProps,
  isRoot = false,
  item,
  renderItemMenu,
}: {
  activeDatabaseId: string | null
  activeDatabaseViewId: string | null
  activeWorkspaceId: string | null
  defaultDatabaseViewIds: Map<string, string>
  getLinkProps?: NavTreeLinkPropsGetter
  isRoot?: boolean
  item: WorkspaceNavItem
  renderItemMenu: NavTreeItemMenuRender
}) {
  const isDatabaseRouteItem = Boolean(
    (item.isDatabase || item.isDatabaseView) && item.databaseId,
  )
  const isActive = getIsActiveNavItem({
    activeDatabaseId,
    activeDatabaseViewId,
    activeWorkspaceId,
    defaultDatabaseViewIds,
    item,
  })
  const hasPages = item.pages.length > 0
  const isOpen =
    isActive ||
    hasActiveDescendant(
      item,
      activeDatabaseId,
      activeDatabaseViewId,
      activeWorkspaceId,
      defaultDatabaseViewIds,
    )
  const displayName = item.name.trim() || "Untitled"
  const nested = !isRoot
  const linkProps = getLinkProps?.({ displayName, item })
  const Button = isRoot ? SidebarMenuButton : SidebarMenuSubButton
  const Container = isRoot ? SidebarMenuItem : SidebarMenuSubItem
  const buttonClassName = isRoot
    ? `${inactiveRowClassName} ${rowHoverClassName}`
    : `peer/menu-button pr-8 ${inactiveRowClassName} ${rowHoverClassName}`

  return (
    <Collapsible asChild defaultOpen={isOpen}>
      <Container>
        <div className="group/nav-row relative">
          <Button asChild className={buttonClassName} isActive={isActive}>
            {isDatabaseRouteItem && item.databaseId ? (
              <Link
                params={{ databaseId: item.databaseId } as never}
                search={
                  {
                    view:
                      item.isDatabaseView && item.databaseViewId
                        ? item.databaseViewId
                        : undefined,
                  } as never
                }
                title={displayName}
                to="/database/$databaseId"
                {...linkProps}
              >
                <LeadingItemIcon hasPages={hasPages} icon={item.emoji} />
                <span className="min-w-0 truncate">{displayName}</span>
                <TrailingIndicators
                  isDatabase={item.isDatabase}
                  isLinked={item.isLinked}
                  notelabai={item.notelabai}
                />
              </Link>
            ) : (
              <Link
                params={{ workspaceId: item.workspaceId } as never}
                title={displayName}
                to="/workspace/$workspaceId"
                {...linkProps}
              >
                <LeadingItemIcon hasPages={hasPages} icon={item.emoji} />
                <span className="min-w-0 truncate">{displayName}</span>
                <TrailingIndicators
                  isDatabase={item.isDatabase}
                  isLinked={item.isLinked}
                  notelabai={item.notelabai}
                />
              </Link>
            )}
          </Button>
          {hasPages ? (
            <CollapsibleTrigger asChild>
              <SidebarMenuAction
                className={`${disclosureActionClassName} peer-data-active/menu-button:text-sidebar-accent-foreground`}
                data-nav-menu-action="disclosure"
              >
                <ChevronRightIcon />
              </SidebarMenuAction>
            </CollapsibleTrigger>
          ) : null}
          {renderItemMenu({ item, nested })}
        </div>
        {hasPages ? (
          <CollapsibleContent>
            <SidebarMenuSub className={treeSubClassName}>
              {item.pages.map((page) => (
                <NavTreeItem
                  activeDatabaseId={activeDatabaseId}
                  activeDatabaseViewId={activeDatabaseViewId}
                  activeWorkspaceId={activeWorkspaceId}
                  defaultDatabaseViewIds={defaultDatabaseViewIds}
                  getLinkProps={getLinkProps}
                  item={page}
                  key={page.navNodeId ?? page.id}
                  renderItemMenu={renderItemMenu}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        ) : null}
      </Container>
    </Collapsible>
  )
}

function LeadingItemIcon({
  hasPages,
  icon,
}: {
  hasPages: boolean
  icon: WorkspaceNavItem["emoji"]
}) {
  return (
    <span
      className={`${leadingIconClassName} ${
        hasPages
          ? "group-hover/nav-row:opacity-0 group-has-[>[data-nav-menu-action=disclosure]:focus-visible]/nav-row:opacity-0"
          : ""
      }`}
    >
      {icon}
    </span>
  )
}

function TrailingIndicators({
  isDatabase,
  isLinked,
  notelabai,
}: {
  isDatabase?: boolean
  isLinked?: boolean
  notelabai?: NotelabAiMode | null
}) {
  const showNotelabai = notelabai && !isDatabase

  if (!showNotelabai && !isLinked) {
    return null
  }

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {showNotelabai ? (
        <span className="text-xs text-sidebar-foreground/60">{notelabai}</span>
      ) : null}
      {isLinked ? (
        <ArrowUpRightIcon
          aria-label="Linked from another parent"
          className="size-3 text-sidebar-foreground/45"
        />
      ) : null}
    </span>
  )
}

export function hasActiveDescendant(
  item: WorkspaceNavItem,
  activeDatabaseId: string | null,
  activeDatabaseViewId: string | null,
  activeWorkspaceId: string | null,
  defaultDatabaseViewIds: Map<string, string>,
): boolean {
  return item.pages.some(
    (page) =>
      getIsActiveNavItem({
        activeDatabaseId,
        activeDatabaseViewId,
        activeWorkspaceId,
        defaultDatabaseViewIds,
        item: page,
      }) ||
      hasActiveDescendant(
        page,
        activeDatabaseId,
        activeDatabaseViewId,
        activeWorkspaceId,
        defaultDatabaseViewIds,
      ),
  )
}

function getIsActiveNavItem({
  activeDatabaseId,
  activeDatabaseViewId,
  activeWorkspaceId,
  defaultDatabaseViewIds,
  item,
}: {
  activeDatabaseId: string | null
  activeDatabaseViewId: string | null
  activeWorkspaceId: string | null
  defaultDatabaseViewIds: Map<string, string>
  item: WorkspaceNavItem
}) {
  if (item.isDatabaseView) {
    return (
      activeDatabaseId === item.databaseId &&
      item.databaseViewId ===
        (activeDatabaseViewId ||
          defaultDatabaseViewIds.get(item.databaseId ?? ""))
    )
  }

  if (item.isDatabase) {
    return activeDatabaseId === item.databaseId && item.pages.length === 0
  }

  return activeWorkspaceId === item.workspaceId
}

function getDefaultDatabaseViewIds(items: WorkspaceNavItem[]) {
  const defaultViewIds = new Map<string, string>()

  for (const item of items) {
    collectDefaultDatabaseViewIds(item, defaultViewIds)
  }

  return defaultViewIds
}

function collectDefaultDatabaseViewIds(
  item: WorkspaceNavItem,
  defaultViewIds: Map<string, string>,
) {
  if (item.isDatabase && item.databaseId) {
    const defaultView = item.pages.find((page) => page.isDatabaseView)

    if (defaultView?.databaseViewId) {
      defaultViewIds.set(item.databaseId, defaultView.databaseViewId)
    }
  }

  for (const page of item.pages) {
    collectDefaultDatabaseViewIds(page, defaultViewIds)
  }
}

export function getActiveWorkspaceId(pathname: string) {
  const match = pathname.match(/^\/workspace\/([^/?#]+)/)

  if (!match) {
    return null
  }

  return decodeURIComponent(match[1])
}

export function getActiveDatabaseId(pathname: string) {
  const match = pathname.match(/^\/database\/([^/?#]+)/)

  if (!match) {
    return null
  }

  return decodeURIComponent(match[1])
}

export function getActiveDatabaseViewId(search: unknown) {
  if (
    search &&
    typeof search === "object" &&
    "view" in search &&
    typeof search.view === "string"
  ) {
    return search.view
  }

  if (typeof search === "string") {
    return new URLSearchParams(search).get("view")
  }

  return null
}
