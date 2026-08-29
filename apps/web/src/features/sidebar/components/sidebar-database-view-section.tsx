import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, DatabaseIcon, FileIcon, PlusIcon } from "@/shared/components/icons"
import * as React from "react"
import { toast } from "sonner"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"
import { getDatabaseViewModel } from "@/features/databases"
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state"
import type { SidebarSection } from "@zilobase/features/user-settings"
import { isDatabaseLocked, useAddDatabaseRow, useDatabase } from "@zilobase/features/databases"

export function SidebarDatabaseViewSection({
  activePageId,
  currentUserId,
  section,
  storageKey,
}: {
  activePageId: string | null
  currentUserId?: string
  section: Extract<SidebarSection, { kind: "databaseView" }>
  storageKey: string
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey)
  const database = useDatabase(open ? section.databaseId : null, {
    viewId: section.viewId,
  })
  const addRow = useAddDatabaseRow()
  const model = React.useMemo(
    () => getDatabaseViewModel({
      activeViewId: section.viewId ?? null,
      currentUserId,
      payload: database.data,
    }),
    [currentUserId, database.data, section.viewId],
  )
  const rows = model.sortedItems.slice(0, section.limit)
  const title = section.label || database.data?.database.name || "Database view"
  const activeDataSourceId = database.data?.activeDataSource?.id ?? null

  return (
    <Collapsible
      asChild
      onOpenChange={setOpen}
      open={open}
    >
      <SidebarGroup className="group/collapsible">
        <div className="group/section-header relative">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              asChild
              className="pr-16 group-hover/section-header:bg-action-neutral-hover group-hover/section-header:text-action-on-neutral"
            >
              <button className="group/section-label w-full cursor-pointer" type="button">
                <span className="truncate">{title}</span>
                <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          {database.data && activeDataSourceId && database.data.database.accessLevel !== "view" && !isDatabaseLocked(database.data.database) ? (
            <SidebarGroupAction
              aria-label={`Add row to ${title}`}
              className="right-9 text-content-secondary hover:bg-action-neutral-hover hover:text-action-on-neutral"
              disabled={addRow.isPending}
              onClick={() => {
                addRow.mutate(
                  { databaseId: activeDataSourceId, title: "Untitled" },
                  { onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add row.") },
                )
              }}
              title="Add row"
            >
              <PlusIcon />
            </SidebarGroupAction>
          ) : null}
          <SidebarGroupAction asChild className="right-2 text-content-secondary hover:bg-action-neutral-hover hover:text-action-on-neutral" title="View all">
            <Link params={{ databaseId: section.databaseId }} search={{ view: section.viewId }} to="/d/$databaseId">
              <DatabaseIcon />
              <span className="sr-only">View all</span>
            </Link>
          </SidebarGroupAction>
        </div>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            {database.isLoading ? (
              <p className="px-2 py-1.5 text-xs text-content-secondary">Loading…</p>
            ) : database.isError || !database.data ? (
              <p className="rounded-md bg-surface-muted px-2 py-2 text-xs text-content-secondary">Source unavailable</p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-content-secondary">No matching rows</p>
            ) : (
              <SidebarMenu aria-label={`${title} rows`}>
                {rows.map((row) => (
                  <SidebarMenuItem key={row.id}>
                    <SidebarMenuButton asChild isActive={row.pageId === activePageId}>
                      <Link params={{ pageId: row.pageId }} to="/p/$pageId">
                        {section.showPageIcon ? <FileIcon /> : null}
                        <span>{row.page.name.trim() || "Untitled"}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {model.sortedItems.length > rows.length ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link params={{ databaseId: section.databaseId }} search={{ view: section.viewId }} to="/d/$databaseId">View all</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
