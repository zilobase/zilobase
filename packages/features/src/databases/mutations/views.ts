import type { ConfigurationChange } from "../interactions/configuration";
import { useDatabaseController } from "../interactions/react";
import { useMutation } from "@tanstack/react-query";
import type { DatabaseViewEntity } from "../core/entities";
type UpdateDatabaseViewInput = {
  configuration?: ConfigurationChange[];
  databaseId: string;
  databaseViewId: string;
  name?: string;
  type?: string;
};
type AddDatabaseViewInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};
type DeleteDatabaseViewInput = {
  databaseId: string;
  databaseViewId: string;
};
export function useUpdateDatabaseView() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, databaseViewId, ...patch }: UpdateDatabaseViewInput) => {
      const ack = await controller.execute({
        command: {
          patch,
          type: "view.update",
          viewId: databaseViewId,
        },
        databaseId,
      });
      return ack.result as DatabaseViewEntity;
    },
  });
}
export function useAddDatabaseView() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ config, databaseId, dataSourceId, name, type }: AddDatabaseViewInput) => {
      const ack = await controller.execute({
        command: {
          afterViewId: null,
          beforeViewId: null,
          config: config ?? null,
          dataSourceId,
          name: name?.trim() || "Table",
          type: "view.create",
          viewType: type?.trim() || "table",
        },
        databaseId,
      });
      return ack.result as DatabaseViewEntity;
    },
  });
}
export function useDeleteDatabaseView() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, databaseViewId }: DeleteDatabaseViewInput) => {
      const ack = await controller.execute({
        command: { type: "view.delete", viewId: databaseViewId },
        databaseId,
      });
      return ack.result as {
        viewId: string;
      };
    },
  });
}
