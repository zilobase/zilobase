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
import { useSession } from "@/features/auth/hooks"
import { useOrganizations } from "@/features/organizations/hooks"
import { useAppSearchResults } from "@/features/search/hooks"
import type { AppSearchResult } from "@/features/search/queries"
import { useAppStore } from "@/stores/app-store"

type AppSearchContextValue = {
  openSearch: () => void
}

const AppSearchContext = createContext<AppSearchContextValue | null>(null)

export function AppSearchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 250)
  const organizationId = useActiveOrganizationId()
  const { data: results = [], isFetching } = useAppSearchResults(
    organizationId,
    debouncedQuery,
    open,
  )
  const contextValue = useMemo(() => ({ openSearch: () => setOpen(true) }), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return
      }

      event.preventDefault()
      setOpen((current) => !current)
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const openResult = (result: AppSearchResult) => {
    setOpen(false)

    if (result.type === "database") {
      void navigate({
        to: "/database/$databaseId",
        params: { databaseId: result.id },
      })
      return
    }

    void navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: result.id },
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

function useActiveOrganizationId() {
  const activeOrganizationId = useAppStore((state) => state.activeOrganizationId)
  const { data: session } = useSession()
  const { data: organizations = [] } = useOrganizations()
  const sessionOrganizationId = session?.session?.activeOrganizationId ?? null
  const storedOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ??
    null
  const sessionOrganization =
    organizations.find((organization) => organization.id === sessionOrganizationId) ??
    null

  return (
    storedOrganization?.id ??
    sessionOrganization?.id ??
    organizations[0]?.id ??
    null
  )
}

function ResultIcon({ result }: { result: AppSearchResult }) {
  if (result.emoji) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center">
        {result.emoji}
      </span>
    )
  }

  return result.type === "database" ? (
    <DatabaseIcon className="size-4 text-muted-foreground" />
  ) : result.path === result.title ? (
    <FileIcon className="size-4 text-muted-foreground" />
  ) : (
    <FileTextIcon className="size-4 text-muted-foreground" />
  )
}
