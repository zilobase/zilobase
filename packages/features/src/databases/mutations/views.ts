import type { ConfigurationChange } from "../interactions/configuration";
import { useDatabaseController } from "../interactions/react";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { pagesNavRootQueryKey } from "../../pages/queries";
import type { PageNavigationPayload } from "../../pages/contracts";
import { useDatabaseSessionId } from "../queries/session";
import type { DatabaseViewEntity } from "../core/entities";
import { findDataSourceBootstrap } from "./scope";
import { invalidateDatabaseQueries } from "./invalidate";
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
export function updateDatabaseViewInNavigation(
  navigation: PageNavigationPayload | undefined,
  input: Omit<UpdateDatabaseViewInput, "configuration"> & {
    config?: unknown;
    updatedAt?: string;
  },
) {
  if (!navigation) {
    return navigation;
  }
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  return {
    ...navigation,
    databases: navigation.databases.map((database) =>
      database.id === input.databaseId
        ? {
            ...database,
            views: database.views.map((view) =>
              view.id === input.databaseViewId
                ? {
                    ...view,
                    ...(input.config !== undefined ? { config: input.config } : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.type !== undefined ? { type: input.type } : {}),
                    updatedAt,
                  }
                : view,
            ),
          }
        : database,
    ),
  };
}
export function useUpdateDatabaseView() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
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
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseViewEntity;
    },
    onSuccess: (updatedView, variables) => {
      const bootstrap = findDataSourceBootstrap(queryClient, updatedView.dataSourceId);
      if (bootstrap) {
        queryClient.setQueriesData<PageNavigationPayload | undefined>(
          {
            queryKey: pagesNavRootQueryKey(bootstrap.database.workspaceId),
          },
          (current) =>
            updateDatabaseViewInNavigation(current, {
              config: updatedView.config,
              databaseId: variables.databaseId,
              databaseViewId: updatedView.id,
              name: updatedView.name,
              type: updatedView.type,
              updatedAt: updatedView.updatedAt,
            }),
        );
      }
    },
  });
}
export function useAddDatabaseView() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
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
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseViewEntity;
    },
  });
}
export function useDeleteDatabaseView() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  return useMutation({
    mutationFn: async ({ databaseId, databaseViewId }: DeleteDatabaseViewInput) => {
      const ack = await controller.execute({
        command: { type: "view.delete", viewId: databaseViewId },
        databaseId,
      });
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as {
        viewId: string;
      };
    },
  });
}
