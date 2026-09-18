import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { pagesNavRootQueryKey } from "../../pages/queries";
import { type UpdateDatabaseInput } from "./databases";
import { useDatabaseSessionId } from "../queries/session";
import {
  findDataSourceBootstrap,
  resolveDataSourceCommandScope,
} from "./scope";
import { executeDatabaseCommand } from "./execute";
import { invalidateDatabaseQueries } from "./invalidate";
import { runSerialized, viewSerializationKey } from "./serialize";
import type {
  DatabaseViewEntity,
  DataSourceEntity,
} from "../core/entities";

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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({ databaseId: dataSourceId, ...patch }: UpdateDatabaseInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        dataSourceId,
      );
      const ack = await executeDatabaseCommand(apiFetch, {
        command: { patch, type: "dataSource.update" },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      return ack.result as DataSourceEntity;
    },
    onSuccess: async (_result, variables) => {
      const workspaceId = findDataSourceBootstrap(
        queryClient,
        variables.databaseId,
      )?.database.workspaceId;

      await Promise.all([
        (async () => {
          try {
            const scope = await resolveDataSourceCommandScope(
              queryClient,
              apiFetch,
              variables.databaseId,
            );
            invalidateDatabaseQueries(
              queryClient,
              sessionId,
              scope.hostDatabaseId,
            );
          } catch {
            // Ignore.
          }
        })(),
        ...(workspaceId
          ? [
            queryClient.invalidateQueries({
              queryKey: pagesNavRootQueryKey(workspaceId),
            }),
          ]
          : []),
      ]);
    },
  });
}

export function useLinkDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

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
        : (await runSerialized(
          viewSerializationKey(databaseId),
          () =>
            executeDatabaseCommand(apiFetch, {
              command: {
                afterId: null,
                beforeId: null,
                dataSourceId,
                type: "dataSource.link",
              },
              databaseId,
            }),
        )).result as DataSourceEntity;
      const view = (await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
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
          }),
      )).result as DatabaseViewEntity;
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return { dataSource, view };
    },
  });
}

export function useCreateDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({
      databaseId,
      ...input
    }: CreateDatabaseDataSourceInput) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              config: input.config ?? {},
              name: input.name?.trim() || "New data source",
              type: "dataSource.create",
              viewName: input.viewName?.trim() || "Table",
              viewType: input.viewType?.trim() || "table",
            },
            databaseId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as {
        dataSource: DataSourceEntity;
        view: DatabaseViewEntity;
      };
    },
    onSettled: async (_result, _error, variables) => {
      invalidateDatabaseQueries(queryClient, sessionId, variables.databaseId);
    },
  });
}

export function useReplaceDatabaseViewDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      dataSourceId,
    }: ReplaceDatabaseViewDataSourceInput) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              dataSourceId,
              type: "view.setDataSource",
              viewId: databaseViewId,
            },
            databaseId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseViewEntity;
    },
    onSettled: async (_result, _error, variables) => {
      invalidateDatabaseQueries(queryClient, sessionId, variables.databaseId);
    },
  });
}

export function useUnlinkDatabaseDataSource() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({
      databaseId,
      dataSourceId,
    }: Pick<LinkDatabaseDataSourceInput, "databaseId" | "dataSourceId">) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: { dataSourceId, type: "dataSource.unlink" },
            databaseId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DataSourceEntity;
    },
  });
}
