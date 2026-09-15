import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  databaseRootQueryKey,
} from "./queries";
import {
  pagesNavRootQueryKey,
  type PageNavigationPayload,
} from "../pages/queries";
import { useDatabaseClient } from "./client/provider";
import type { DatabaseViewEntity } from "./contracts-v2";
import { findDataSourceBootstrap } from "./client/command-scope";

type UpdateDatabaseViewInput = {
  config?: unknown;
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
  input: UpdateDatabaseViewInput & { updatedAt?: string },
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
                    ...(input.config !== undefined
                      ? { config: input.config }
                      : {}),
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
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      ...patch
    }: UpdateDatabaseViewInput) => {
      return client.execute<DatabaseViewEntity>({
        command: {
          patch,
          type: "view.update",
          viewId: databaseViewId,
        },
        databaseId,
      }).promise;
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
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: databaseRootQueryKey(),
      });
    },
  });
}

export function useAddDatabaseView() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      config,
      databaseId,
      dataSourceId,
      name,
      type,
    }: AddDatabaseViewInput) => {
      return client.execute<DatabaseViewEntity>({
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
      }).promise;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: databaseRootQueryKey(),
      });
    },
  });
}

export function useDeleteDatabaseView() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
    }: DeleteDatabaseViewInput) => {
      return client.execute<{ viewId: string }>({
        command: { type: "view.delete", viewId: databaseViewId },
        databaseId,
      }).promise;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: databaseRootQueryKey(),
      });
    },
  });
}
