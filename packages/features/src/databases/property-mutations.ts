import { useMutation, type QueryClient } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { getDataSourcePayloadQueryEntries, setDataSourcePayloadQueryData } from "./query-cache";
import { type DatabasePayload } from "./queries";
import { type DatabaseMutationResponse } from "./mutation-types";
import { shouldClearValuesForPropertyTypeChange } from "./property-types";
import { pagesNavRootQueryKey } from "../pages/queries";
import { commitDatabaseMutation } from "./mutation-cache-policy";
import { useDatabaseClient } from "./client/provider";
import {
  findDataSourcePayload,
  invalidateLegacyDataSourcePayloads,
  resolveDataSourceCommandScope,
} from "./client/command-scope";
import type { DatabasePropertyEntity } from "./contracts-v2";

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

export function updateDatabasePropertyInPayload(
  payload: DatabasePayload | null | undefined,
  input: UpdatePropertyInput,
) {
  if (!payload) {
    return payload;
  }

  const now = new Date().toISOString();
  const previousProperty = payload.properties.find(
    (databaseProperty) => databaseProperty.id === input.databasePropertyId,
  );
  const previousType = previousProperty?.property.type;
  const pagePropertyId = previousProperty?.property.id;
  const properties = payload.properties.map((databaseProperty) =>
    databaseProperty.id === input.databasePropertyId
      ? {
          ...databaseProperty,
          ...(input.visible !== undefined ? { visible: input.visible } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          updatedAt: now,
          property: {
            ...databaseProperty.property,
            ...(input.config !== undefined ? { config: input.config } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
            updatedAt: now,
          },
        }
      : databaseProperty,
  );
  const shouldUpdateValues = Boolean(
    input.type &&
    previousType &&
    input.type !== previousType &&
    (shouldClearValuesForPropertyTypeChange(previousType, input.type) ||
      (previousType === "date" && input.type === "text")),
  );
  const values = shouldUpdateValues
    ? payload.values.map((propertyValue) =>
        propertyValue.propertyId === pagePropertyId
          ? {
              ...propertyValue,
              updatedAt: now,
              value: shouldClearValuesForPropertyTypeChange(
                previousType!,
                input.type!,
              )
                ? null
                : formatDatePropertyValueAsText(propertyValue.value),
            }
          : propertyValue,
      )
    : payload.values;

  return { ...payload, properties, values };
}

function formatDatePropertyValueAsText(value: unknown) {
  const [start, end] = datePropertyBounds(value);

  const startText = typeof start === "string" ? start.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";

  return startText && endText ? `${startText} - ${endText}` : startText || null;
}

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
      await invalidateLegacyDataSourcePayloads(queryClient, variables.databaseId);
    },
  });
}

export function useApplyDatabaseTemplate() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: ApplyDatabaseTemplateInput) => {
      const payload = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/apply-template`,
        {
          body: JSON.stringify(input),
          method: "POST",
        },
      );
      const current = getDataSourcePayloadQueryEntries(
        queryClient,
        databaseId,
      ).find(([, cached]) => cached)?.[1];
      const nextPayload: DatabasePayload = {
        ...payload,
        database: {
          ...payload.database,
          accessLevel:
            payload.database.accessLevel ?? current?.database.accessLevel,
        },
      };

      setDataSourcePayloadQueryData(queryClient, databaseId, nextPayload);

      await queryClient.invalidateQueries({
        queryKey: pagesNavRootQueryKey(nextPayload.database.workspaceId),
      });

      return nextPayload;
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
      await invalidateLegacyDataSourcePayloads(queryClient, variables.databaseId);
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
      await invalidateLegacyDataSourcePayloads(queryClient, variables.databaseId);
    },
  });
}

export function useDuplicateDatabaseProperty() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      includeValues = false,
    }: DuplicatePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ includeValues }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

function datePropertyBounds(value: unknown): [unknown, unknown] {
  if (Array.isArray(value)) return [value[0], value[1]];
  if (value && typeof value === "object") {
    const date = value as { date?: unknown; start?: unknown; end?: unknown };
    return [date.start ?? date.date, date.end];
  }
  return [value, undefined];
}

function resolvePropertyCreateAnchors(
  queryClient: QueryClient,
  dataSourceId: string,
  requestedPosition?: number,
) {
  const ids = (findDataSourcePayload(queryClient, dataSourceId)?.properties ?? [])
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
