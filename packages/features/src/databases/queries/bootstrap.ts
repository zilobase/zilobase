import { useQuery, type QueryClient } from "@tanstack/react-query";

import { useZilobaseFeatures, type ApiFetcher } from "../../shared/context";
import { useDatabaseSessionId } from "../client/provider";
import {
  databaseBootstrapResponseSchema,
  type DatabaseBootstrapResponse,
} from "../core/entities";
import {
  databaseBootstrapQueryKey,
  type DatabaseBootstrapScope,
} from "./keys";

export type DatabaseScope = DatabaseBootstrapScope;

export type DatabaseBootstrapHookState = {
  data?: DatabaseBootstrapResponse;
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
  return {
    queryKey,
    staleTime: 30_000,
    queryFn: async (): Promise<DatabaseBootstrapResponse> => {
      const incoming = databaseBootstrapResponseSchema.parse(
        await apiFetch<DatabaseBootstrapResponse>(
          databaseBootstrapPath(scope),
        ),
      );
      // Prefer-newest guard: out-of-order GETs must not regress cache.
      if (queryClient) {
        const cached = queryClient.getQueryData<DatabaseBootstrapResponse>(
          queryKey,
        );
        const cachedVersion = cached ? cached.database.version : -1;
        if (incoming.database.version < cachedVersion) return cached;
      }
      return incoming;
    },
  };
}

export function useDatabaseBootstrap(
  scope: DatabaseScope | null,
): DatabaseBootstrapHookState {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  const queryKey = scope
    ? databaseBootstrapQueryKey(sessionId, scope)
    : null;

  const query = useQuery({
    ...databaseBootstrapQueryOptions(
      apiFetch,
      sessionId,
      scope ?? { databaseId: "disabled" },
      queryClient,
    ),
    enabled: Boolean(scope),
  });

  if (!scope || !queryKey) {
    return {
      data: undefined,
      error: null,
      refetch: async () => undefined,
      scope: null,
      status: "idle",
    };
  }

  const error = query.error instanceof Error
    ? query.error
    : query.error
      ? new Error(String(query.error))
      : null;

  return {
    data: query.data,
    error,
    refetch: () => queryClient.refetchQueries({ exact: true, queryKey }),
    scope,
    status: query.isError
      ? "error"
      : query.isLoading
        ? "loading"
        : query.data
          ? "success"
          : "idle",
  };
}
