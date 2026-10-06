import { useMemo } from "react";
import { useSharedDataRevision } from "../../data/react";
import {
  normalizeDatabaseBootstrap,
  resolveDatabaseBootstrap,
  type DatabaseBootstrapReference,
} from "../cache-references";
import { sharedClient } from "../../data/client";
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
    queryFn: async ({ client, signal }): Promise<DatabaseBootstrapReference> => {
      const owner = sharedClient(client);
      const read = await owner.captureRead();
      const incoming = databaseBootstrapResponseSchema.parse(
        await apiFetch<DatabaseBootstrapResponse>(databaseBootstrapPath(scope), { signal }),
      );
      const previous = client.getQueryData<DatabaseBootstrapReference>(queryKey);
      owner.revalidateScope(
        read,
        previous,
        incoming.viewerType === "guest" || incoming.viewerType === "public"
          ? incoming.viewerType
          : "account",
        Boolean(previous?.accessLevel && previous.accessLevel !== incoming.database.accessLevel),
      );
      const reference = normalizeDatabaseBootstrap(
        client,
        read,
        scope.databaseId,
        incoming,
        scope.includeDeleted,
      );
      // Prefer-newest guard: out-of-order GETs must not regress cache.
      if (queryClient) {
        const cached = queryClient.getQueryData<DatabaseBootstrapReference>(queryKey);
        if (cached && incoming.database.version < cached.databaseVersion) {
          return cached;
        }
      }
      return reference;
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
  const revision = useSharedDataRevision(queryClient);
  const resolved = useMemo(
    () => resolveDatabaseBootstrap(queryClient, query.data),
    [queryClient, query.data, revision],
  );
  const confirmed = useMemo(
    () => resolveDatabaseBootstrap(queryClient, query.data, true),
    [queryClient, query.data, revision],
  );
  const projected = useProjectedDatabaseBootstrap(resolved);

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
    serverData: confirmed,
    error,
    refetch: () => queryClient.refetchQueries({ exact: true, queryKey }),
    scope,
    status: query.isError ? "error" : query.isLoading ? "loading" : query.data ? "success" : "idle",
  };
}
