import { useQueries } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, ListChecksIcon } from "@/shared/components/icons"
import * as React from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"
import {
  buildTaskRows,
  filterMyTaskRows,
  getTaskDatabaseSchema,
} from "@/features/tasks/index"
import { useZilobaseFeatures } from "@zilobase/features"
import { useSession } from "@zilobase/features/auth"
import {
  databaseQueryOptions,
  type DatabasePayload,
} from "@zilobase/features/databases"
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state"

export function SidebarTasksSection({
  databaseIds,
  limit,
  storageKey,
}: {
  databaseIds: string[]
  limit: number
  storageKey: string
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey)
  const { apiFetch } = useZilobaseFeatures()
  const { data: session } = useSession()
  const queries = useQueries({
    queries: open
      ? databaseIds.map((databaseId) => databaseQueryOptions(apiFetch, databaseId))
      : [],
  })
  const rows = React.useMemo(() => {
    const payloads = queries
      .map((query) => query.data)
      .filter((payload): payload is DatabasePayload => Boolean(payload))
      .filter((payload) => getTaskDatabaseSchema(payload).missing.length === 0)
    return filterMyTaskRows(buildTaskRows(payloads), session?.user?.id ?? null).slice(0, limit)
  }, [limit, queries, session?.user?.id])

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel asChild className="hover:bg-accent hover:text-accent-foreground">
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>Tasks</span>
              <ChevronRightIcon className="ml-1 size-3 text-muted-foreground transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <SidebarMenu aria-label="My tasks">
              {databaseIds.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/tasks"><ListChecksIcon /><span>Configure My Tasks</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : rows.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {queries.some((query) => query.isLoading) ? "Loading tasks…" : "No tasks assigned to you"}
                </p>
              ) : rows.map((row) => (
                <SidebarMenuItem key={`${row.databaseId}:${row.rowId}`}>
                  <SidebarMenuButton asChild>
                    <Link params={{ pageId: row.pageId }} to="/p/$pageId">
                      <ListChecksIcon />
                      <span>{row.title.trim() || "Untitled"}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {rows.length === limit ? (
                <SidebarMenuItem><SidebarMenuButton asChild><Link to="/tasks">View all</Link></SidebarMenuButton></SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
