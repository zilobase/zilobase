import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from  "../../shared/context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
} from  "../../shared/item-action-cache";
import {
  type DatabasePayload,
} from  "../queries/queries";
import { applyCreatedDatabaseToPageNav } from  "./cache";
import {
  applyDatabaseFavoriteToNav,
  type NavDelta,
} from  "../../pages/nav-delta";
import { applyNavigationDeltaToCache } from  "../../pages/navigation-realtime";
import {
  pagesNavRootQueryKey,
  pagesQueryKey,
  type PageNavigationPayload,
} from  "../../pages/queries";
import { useDatabaseSessionId } from "../queries/session";
import type { DatabaseHostEntity } from "../core/entities";
import { executeDatabaseCommand } from "./execute";
import { invalidateDatabaseQueries } from "./invalidate";
import {
  cancelHostQueries,
  patchCachedDatabase,
} from "./optimistic";
import { runSerialized, viewSerializationKey } from "./serialize";

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

type SetDatabaseFavoriteResponse = {
  databaseId: string;
  isFavorite: boolean;
  workspaceId: string;
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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: { patch, type: "database.update" },
            databaseId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseHostEntity;
    },
    onMutate: async ({ databaseId, ...patch }) => {
      await cancelHostQueries(queryClient, sessionId, databaseId);
      return patchCachedDatabase(queryClient, sessionId, databaseId, patch);
    },
    onError: (_error, _input, rollback) => {
      rollback?.();
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
      apiFetch<SetDatabaseFavoriteResponse>(`/databases/${databaseId}/favorite`, {
        method: isFavorite ? "PUT" : "DELETE",
      }),
    onSuccess: async (result) => {
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(result.workspaceId) },
        (current) =>
          applyDatabaseFavoriteToNav(current, {
            id: result.databaseId,
            isFavorite: result.isFavorite,
          }),
      );
    },
  });
}
