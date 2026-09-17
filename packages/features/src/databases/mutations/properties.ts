import { useMutation, type QueryClient } from "@tanstack/react-query";
import { useZilobaseFeatures } from  "../../shared/context";
import { pagesNavRootQueryKey } from  "../../pages/queries";
import { useDatabaseClient } from "../client/provider";
import {
  findDataSourceBootstrap,
  invalidateDataSourceCollections,
  resolveDataSourceCommandScope,
} from "../client/command-scope";
import type { DatabasePropertyEntity } from  "../core/entities";

type AddPropertyInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  position?: number;
  type?: string;
};

export type ApplyDatabaseTemplateInput = {
  config: unknown;
  databaseId: string;
  name: string;
  properties: Array<{
    config?: unknown;
    name: string;
    type: string;
  }>;
  rows: Array<{
    content?: unknown;
    metadata?: unknown;
    title: string;
    values: Array<{
      propertyName: string;
      value: unknown;
    }>;
  }>;
};

type UpdatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  config?: unknown;
  name?: string;
  type?: string;
  visible?: boolean;
  width?: number | null;
};

type DeletePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
};

type DuplicatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  includeValues?: boolean;
};

export function useAddDatabaseProperty() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      config,
      databaseId,
      name,
      position,
      type,
    }: AddPropertyInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        databaseId,
      );
      const anchors = resolvePropertyCreateAnchors(
        queryClient,
        scope.dataSourceId,
        position,
      );
      return client.execute<DatabasePropertyEntity>({
        command: {
          ...anchors,
          config: config ?? null,
          name: name?.trim() || "Property",
          propertyType: type?.trim() || "text",
          type: "property.create",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
    onSettled: async (_result, _error, variables) => {
      await invalidateDataSourceCollections(queryClient, variables.databaseId);
    },
  });
}

export function useApplyDatabaseTemplate() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: ApplyDatabaseTemplateInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        databaseId,
      );
      const result = await client.execute<{
        dataSource: import( "../core/entities").DataSourceEntity;
      }>({
        command: { ...input, type: "template.apply" },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
      await invalidateDataSourceCollections(queryClient, databaseId);

      const workspaceId = findDataSourceBootstrap(queryClient, databaseId)
        ?.database.workspaceId;
      if (workspaceId) {
        await queryClient.invalidateQueries({
          queryKey: pagesNavRootQueryKey(workspaceId),
        });
      }

      return result;
    },
  });
}

export function useUpdateDatabaseProperty() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      ...patch
    }: UpdatePropertyInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        databaseId,
      );
      return client.execute<DatabasePropertyEntity>({
        command: {
          patch,
          propertyId: databasePropertyId,
          type: "property.update",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
    onSettled: async (_result, _error, variables) => {
      await invalidateDataSourceCollections(queryClient, variables.databaseId);
    },
  });
}

export function useDeleteDatabaseProperty() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
    }: DeletePropertyInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        databaseId,
      );
      return client.execute<DatabasePropertyEntity>({
        command: {
          propertyId: databasePropertyId,
          type: "property.archive",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
    onSettled: async (_result, _error, variables) => {
      await invalidateDataSourceCollections(queryClient, variables.databaseId);
    },
  });
}

export function useDuplicateDatabaseProperty() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      includeValues = false,
    }: DuplicatePropertyInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        databaseId,
      );
      return client.execute<DatabasePropertyEntity>({
        command: {
          includeValues,
          propertyId: databasePropertyId,
          type: "property.duplicate",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
    onSettled: async (_result, _error, variables) => {
      await invalidateDataSourceCollections(queryClient, variables.databaseId);
    },
  });
}

function resolvePropertyCreateAnchors(
  queryClient: QueryClient,
  dataSourceId: string,
  requestedPosition?: number,
) {
  const ids = (findDataSourceBootstrap(queryClient, dataSourceId)?.properties ?? [])
    .filter((property) => property.dataSourceId === dataSourceId)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(({ id }) => id);
  const position = Math.max(
    0,
    Math.min(requestedPosition ?? ids.length, ids.length),
  );
  return {
    afterPropertyId: ids[position - 1] ?? null,
    beforePropertyId: ids[position] ?? null,
  };
}
