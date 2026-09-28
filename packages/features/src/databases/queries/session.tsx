import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type PropsWithChildren } from "react";

import type { ApiFetcher } from "../../shared/api-fetcher";
import { guardPendingDatabaseWrites } from "../mutations/beforeunload";
import { databaseController, retainDatabaseController } from "../interactions/store";

const DatabaseSessionContext = createContext<string | null>(null);

export function useDatabaseSessionId(): string {
  return useContext(DatabaseSessionContext) ?? "public";
}

export type DbProviderProps = PropsWithChildren<{
  apiFetch: ApiFetcher;
  queryClient: QueryClient;
  sessionId: string | null;
}>;

export function DbProvider({ children, queryClient, sessionId, apiFetch }: DbProviderProps) {
  useEffect(
    () => retainDatabaseController(queryClient, sessionId ?? "public", apiFetch),
    [queryClient, sessionId, apiFetch],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    return guardPendingDatabaseWrites(
      window,
      databaseController(queryClient, sessionId ?? "public", apiFetch).commandState,
    );
  }, [apiFetch, queryClient, sessionId]);

  return (
    <DatabaseSessionContext.Provider value={sessionId ?? "public"}>
      {children}
    </DatabaseSessionContext.Provider>
  );
}
