import { getSearchResultDestination } from "@/app/routing/search-result-destination";
import type { AppSearchResult as SearchResult } from "@zilobase/features/search";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DatabaseIcon } from "@/components/icons";
import { useZilobaseFeatures } from "@zilobase/features";
import { useSharedDataRevision } from "@zilobase/features/data/react";
import { readCachedPage } from "@zilobase/features/pages";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useAppSearchResults } from "@zilobase/features/search/react";
import { DefaultPageIcon, PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import { useAppShortcut } from "@/app/shortcuts/shortcut-provider";

type AppSearchContextValue = {
  openSearch: () => void;
};

const AppSearchContext = createContext<AppSearchContextValue | null>(null);

export function AppSearchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const workspaceId = useActiveWorkspaceId();
  const { data: results = [], isFetching } = useAppSearchResults(
    workspaceId,
    debouncedQuery,
    open,
    undefined,
    "keyword",
  );
  const contextValue = useMemo(() => ({ openSearch: () => setOpen(true) }), []);

  useAppShortcut(
    "openSearch",
    () => {
      setOpen((current) => !current);
      return true;
    },
    { allowInEditable: true },
  );

  const openResult = (result: SearchResult) => {
    setOpen(false);

    void navigate(getSearchResultDestination(result));
  };

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
              <div className="py-6 text-center text-sm text-content-secondary">Searching...</div>
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
                      <div className="truncate text-xs text-content-secondary">
                        {result.match?.headingPath.join(" / ") || result.path}
                      </div>
                      {result.excerpt ? (
                        <p className="line-clamp-2 text-xs text-content-secondary">
                          {result.excerpt}
                        </p>
                      ) : null}
                    </div>
                    <CommandShortcut className="ml-3 shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium uppercase leading-4 tracking-normal text-content-secondary">
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
  );
}

export function useAppSearch() {
  const context = useContext(AppSearchContext);

  if (!context) {
    throw new Error("useAppSearch must be used inside AppSearchProvider");
  }

  return context;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
}

function ResultIcon({ result }: { result: SearchResult }) {
  const { queryClient } = useZilobaseFeatures();
  useSharedDataRevision(queryClient);
  const page = result.type === "page" ? readCachedPage(queryClient, result.id) : null;
  if (result.emoji) {
    return <PageIconDisplay size="sm" value={result.emoji} />;
  }

  return result.type === "database" ? (
    <DatabaseIcon className="size-4 text-content-secondary" />
  ) : (
    <DefaultPageIcon className="text-content-secondary" page={page} />
  );
}
