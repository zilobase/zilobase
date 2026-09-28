import type { ConfigurationChange } from "../interactions/configuration";
import { useDatabaseController } from "../interactions/react";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { invalidateDeletedItems, invalidateRestoredItems } from "../../shared/item-action-cache";
import { applyDatabaseFavoriteToNav, type NavDelta } from "../../pages/nav-delta";
import { applyNavigationDeltaToCache } from "../../pages/navigation-realtime";
import { pagesNavRootQueryKey, pagesQueryKey } from "../../pages/queries";
import type { PageNavigationPayload } from "../../pages/contracts";
import { useDatabaseSessionId } from "../queries/session";
import type { DatabaseHostEntity, DataSourceEntity } from "../core/entities";
import { invalidateDatabaseQueries } from "./invalidate";
type CreateDatabaseInput = {
  name?: string;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
};
type CreateDatabaseResponse = {
  activeDataSource: DataSourceEntity | null;
  database: DatabaseHostEntity;
  navDelta: NavDelta;
};
export type UpdateDatabaseInput = {
  databaseId: string;
  name?: string;
  configuration?: ConfigurationChange[];
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
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (input: CreateDatabaseInput) => {
      const ack = await controller.execute({
        databaseId: input.workspaceId,
        command: {
          ...input,
          type: "database.create",
          name: input.name ?? "New database",
          standalone: input.standalone ?? false,
        },
      });
      return ack.result as CreateDatabaseResponse;
    },
    onSuccess: async (payload) => {
      if (!payload.database.pageId) {
        await queryClient.invalidateQueries({
          queryKey: pagesNavRootQueryKey(payload.database.workspaceId),
        });
        return;
      }
      // Creation confirms its navigation delta in the same receipt.
      applyNavigationDeltaToCache(queryClient, payload.database.workspaceId, payload.navDelta);
    },
  });
}
export function useUpdateDatabase() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      const ack = await controller.execute({
        command: { patch, type: "database.update" },
        databaseId,
      });
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseHostEntity;
    },
    onSuccess: async (database) => {
      await queryClient.invalidateQueries({
        queryKey: pagesQueryKey(database.workspaceId),
      });
    },
  });
}
type DeleteDatabaseResult = {
  database: DatabaseHostEntity | null;
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};
type RestoreDatabaseResult = {
  database: DatabaseHostEntity;
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};
export function useDeleteDatabase() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (databaseId: string) =>
      (await controller.execute({ databaseId, command: { type: "database.archive" } }))
        .result as DeleteDatabaseResult,
    onSuccess: async (result) =>
      invalidateDeletedItems({
        workspaceId: result.database?.workspaceId,
        queryClient,
        result,
      }),
  });
}
export function useRestoreDatabase() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (databaseId: string) =>
      (await controller.execute({ databaseId, command: { type: "database.restore" } }))
        .result as RestoreDatabaseResult,
    onSuccess: async (result) =>
      invalidateRestoredItems({
        workspaceId: result.database.workspaceId,
        queryClient,
        result,
      }),
  });
}
export function useSetDatabaseFavorite() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ databaseId, isFavorite }: SetDatabaseFavoriteInput) =>
      (
        await controller.execute({
          databaseId,
          command: { type: "database.favorite", favorite: isFavorite },
        })
      ).result as SetDatabaseFavoriteResponse,
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
