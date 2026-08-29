"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, ChevronRightIcon, HardDriveDownloadIcon } from "@/shared/components/icons"

import { getSidebarDatabaseViewSearchId } from "@/features/sidebar/model/database-view-navigation"
import {
  readExpandedSidebarItems,
  setSidebarItemExpanded,
  writeExpandedSidebarItems,
} from "../model/sidebar-expansion-state"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import { SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar"
import {
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
  SidebarNavItemAction,
} from "@/shared/ui/sidebar-nav-item-action"
import { cn } from "@/shared/lib/utils"
import { type ZilobaseAiMode } from "@zilobase/features/pages"
import { useOfflineManifest } from "@/features/offline/index"

export type SidebarNavItem = {
  databaseId?: string | null
  databaseViewId?: string | null
  emoji: ReactNode
  id: string
  isDatabase?: boolean
  isDatabaseView?: boolean
  isFavorite?: boolean
  isLinked?: boolean
  isMeeting?: boolean
  isShared: boolean
  lastVisitedAt?: string | null
  meetingId?: string | null
  name: string
  navNodeId?: string
  pageId: string | null
  pages: SidebarNavItem[]
  teamspaceId?: string | null
  updatedAt?: string
  zilobaseai?: ZilobaseAiMode | null
}

type LinkProps = Partial<
  Omit<ComponentProps<typeof Link>, "params" | "title" | "to">
>

type SidebarNavListProps = {
  activeDatabaseId: string | null
  activeDatabaseViewId?: string | null
  activePageId: string | null
  activeMeetingId?: string | null
  depthOffset?: number
  getLinkProps?: (input: {
    displayName: string
    item: SidebarNavItem
  }) => LinkProps | undefined
  items: SidebarNavItem[]
  renderItemMenu: (input: {
    item: SidebarNavItem
    nested: boolean
  }) => ReactNode
  storageKey: string
}

const rowClassName = cn(
  "peer/menu-button pr-8",
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
)

export function SidebarNavList(props: SidebarNavListProps) {
  return <SidebarNavListContent key={props.storageKey} {...props} />
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
  const defaultViewIds = useMemo(() => getDefaultViewIds(items), [items])
  const [expandedIds, setExpandedIds] = useState(
    () => new Set(readExpandedSidebarItems(storageKey)),
  )

  useEffect(() => {
    writeExpandedSidebarItems(storageKey, expandedIds)
  }, [expandedIds, storageKey])

  const setExpanded = useCallback((id: string, expanded: boolean) => {
    setExpandedIds((current) => setSidebarItemExpanded(current, id, expanded))
  }, [])

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
  ))
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
  defaultViewIds: Map<string, string>
  depth: number
  expandedIds: ReadonlySet<string>
  item: SidebarNavItem
  setExpanded: (id: string, expanded: boolean) => void
}) {
  const id = item.navNodeId ?? item.id
  const displayName = item.name.trim() || "Untitled"
  const hasChildren = item.pages.length > 0
  const expanded = expandedIds.has(id)
  const defaultViewId = item.databaseId
    ? defaultViewIds.get(item.databaseId)
    : undefined
  const viewId = getSidebarDatabaseViewSearchId({
    databaseId: item.databaseId,
    databaseViewId: item.databaseViewId,
    defaultDatabaseViewId: defaultViewId,
    isDatabaseView: item.isDatabaseView,
  })
  const selectedViewId = item.databaseId
    ? (viewId ?? defaultViewId ?? null)
    : null
  const linkProps = getLinkProps?.({ displayName, item })
  const linkStyle = {
    ...linkProps?.style,
    paddingLeft: `${8 + depth * 16}px`,
  } as CSSProperties
  const active = isActiveItem(
    item,
    activePageId,
    activeMeetingId ?? null,
    activeDatabaseId,
    activeDatabaseViewId ?? null,
    defaultViewIds,
  )

  const content = (
    <>
      <span
        className={`flex size-4 shrink-0 items-center justify-center overflow-hidden ${
          hasChildren
            ? "group-hover/nav-row:opacity-0 group-has-[>[data-nav-menu-action=disclosure]:focus-visible]/nav-row:opacity-0"
            : ""
        }`}
      >
        {item.emoji}
      </span>
      <span className="min-w-0 truncate">{displayName}</span>
      <ItemIndicators item={item} />
    </>
  )

  return (
    <Collapsible
      asChild
      onOpenChange={(open) => setExpanded(id, open)}
      open={expanded}
    >
      <SidebarMenuItem>
        <div className="group/nav-row relative">
          <SidebarMenuButton asChild className={rowClassName} isActive={active}>
            {item.isMeeting && item.meetingId ? (
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
                <ChevronRightIcon />
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
  )
}

function ItemIndicators({ item }: { item: SidebarNavItem }) {
  const manifest = useOfflineManifest()
  const showAiMode = item.zilobaseai && !item.isDatabase
  const availableOffline = !item.isMeeting && manifest.items.some((entry) =>
    item.isDatabase
      ? entry.kind === "database" && entry.id === item.databaseId
      : entry.kind === "page" && entry.id === item.pageId,
  )

  if (!showAiMode && !item.isLinked && !availableOffline) {
    return null
  }

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 transition-opacity group-hover/nav-row:opacity-0 group-has-[>[data-nav-menu-action=menu]:focus-visible]/nav-row:opacity-0 group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:opacity-0 group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:opacity-0">
      {availableOffline ? (
        <HardDriveDownloadIcon
          aria-label="Available offline"
          className="size-3.5 text-muted-foreground"
        />
      ) : null}
      {showAiMode ? (
        <span className="text-xs text-muted-foreground">
          {item.zilobaseai}
        </span>
      ) : null}
      {item.isLinked ? (
        <ArrowUpRightIcon
          aria-label="Linked from another parent"
          className="size-3 text-muted-foreground"
        />
      ) : null}
    </span>
  )
}

function isActiveItem(
  item: SidebarNavItem,
  activePageId: string | null,
  activeMeetingId: string | null,
  activeDatabaseId: string | null,
  activeDatabaseViewId: string | null,
  defaultViewIds: Map<string, string>,
) {
  if (item.isMeeting) {
    return activeMeetingId === item.meetingId
  }

  if (item.isDatabaseView) {
    return (
      activeDatabaseId === item.databaseId &&
      item.databaseViewId ===
        (activeDatabaseViewId || defaultViewIds.get(item.databaseId ?? ""))
    )
  }

  return item.isDatabase
    ? activeDatabaseId === item.databaseId
    : activeMeetingId === null && activePageId === item.pageId
}

function getDefaultViewIds(items: SidebarNavItem[]) {
  const viewIds = new Map<string, string>()

  const visit = (item: SidebarNavItem) => {
    if (item.isDatabase && item.databaseId) {
      const defaultView = item.pages.find((child) => child.isDatabaseView)
      if (defaultView?.databaseViewId) {
        viewIds.set(item.databaseId, defaultView.databaseViewId)
      }
    }
    item.pages.forEach(visit)
  }

  items.forEach(visit)
  return viewIds
}

export function getActivePageId(pathname: string) {
  const match = pathname.match(/^\/p\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function getActiveDatabaseId(pathname: string) {
  const match = pathname.match(/^\/d\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function getActiveMeetingId(pathname: string, search?: unknown) {
  const match = pathname.match(/^\/m\/([^/?#]+)/)
  if (match) return decodeURIComponent(match[1])

  if (
    search &&
    typeof search === "object" &&
    "meeting" in search &&
    typeof search.meeting === "string"
  ) {
    return search.meeting
  }

  return typeof search === "string"
    ? new URLSearchParams(search).get("meeting")
    : null
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

  return typeof search === "string"
    ? new URLSearchParams(search).get("view")
    : null
}
