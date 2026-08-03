import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "@tanstack/react-router"
import { DatabaseIcon, FileIcon, FileTextIcon } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { useSession } from "@zilobase/features/auth"
import { useWorkspaces } from "@zilobase/features/workspaces"
import { useAppSearchResults } from "@zilobase/features/search"
import type { AppSearchResult } from "@zilobase/features/search"
import { PageIconDisplay } from "@/lib/page-icon"
import { useAppStore } from "@/stores/app-store"
import { useAppShortcut } from "@/shortcuts"

type AppSearchContextValue = {
  openSearch: () => void
}

const AppSearchContext = createContext<AppSearchContextValue | null>(null)

export function AppSearchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 250)
  const workspaceId = useActiveWorkspaceId()
  const { data: results = [], isFetching } = useAppSearchResults(
    workspaceId,
    debouncedQuery,
    open,
  )
  const contextValue = useMemo(() => ({ openSearch: () => setOpen(true) }), [])

  useAppShortcut(
    "openSearch",
    () => {
      setOpen((current) => !current)
      return true
    },
    { allowInEditable: true }
  )

  const openResult = (result: AppSearchResult) => {
    setOpen(false)

    if (result.type === "database") {
      void navigate({
        to: "/d/$databaseId",
        params: { databaseId: result.id },
        search: { view: undefined },
      })
      return
    }

    void navigate({
      to: "/p/$pageId",
      params: { pageId: result.id },
    })
  }

  return (
    <AppSearchContext.Provider value={contextValue}>
      {children}
      <CommandDialog
        className="sm:max-w-2xl"
        description="Search pages and databases"
        onOpenChange={setOpen}
        open={open}
        title="Search"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            onValueChange={setQuery}
            placeholder="Search pages and databases..."
            value={query}
          />
          <CommandList className="max-h-[28rem]">
            {isFetching && results.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : (
              <CommandGroup heading="Results">
                {results.map((result) => (
                  <CommandItem
                    key={`${result.type}:${result.id}`}
                    onSelect={() => openResult(result)}
                    value={`${result.type}:${result.id}`}
                  >
                    <ResultIcon result={result} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{result.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {result.path}
                      </div>
                    </div>
                    <CommandShortcut className="ml-3 shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase leading-4 tracking-normal text-muted-foreground">
                      {result.type === "database" ? "Database" : "Page"}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </AppSearchContext.Provider>
  )
}

export function useAppSearch() {
  const context = useContext(AppSearchContext)

  if (!context) {
    throw new Error("useAppSearch must be used inside AppSearchProvider")
  }

  return context
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [delay, value])

  return debouncedValue
}

function useActiveWorkspaceId() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const { data: session } = useSession()
  const { data: rawWorkspaces = [] } = useWorkspaces()
  const workspaces = rawWorkspaces.filter(Boolean)
  const sessionWorkspaceId = session?.session?.activeWorkspaceId ?? null
  const storedWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    null
  const sessionWorkspace =
    workspaces.find((workspace) => workspace.id === sessionWorkspaceId) ??
    null

  return (
    storedWorkspace?.id ??
    sessionWorkspace?.id ??
    workspaces[0]?.id ??
    null
  )
}

function ResultIcon({ result }: { result: AppSearchResult }) {
  if (result.emoji) {
    return <PageIconDisplay size="sm" value={result.emoji} />
  }

  return result.type === "database" ? (
    <DatabaseIcon className="size-4 text-muted-foreground" />
  ) : result.path === result.title ? (
    <FileIcon className="size-4 text-muted-foreground" />
  ) : (
    <FileTextIcon className="size-4 text-muted-foreground" />
  )
}
