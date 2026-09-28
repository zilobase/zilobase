import type { ConfigurationChange } from "../interactions/configuration";
import { useDatabaseController } from "../interactions/react";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { resolveDataSourceCommandScope } from "./scope";
import type { DatabasePropertyEntity } from "../core/entities";
type AddPropertyInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  position?: number;
  type?: string;
};
export type ApplyDatabaseTemplateInput = {
  hostDatabaseId?: string;
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
  configuration?: ConfigurationChange[];
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
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ config, databaseId, name, position, type }: AddPropertyInput) => {
      const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
      const anchors = resolvePropertyCreateAnchors(
        controller.bootstrap(scope.hostDatabaseId)?.properties ?? [],
        scope.dataSourceId,
        position,
      );
      const ack = await controller.execute({
        command: {
          ...anchors,
          config: config ?? null,
          name: name?.trim() || "Property",
          propertyType: type?.trim() || "text",
          type: "property.create",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      return ack.result as DatabasePropertyEntity;
    },
  });
}
export function useApplyDatabaseTemplate() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ databaseId, hostDatabaseId, ...input }: ApplyDatabaseTemplateInput) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        controller.sessionId,
        databaseId,
        hostDatabaseId,
      );
      const ack = await controller.execute({
        command: { ...input, type: "template.apply" },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      const result = ack.result as {
        dataSource: import("../core/entities").DataSourceEntity;
      };
      return result;
    },
  });
}
export function useUpdateDatabaseProperty() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ databaseId, databasePropertyId, ...patch }: UpdatePropertyInput) => {
      const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
      const ack = await controller.execute({
        command: {
          patch,
          propertyId: databasePropertyId,
          type: "property.update",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      return ack.result as DatabasePropertyEntity;
    },
  });
}
export function useDeleteDatabaseProperty() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ databaseId, databasePropertyId }: DeletePropertyInput) => {
      const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
      const ack = await controller.execute({
        command: {
          propertyId: databasePropertyId,
          type: "property.archive",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      return ack.result as DatabasePropertyEntity;
    },
  });
}
export function useDuplicateDatabaseProperty() {
  const controller = useDatabaseController();
  const { queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      includeValues = false,
    }: DuplicatePropertyInput) => {
      const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
      const ack = await controller.execute({
        command: {
          includeValues,
          propertyId: databasePropertyId,
          type: "property.duplicate",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      return ack.result as DatabasePropertyEntity;
    },
  });
}
function resolvePropertyCreateAnchors(
  properties: DatabasePropertyEntity[],
  dataSourceId: string,
  requestedPosition?: number,
) {
  const ids = properties
    .filter((property) => property.dataSourceId === dataSourceId)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(({ id }) => id);
  const position = Math.max(0, Math.min(requestedPosition ?? ids.length, ids.length));
  return {
    afterPropertyId: ids[position - 1] ?? null,
    beforePropertyId: ids[position] ?? null,
  };
}
