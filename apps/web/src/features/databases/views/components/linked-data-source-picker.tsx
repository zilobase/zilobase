import { cn } from "@/shared/lib/utils"
import { menuItemClassName } from "@/shared/ui/menu-styles"
import { useMemo, useState } from "react"
import {
  ArrowLeft,
  CalendarRange,
  ChartPie,
  Database,
  GalleryThumbnails,
  Kanban,
  List,
  Plus,
  Table2,
} from "@/shared/components/icons"

import { Button } from "@/shared/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { usePageNavigation } from "@zilobase/features/pages/react";
import type { PageLayoutLinkedTab } from "@zilobase/features/pages"
import { PageDatabasePicker } from "../../components/page-database-picker"

function getLinkedViewIcon(type: string) {
  const ViewIcon =
    type === "kanban"
      ? Kanban
      : type === "timeline"
        ? CalendarRange
        : type === "chart"
          ? ChartPie
          : type === "gallery"
            ? GalleryThumbnails
            : type === "list"
              ? List
              : Table2

  return <ViewIcon className="size-4 text-content-secondary" />
}

export function LinkedDataSourcePicker({
  children,
  menuFirst = false,
  onSelect,
}: {
  children?: React.ReactNode
  menuFirst?: boolean
  onSelect: (tab: PageLayoutLinkedTab) => void
}) {
  const workspaceId = useActiveWorkspaceId()
  const { data: navigation } = usePageNavigation(workspaceId)
  const [open, setOpen] = useState(false)
  const [databaseId, setDatabaseId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showPicker, setShowPicker] = useState(!menuFirst)
  const databases = navigation?.databases ?? []
  const selectedDatabase = databases.find((database) => database.id === databaseId)
  const databaseOptions = useMemo(() => {
    return databases.map((database) => ({
      description: `${database.views.length} ${database.views.length === 1 ? "view" : "views"}`,
      icon: <Database />,
      label: database.name || "Untitled database",
      searchText: database.name || "Untitled database",
      value: database.id,
    }))
  }, [databases])
  const viewOptions = useMemo(() => {
    return (selectedDatabase?.views ?? []).map((view) => ({
      description: selectedDatabase?.name || "Untitled database",
      icon: getLinkedViewIcon(view.type),
      label: view.name || "Untitled view",
      searchText: `${view.name} ${selectedDatabase?.name ?? ""}`.trim(),
      value: view.id,
      view,
    }))
  }, [selectedDatabase])

  const close = () => {
    setOpen(false)
    setDatabaseId(null)
    setSearch("")
    setShowPicker(!menuFirst)
  }

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next)
      if (!next) close()
    }}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button aria-label="Link existing data source" size="icon-sm" type="button" variant="ghost">
            <Plus />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        variant="menu"
        align="start"
        className={showPicker ? "w-80 overflow-hidden p-0" : "w-72 p-1"}
      >
        {!showPicker ? (
          <button
            className={cn(menuItemClassName, "w-full text-left hover:bg-action-neutral-hover")}
            onClick={() => setShowPicker(true)}
            type="button"
          >
            <Table2 className="size-4 text-content-secondary" />
            <span>Link existing data source</span>
          </button>
        ) : (
          <>
            {selectedDatabase ? (
              <div className="border-b p-1">
                <button
                  className={cn(menuItemClassName, "w-full text-left hover:bg-action-neutral-hover")}
                  onClick={() => { setDatabaseId(null); setSearch("") }}
                  type="button"
                >
                  <ArrowLeft />
                  <span>Back to databases</span>
                </button>
              </div>
            ) : null}
            {selectedDatabase ? (
              <PageDatabasePicker
                ariaLabel="Search database views"
                emptyMessage="No views available."
                heading="Views"
                loadingMessage="Loading views..."
                onQueryChange={setSearch}
                onSelect={({ view }) => {
                  onSelect({
                    id: `linked-${selectedDatabase.id}-${view.id}`,
                    databaseId: selectedDatabase.id,
                    databaseName: selectedDatabase.name || "Untitled database",
                    viewId: view.id,
                    viewName: view.name || "Untitled view",
                    viewType: view.type,
                  })
                  close()
                }}
                options={viewOptions}
                placeholder="Search views..."
                query={search}
              />
            ) : (
              <PageDatabasePicker
                ariaLabel="Search databases"
                emptyMessage="No databases available."
                heading="Databases"
                loadingMessage="Loading databases..."
                onQueryChange={setSearch}
                onSelect={(option) => {
                  setDatabaseId(option.value)
                  setSearch("")
                }}
                options={databaseOptions}
                placeholder="Search databases..."
                query={search}
              />
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
