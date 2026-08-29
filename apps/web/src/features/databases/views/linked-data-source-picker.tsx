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
  Search,
  Table2,
} from "@/shared/components/icons"

import { Button } from "@/shared/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import { usePageNavigation } from "@zilobase/features/pages"
import type { PageLayoutLinkedTab } from "@zilobase/features/pages"
import { Input } from "@/shared/ui/input"

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
    const query = search.trim().toLowerCase()
    return databases.filter((item) => !query || item.name.toLowerCase().includes(query))
  }, [databases, search])
  const viewOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (selectedDatabase?.views ?? []).filter(
      (item) => !query || item.name.toLowerCase().includes(query),
    )
  }, [search, selectedDatabase?.views])

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
        align="start"
        className={showPicker ? "w-80 overflow-hidden p-0" : "w-72 p-1"}
      >
        {!showPicker ? (
          <button
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
            onClick={() => setShowPicker(true)}
            type="button"
          >
            <Table2 className="size-4 text-muted-foreground" />
            <span>Link existing data source</span>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b px-2 py-2">
          {selectedDatabase ? (
            <Button
              aria-label="Back to databases"
              onClick={() => { setDatabaseId(null); setSearch("") }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <Search className="size-4 text-muted-foreground" />
          <Input
            aria-label={selectedDatabase ? "Search database views" : "Search databases"}
            autoFocus
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={selectedDatabase ? "Search views..." : "Search databases..."}
            value={search}
          />
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
          {selectedDatabase ? (
            viewOptions.length ? viewOptions.map((option) => {
              const ViewIcon =
                option.type === "kanban"
                  ? Kanban
                  : option.type === "timeline"
                    ? CalendarRange
                    : option.type === "chart"
                      ? ChartPie
                      : option.type === "gallery"
                        ? GalleryThumbnails
                        : option.type === "list"
                          ? List
                          : Table2
              return (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                  key={option.id}
                  onClick={() => {
                    onSelect({
                      id: `linked-${selectedDatabase.id}-${option.id}`,
                      databaseId: selectedDatabase.id,
                      databaseName: selectedDatabase.name || "Untitled database",
                      viewId: option.id,
                      viewName: option.name || "Untitled view",
                      viewType: option.type,
                    })
                    close()
                  }}
                  type="button"
                >
                  <ViewIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.name || "Untitled view"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{selectedDatabase.name}</span>
                  </span>
                </button>
              )
            }) : <div className="px-3 py-8 text-center text-sm text-muted-foreground">No views available.</div>
          ) : databaseOptions.length ? databaseOptions.map((option) => (
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                key={option.id}
                onClick={() => { setDatabaseId(option.id); setSearch("") }}
                type="button"
              >
                <Database className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{option.name || "Untitled database"}</span>
                <span className="text-xs text-muted-foreground">{option.views.length} views</span>
              </button>
          )) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No databases available.
            </div>
          )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
