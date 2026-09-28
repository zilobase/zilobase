import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";

import { useZilobaseFeatures, type ApiFetcher } from "../../shared/context";
import { useDatabaseSessionId } from "./session";
import { useProjectedDatabaseBootstrap } from "../interactions/react";
import { databaseBootstrapResponseSchema, type DatabaseBootstrapResponse } from "../core/entities";
import { databaseBootstrapQueryKey, type DatabaseBootstrapScope } from "./keys";

export type DatabaseScope = DatabaseBootstrapScope;

export type DatabaseBootstrapHookState = {
  data?: DatabaseBootstrapResponse;
  serverData?: DatabaseBootstrapResponse;
  error: Error | null;
  refetch: () => Promise<unknown>;
  scope: DatabaseScope | null;
  status: "idle" | "loading" | "success" | "error";
};

export function databaseBootstrapPath(scope: DatabaseBootstrapScope): string {
  const query = new URLSearchParams();
  if (scope.viewId) query.set("viewId", scope.viewId);
  if (scope.includeDeleted) query.set("includeDeleted", "1");
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/databases/${encodeURIComponent(scope.databaseId)}/bootstrap${suffix}`;
}

export function databaseBootstrapQueryOptions(
  apiFetch: ApiFetcher,
  sessionId: string,
  scope: DatabaseBootstrapScope,
  queryClient?: QueryClient,
) {
  const queryKey = databaseBootstrapQueryKey(sessionId, scope);
  return queryOptions({
    queryKey,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<DatabaseBootstrapResponse> => {
      const incoming = databaseBootstrapResponseSchema.parse(
        await apiFetch<DatabaseBootstrapResponse>(databaseBootstrapPath(scope), { signal }),
      );
      // Prefer-newest guard: out-of-order GETs must not regress cache.
      if (queryClient) {
        const cached = queryClient.getQueryData<DatabaseBootstrapResponse>(queryKey);
        if (cached && incoming.database.version < cached.database.version) {
          return cached;
        }
      }
      return incoming;
    },
  });
}

export function useDatabaseBootstrap(scope: DatabaseScope | null): DatabaseBootstrapHookState {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  const queryKey = scope ? databaseBootstrapQueryKey(sessionId, scope) : null;

  const query = useQuery({
    ...databaseBootstrapQueryOptions(
      apiFetch,
      sessionId,
      scope ?? { databaseId: "disabled" },
      queryClient,
    ),
    enabled: Boolean(scope),
  });
  const projected = useProjectedDatabaseBootstrap(query.data);

  if (!scope || !queryKey) {
    return {
      data: undefined,
      error: null,
      refetch: async () => undefined,
      scope: null,
      status: "idle",
    };
  }

  const error =
    query.error instanceof Error
      ? query.error
      : query.error
        ? new Error(String(query.error))
        : null;

  return {
    data: projected,
    serverData: query.data,
    error,
    refetch: () => queryClient.refetchQueries({ exact: true, queryKey }),
    scope,
    status: query.isError ? "error" : query.isLoading ? "loading" : query.data ? "success" : "idle",
  };
}
