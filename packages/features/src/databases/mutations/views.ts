import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import {
  databaseRootQueryKey,
} from "../queries/queries";
import {
  pagesNavRootQueryKey,
  type PageNavigationPayload,
} from "../../pages/queries";
import { useDatabaseSessionId } from "../queries/session";
import type { DatabaseViewEntity } from "../core/entities";
import { findDataSourceBootstrap } from "./scope";
import { executeDatabaseCommand } from "./execute";
import { invalidateDatabaseQueries } from "./invalidate";
import {
  cancelHostQueries,
  invalidateOptimisticHost,
  patchCachedView,
  type OptimisticContext,
} from "./optimistic";
import { runSerialized, viewSerializationKey } from "./serialize";

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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      ...patch
    }: UpdateDatabaseViewInput) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              patch,
              type: "view.update",
              viewId: databaseViewId,
            },
            databaseId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseViewEntity;
    },
    onMutate: async ({ databaseId, databaseViewId, ...patch }): Promise<OptimisticContext> => {
      await cancelHostQueries(queryClient, sessionId, databaseId);
      const rollback = patchCachedView(
        queryClient,
        sessionId,
        databaseId,
        databaseViewId,
        patch,
      );
      return { rollback, scope: { hostDatabaseId: databaseId } };
    },
    onError: (_error, _input, context) => {
      context?.rollback();
      invalidateOptimisticHost(queryClient, sessionId, context?.scope);
    },
    onSuccess: (updatedView, variables) => {
      const bootstrap = findDataSourceBootstrap(
        queryClient,
        updatedView.dataSourceId,
      );
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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({
      config,
      databaseId,
      dataSourceId,
      name,
      type,
    }: AddDatabaseViewInput) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
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
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as DatabaseViewEntity;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: databaseRootQueryKey(),
      });
    },
  });
}

export function useDeleteDatabaseView() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
    }: DeleteDatabaseViewInput) => {
      const ack = await runSerialized(
        viewSerializationKey(databaseId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: { type: "view.delete", viewId: databaseViewId },
            databaseId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, databaseId);
      return ack.result as { viewId: string };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: databaseRootQueryKey(),
      });
    },
  });
}
