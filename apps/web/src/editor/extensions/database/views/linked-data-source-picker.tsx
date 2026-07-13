import { useMemo, useState } from "react"
import { ArrowLeft, Database, Kanban, Plus, Search, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useActiveWorkspaceId } from "@notelab/features/integrations"
import { usePageNavigation } from "@notelab/features/pages"
import type { PageLayoutLinkedTab } from "@notelab/features/pages"
import { Input } from "@/components/ui/input"

export function LinkedDataSourcePicker({
  children,
  onSelect,
}: {
  children?: React.ReactNode
  onSelect: (tab: PageLayoutLinkedTab) => void
}) {
  const workspaceId = useActiveWorkspaceId()
  const { data: navigation } = usePageNavigation(workspaceId)
  const [open, setOpen] = useState(false)
  const [databaseId, setDatabaseId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
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
      <PopoverContent align="start" className="w-80 overflow-hidden p-0">
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
              const ViewIcon = option.type === "kanban" ? Kanban : Table2
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
      </PopoverContent>
    </Popover>
  )
}
