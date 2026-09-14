import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  databaseRootQueryKey,
} from "./queries";
import { pagesNavRootQueryKey } from "../pages/queries";
import { type UpdateDatabaseInput } from "./database-mutations";
import { useDatabaseClient } from "./client/provider";
import {
  findDataSourceBootstrap,
  invalidateDataSourceCollections,
  resolveDataSourceCommandScope,
} from "./client/command-scope";
import type {
  DatabaseViewEntity,
  DataSourceEntity,
} from "./contracts-v2";

type LinkDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};

type CreateDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  viewName?: string;
  viewType?: string;
};

type ReplaceDatabaseViewDataSourceInput = {
  databaseId: string;
  databaseViewId: string;
  dataSourceId: string;
};

export function useUpdateDataSource() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId: dataSourceId, ...patch }: UpdateDatabaseInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        dataSourceId,
      );
      return client.execute<DataSourceEntity>({
        command: { patch, type: "dataSource.update" },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
    onSuccess: async (_result, variables) => {
      const workspaceId = findDataSourceBootstrap(
        queryClient,
        variables.databaseId,
      )?.database.workspaceId;

      await Promise.all([
        invalidateDataSourceCollections(queryClient, variables.databaseId),
        ...(workspaceId ? [
          queryClient.invalidateQueries({
            queryKey: pagesNavRootQueryKey(workspaceId),
          }),
        ] : []),
      ]);
    },
  });
}

export function useLinkDatabaseDataSource() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      config,
      databaseId,
      dataSourceId,
      name,
      type,
    }: LinkDatabaseDataSourceInput) => {
      const cachedSource = findDataSourceBootstrap(queryClient, dataSourceId)
        ?.dataSources.find(({ id }) => id === dataSourceId);
      const dataSource = cachedSource
        ? null
        : await client.execute<DataSourceEntity>({
            command: {
              afterId: null,
              beforeId: null,
              dataSourceId,
              type: "dataSource.link",
            },
            databaseId,
          }).promise;
      const view = await client.execute<DatabaseViewEntity>({
        command: {
          afterViewId: null,
          beforeViewId: null,
          config: config ?? null,
          dataSourceId,
          name: name?.trim() || dataSource?.name || cachedSource?.name || "Table",
          type: "view.create",
          viewType: type?.trim() || "table",
        },
        databaseId,
      }).promise;
      return { dataSource, view };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: databaseRootQueryKey(),
      });
    },
  });
}

export function useCreateDatabaseDataSource() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      ...input
    }: CreateDatabaseDataSourceInput) => {
      return client.execute<{
        dataSource: DataSourceEntity;
        view: DatabaseViewEntity;
      }>({
        command: {
          config: input.config ?? {},
          name: input.name?.trim() || "New data source",
          type: "dataSource.create",
          viewName: input.viewName?.trim() || "Table",
          viewType: input.viewType?.trim() || "table",
        },
        databaseId,
      }).promise;
    },
    onSettled: async (_result, _error, variables) => {
      await Promise.all([
        invalidateDataSourceCollections(queryClient, variables.databaseId),
        queryClient.invalidateQueries({ queryKey: databaseRootQueryKey() }),
      ]);
    },
  });
}

export function useReplaceDatabaseViewDataSource() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      dataSourceId,
    }: ReplaceDatabaseViewDataSourceInput) => {
      return client.execute<DatabaseViewEntity>({
        command: {
          dataSourceId,
          type: "view.setDataSource",
          viewId: databaseViewId,
        },
        databaseId,
      }).promise;
    },
    onSettled: async (_result, _error, variables) => {
      await Promise.all([
        invalidateDataSourceCollections(queryClient, variables.databaseId),
        queryClient.invalidateQueries({ queryKey: databaseRootQueryKey() }),
      ]);
    },
  });
}

export function useUnlinkDatabaseDataSource() {
  const client = useDatabaseClient();
  const { queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      dataSourceId,
    }: Pick<LinkDatabaseDataSourceInput, "databaseId" | "dataSourceId">) => {
      return client.execute<DataSourceEntity>({
        command: { dataSourceId, type: "dataSource.unlink" },
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
