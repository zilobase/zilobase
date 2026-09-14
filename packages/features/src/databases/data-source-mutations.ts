import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  databasePayloadRootQueryKey,
  type DatabasePayload,
} from "./queries";
import { type DatabaseMutationResponse } from "./mutation-types";
import { pagesNavRootQueryKey } from "../pages/queries";
import { type UpdateDatabaseInput } from "./database-mutations";
import { commitDatabaseMutation } from "./mutation-cache-policy";
import { useDatabaseClient } from "./client/provider";
import {
  invalidateLegacyDataSourcePayloads,
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
      const workspaceIds = new Set<string>();
      const entries = queryClient.getQueriesData<DatabasePayload | null>({
        queryKey: ["database"],
      });

      for (const [, current] of entries) {
        if (
          current?.dataSources.some(
            (source) => source.id === variables.databaseId,
          )
        ) {
          workspaceIds.add(current.database.workspaceId);
        }
      }

      await Promise.all([
        invalidateLegacyDataSourcePayloads(queryClient, variables.databaseId),
        ...[...workspaceIds].map((workspaceId) =>
          queryClient.invalidateQueries({
            queryKey: pagesNavRootQueryKey(workspaceId),
          }),
        ),
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
      const cachedSource = queryClient
        .getQueriesData<DatabasePayload>({
          queryKey: databasePayloadRootQueryKey(databaseId),
        })
        .flatMap(([, payload]) => payload?.dataSources ?? [])
        .find(({ id }) => id === dataSourceId);
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
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}

export function useCreateDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      ...input
    }: CreateDatabaseDataSourceInput) => {
      const response = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/data-sources/new`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}

export function useReplaceDatabaseViewDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      dataSourceId,
    }: ReplaceDatabaseViewDataSourceInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views/${databaseViewId}/source`,
        { method: "PUT", body: JSON.stringify({ dataSourceId }) },
      );
      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
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
    onSettled: async (_result, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
    },
  });
}
