import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
} from "../shared/item-action-cache";
import {
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
  type PageNavigationPayload,
} from "../pages/queries";
import { useDatabaseClient } from "./client/provider";
import type { DatabaseHostEntity } from "./contracts-v2";

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
    onSuccess: async (payload) => {
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
