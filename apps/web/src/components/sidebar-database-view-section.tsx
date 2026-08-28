import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, DatabaseIcon, FileIcon, PlusIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getDatabaseViewModel } from "@/editor/extensions/database/views/database-view-model"
import { useSidebarSectionOpen } from "@/components/sidebar-section-open-state"
import type { SidebarSection } from "@zilobase/features/user-settings"
import { isDatabaseLocked, useAddDatabaseRow, useDatabase } from "@zilobase/features/databases"

export function SidebarDatabaseViewSection({
  currentUserId,
  section,
  storageKey,
}: {
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
              className="pr-16 group-hover/section-header:bg-accent group-hover/section-header:text-accent-foreground group-data-[state=open]/collapsible:bg-accent group-data-[state=open]/collapsible:text-accent-foreground"
            >
              <button className="group/section-label w-full cursor-pointer" type="button">
                <span className="truncate">{title}</span>
                <ChevronRightIcon className="ml-1 size-3 text-muted-foreground transition-transform group-data-[state=open]/section-label:rotate-90" />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          {database.data && database.data.database.accessLevel !== "view" && !isDatabaseLocked(database.data.database) ? (
            <SidebarGroupAction
              aria-label={`Add row to ${title}`}
              className="right-9 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              disabled={addRow.isPending}
              onClick={() => {
                addRow.mutate(
                  { databaseId: section.databaseId, title: "Untitled" },
                  { onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add row.") },
                )
              }}
              title="Add row"
            >
              <PlusIcon />
            </SidebarGroupAction>
          ) : null}
          <SidebarGroupAction asChild className="right-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground" title="View all">
            <Link params={{ databaseId: section.databaseId }} search={{ view: section.viewId }} to="/d/$databaseId">
              <DatabaseIcon />
              <span className="sr-only">View all</span>
            </Link>
          </SidebarGroupAction>
        </div>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            {database.isLoading ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
            ) : database.isError || !database.data ? (
              <p className="rounded-md bg-muted px-2 py-2 text-xs text-muted-foreground">Source unavailable</p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No matching rows</p>
            ) : (
              <SidebarMenu aria-label={`${title} rows`}>
                {rows.map((row) => (
                  <SidebarMenuItem key={row.id}>
                    <SidebarMenuButton asChild>
                      <Link params={{ pageId: row.pageId }} to="/p/$pageId">
                        {section.showPageIcon ? <FileIcon /> : null}
                        <span>{row.page.name.trim() || "Untitled"}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {model.sortedItems.length > rows.length ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="text-muted-foreground">
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
