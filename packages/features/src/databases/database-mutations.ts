import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
} from "../shared/item-action-cache";
import { setDatabasePayloadQueryData } from "./query-cache";
import {
  databasePayloadRootQueryKey,
  databaseQueryKey,
  type DatabasePayload,
} from "./queries";
import { applyCreatedDatabaseToPageNav } from "./create-database-cache";
import {
  applyDatabaseFavoriteToNav,
  type NavDelta,
} from "../pages/nav-delta";
import { applyNavigationDeltaToCache } from "../pages/navigation-realtime";
import {
  pagesNavRootQueryKey,
  pagesQueryKey,
  pagesRootQueryKey,
  type PageNavigationPayload,
} from "../pages/queries";
import { useDatabaseClient } from "./client/provider";
import type { DatabaseHostEntity } from "./contracts-v2";
import { restoreDatabasePayloadAfterFailedMutation } from "./mutation-cache-policy";

type CreateDatabaseInput = {
  name?: string;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
};

type CreateDatabaseResponse = DatabasePayload & {
  navDelta?: NavDelta;
};

export type UpdateDatabaseInput = {
  databaseId: string;
  name?: string;
  config?: unknown;
};

type SetDatabaseFavoriteInput = {
  databaseId: string;
  isFavorite: boolean;
};

export function useCreateDatabase() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (input: CreateDatabaseInput) => {
      return apiFetch<CreateDatabaseResponse>("/databases", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: async (payload) => {
      setDatabasePayloadQueryData(queryClient, payload.database.id, payload);

      if (!payload.database.pageId) {
        await queryClient.invalidateQueries({
          queryKey: pagesNavRootQueryKey(payload.database.workspaceId),
        });
        return;
      }

      if (payload.navDelta) {
        applyNavigationDeltaToCache(
          queryClient,
          payload.database.workspaceId,
          payload.navDelta,
        );
      } else {
        queryClient.setQueriesData<PageNavigationPayload | undefined>(
          { queryKey: pagesNavRootQueryKey(payload.database.workspaceId) },
          (current) => applyCreatedDatabaseToPageNav(current, payload),
        );
      }
    },
  });
}

export function useUpdateDatabase() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      return client.execute<DatabaseHostEntity>({
        command: { patch, type: "database.update" },
        databaseId,
      }).promise;
    },
    onSuccess: async (database) => {
      await queryClient.invalidateQueries({
        queryKey: pagesQueryKey(database.workspaceId),
      });
    },
  });
}

type DeleteDatabaseResult = {
  database: DatabasePayload["database"] | null;
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};

type RestoreDatabaseResult = {
  database: DatabasePayload["database"];
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

export function useDeleteDatabase() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (databaseId: string) =>
      apiFetch<DeleteDatabaseResult>(`/databases/${databaseId}`, {
        method: "DELETE",
      }),
    onSuccess: async (result) =>
      invalidateDeletedItems({
        workspaceId: result.database?.workspaceId,
        queryClient,
        result,
      }),
  });
}

export function useRestoreDatabase() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (databaseId: string) =>
      apiFetch<RestoreDatabaseResult>(`/databases/${databaseId}/restore`, {
        method: "POST",
      }),
    onSuccess: async (result) =>
      invalidateRestoredItems({
        workspaceId: result.database.workspaceId,
        queryClient,
        result,
      }),
  });
}

export function useSetDatabaseFavorite() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, isFavorite }: SetDatabaseFavoriteInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/favorite`, {
        method: isFavorite ? "PUT" : "DELETE",
      }),
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: databasePayloadRootQueryKey(variables.databaseId),
        }),
        queryClient.cancelQueries({ queryKey: pagesRootQueryKey() }),
      ]);
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );
      const previousNavQueries =
        queryClient.getQueriesData<PageNavigationPayload>({
          queryKey: previous
            ? pagesNavRootQueryKey(previous.database.workspaceId)
            : pagesRootQueryKey(),
        });

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) =>
          current
            ? {
                ...current,
                database: {
                  ...current.database,
                  isFavorite: variables.isFavorite,
                },
              }
            : current,
      );

      if (previous) {
        queryClient.setQueriesData<PageNavigationPayload | undefined>(
          { queryKey: pagesNavRootQueryKey(previous.database.workspaceId) },
          (current) =>
            applyDatabaseFavoriteToNav(current, {
              ...previous.database,
              isFavorite: variables.isFavorite,
              views: previous.views,
            }),
        );
      }

      return { previous, previousNavQueries };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        restoreDatabasePayloadAfterFailedMutation(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }

      for (const [queryKey, data] of context?.previousNavQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (payload) => {
      setDatabasePayloadQueryData(queryClient, payload.database.id, payload);
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(payload.database.workspaceId) },
        (current) =>
          applyDatabaseFavoriteToNav(current, {
            ...payload.database,
            views: payload.views,
          }),
      );
    },
  });
}
