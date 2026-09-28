import type { ConfigurationChange } from "../interactions/configuration";
import { useDatabaseController } from "../interactions/react";
import { useMutation } from "@tanstack/react-query";
import type { NavDelta } from "../../pages/nav-delta";
import type { DatabaseHostEntity, DataSourceEntity } from "../core/entities";
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
  });
}
export function useUpdateDatabase() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      const ack = await controller.execute({
        command: { patch, type: "database.update" },
        databaseId,
      });
      return ack.result as DatabaseHostEntity;
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
  return useMutation({
    mutationFn: async (databaseId: string) =>
      (await controller.execute({ databaseId, command: { type: "database.archive" } }))
        .result as DeleteDatabaseResult,
  });
}
export function useRestoreDatabase() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async (databaseId: string) =>
      (await controller.execute({ databaseId, command: { type: "database.restore" } }))
        .result as RestoreDatabaseResult,
  });
}
export function useSetDatabaseFavorite() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, isFavorite }: SetDatabaseFavoriteInput) =>
      (
        await controller.execute({
          databaseId,
          command: { type: "database.favorite", favorite: isFavorite },
        })
      ).result as SetDatabaseFavoriteResponse,
  });
}
