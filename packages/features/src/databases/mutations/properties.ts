import { useMutation, type QueryClient } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { pagesNavRootQueryKey } from "../../pages/queries";
import { useDatabaseSessionId } from "../client/provider";
import {
  findDataSourceBootstrap,
  resolveDataSourceCommandScope,
} from "./scope";
import { executeDatabaseCommand } from "./execute";
import { invalidateDatabaseQueries } from "./invalidate";
import {
  runSerialized,
  structuralSerializationKey,
} from "./serialize";
import type { DatabasePropertyEntity } from "../core/entities";

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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

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
      const ack = await runSerialized(
        structuralSerializationKey(scope.dataSourceId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              ...anchors,
              config: config ?? null,
              name: name?.trim() || "Property",
              propertyType: type?.trim() || "text",
              type: "property.create",
            },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      return ack.result as DatabasePropertyEntity;
    },
    onSuccess: async (_result, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Ignore.
      }
    },
  });
}

export function useApplyDatabaseTemplate() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: ApplyDatabaseTemplateInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        databaseId,
      );
      const ack = await runSerialized(
        structuralSerializationKey(scope.dataSourceId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: { ...input, type: "template.apply" },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
      );
      const result = ack.result as {
        dataSource: import("../core/entities").DataSourceEntity;
      };
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);

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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

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
      const ack = await runSerialized(
        structuralSerializationKey(scope.dataSourceId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              patch,
              propertyId: databasePropertyId,
              type: "property.update",
            },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      return ack.result as DatabasePropertyEntity;
    },
    onSuccess: async (_result, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Ignore.
      }
    },
  });
}

export function useDeleteDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

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
      const ack = await runSerialized(
        structuralSerializationKey(scope.dataSourceId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              propertyId: databasePropertyId,
              type: "property.archive",
            },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      return ack.result as DatabasePropertyEntity;
    },
    onSuccess: async (_result, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Ignore.
      }
    },
  });
}

export function useDuplicateDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

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
      const ack = await runSerialized(
        structuralSerializationKey(scope.dataSourceId),
        () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              includeValues,
              propertyId: databasePropertyId,
              type: "property.duplicate",
            },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
      );
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      return ack.result as DatabasePropertyEntity;
    },
    onSuccess: async (_result, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Ignore.
      }
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
