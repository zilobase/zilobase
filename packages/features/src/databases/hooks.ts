import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { useNotelabFeatures } from "../context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
} from "../item-action-cache";

import { applyMutationToCache } from "./mutation-cache";
import { setDatabasePayloadQueryData } from "./query-cache";
import {
  databaseAccessQueryKey,
  databaseAccessQueryOptions,
  databasePayloadRootQueryKey,
  databaseQueryKey,
  databaseQueryOptions,
  type DatabasePayload,
} from "./queries";
import {
  isDatabaseMutationResponse,
  type DatabaseMutationResponse,
} from "./mutation-types";
import {
  applyConfirmedAddedDatabaseRow,
  applyOptimisticAddedDatabaseRow,
  isAddRowResponse,
  type AddRowResponse,
} from "./add-row-cache";
import { applyCreatedDatabaseToPageNav } from "./create-database-cache";
import {
  applyDatabaseFavoriteToNav,
  applyNavDelta,
  type NavDelta,
} from "../pages/nav-delta";
import {
  pagesNavRootQueryKey,
  pagesQueryKey,
  pagesRootQueryKey,
  type PageNavigationPayload,
} from "../pages/queries";

type CreateDatabaseInput = {
  name?: string;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
};

type CreateDatabaseResponse = DatabasePayload & {
  navDelta?: NavDelta;
};

type UpdateDatabaseInput = {
  databaseId: string;
  name?: string;
  config?: unknown;
};

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
  name?: string;
  type?: string;
};

type DeleteDatabaseViewInput = {
  databaseId: string;
  databaseViewId: string;
};

type AddPropertyInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  position?: number;
  type?: string;
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

type AddRowInput = {
  databaseId: string;
  pageId?: string;
  parentRowId?: string | null;
  position?: number;
  sourceDatabaseId?: string;
  sourcePropertyMode?: "duplicate" | "match";
  title?: string;
};

type ReorderRowsInput = {
  databaseId: string;
  rowIds: string[];
};

type MoveRowInput = {
  databaseId: string;
  groupPropertyId?: string;
  groupValue?: unknown;
  rowId: string;
  rowIds: string[];
};

type UpdatePropertyValueInput = {
  databaseId: string;
  propertyId: string;
  rowId: string;
  value: unknown;
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

type SetDatabaseFavoriteInput = {
  databaseId: string;
  isFavorite: boolean;
};

async function commitDatabaseMutation(
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
  databaseId: string,
  response: unknown,
) {
  const payload = applyMutationToCache(queryClient, databaseId, response);

  if (!payload) {
    throw new Error("Failed to apply database mutation");
  }

  return payload;
}

export function reorderDatabaseRows(
  payload: DatabasePayload | null | undefined,
  rowIds: string[],
) {
  if (!payload) {
    return payload;
  }

  const requestedPositions = new Map(
    rowIds.map((rowId, position) => [rowId, position]),
  );
  const rows = payload.rows
    .map((row) => {
      const position = requestedPositions.get(row.id);

      return position === undefined ? row : { ...row, position };
    })
    .sort((left, right) => left.position - right.position);

  return { ...payload, rows };
}

export function updateDatabasePropertyValue(
  payload: DatabasePayload | null | undefined,
  input: UpdatePropertyValueInput,
) {
  if (!payload) {
    return payload;
  }

  const row = payload.rows.find((candidate) => candidate.id === input.rowId);
  const pageId = row?.pageId;

  if (!pageId) {
    return payload;
  }

  const now = new Date().toISOString();
  const existingValue = payload.values.find(
    (value) => value.pageId === pageId && value.propertyId === input.propertyId,
  );
  const nextValue = {
    createdAt: existingValue?.createdAt ?? now,
    id: existingValue?.id ?? `optimistic-property-value-${crypto.randomUUID()}`,
    propertyId: input.propertyId,
    updatedAt: now,
    value: input.value,
    pageId,
  };
  const values = existingValue
    ? payload.values.map((value) =>
        value.id === existingValue.id ? nextValue : value,
      )
    : [...payload.values, nextValue];

  return { ...payload, values };
}

export function moveDatabaseRow(
  payload: DatabasePayload | null | undefined,
  input: MoveRowInput,
) {
  const reorderedPayload = reorderDatabaseRows(payload, input.rowIds);

  if (!reorderedPayload || !input.groupPropertyId) {
    return reorderedPayload;
  }

  return updateDatabasePropertyValue(reorderedPayload, {
    databaseId: input.databaseId,
    propertyId: input.groupPropertyId,
    rowId: input.rowId,
    value: input.groupValue,
  });
}

export function updateDatabaseViewInPayload(
  payload: DatabasePayload | null | undefined,
  input: UpdateDatabaseViewInput,
) {
  if (!payload) {
    return payload;
  }

  const now = new Date().toISOString();
  const views = payload.views.map((view) =>
    view.id === input.databaseViewId
      ? {
          ...view,
          ...(input.config !== undefined ? { config: input.config } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          updatedAt: now,
        }
      : view,
  );

  return { ...payload, views };
}

export function updateDatabasePropertyInPayload(
  payload: DatabasePayload | null | undefined,
  input: UpdatePropertyInput,
) {
  if (!payload) {
    return payload;
  }

  const now = new Date().toISOString();
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

  return { ...payload, properties };
}

export function useDatabase(
  databaseId: string | null | undefined,
  options?: { includeDeleted?: boolean; schemaOnly?: boolean },
) {
  const { apiFetch } = useNotelabFeatures();
  const query = useQuery(databaseQueryOptions(apiFetch, databaseId, options));
  const hasNextPage = false;

  const fetchNextPage = useCallback(async () => {
    return;
  }, []);

  return {
    ...query,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: false,
  };
}

export function useDatabaseAccess(databaseId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures();
  return useQuery(databaseAccessQueryOptions(apiFetch, databaseId));
}

type DatabaseAccessInput = {
  accessLevel: "view" | "edit" | "full";
  databaseId: string;
  targetId: string;
  targetType: "public" | "user" | "team";
};

export function useUpsertDatabaseAccess() {
  const { apiFetch, queryClient } = useNotelabFeatures();
  return useMutation({
    mutationFn: async ({ databaseId, ...body }: DatabaseAccessInput) =>
      apiFetch(`/databases/${databaseId}/access`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(variables.databaseId),
      });
    },
  });
}

export function useDeleteDatabaseAccess() {
  const { apiFetch, queryClient } = useNotelabFeatures();
  return useMutation({
    mutationFn: async ({
      databaseId,
      ruleId,
    }: {
      databaseId: string;
      ruleId: string;
    }) =>
      apiFetch(`/databases/${databaseId}/access/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(variables.databaseId),
      });
    },
  });
}

export function useSetDatabasePublished() {
  const { apiFetch, queryClient } = useNotelabFeatures();
  return useMutation({
    mutationFn: async ({
      databaseId,
      isPublished,
    }: {
      databaseId: string;
      isPublished: boolean;
    }) =>
      apiFetch(
        `/databases/${databaseId}/access${isPublished ? "" : "/public"}`,
        {
          method: isPublished ? "PUT" : "DELETE",
          ...(isPublished
            ? {
                body: JSON.stringify({
                  accessLevel: "view",
                  targetId: "*",
                  targetType: "public",
                }),
              }
            : {}),
        },
      ),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(variables.databaseId),
      });
    },
  });
}

export function useCreateDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async (input: CreateDatabaseInput) => {
      return apiFetch<CreateDatabaseResponse>("/databases", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: async (payload) => {
      setDatabasePayloadQueryData(queryClient, payload.database.id, payload);

      if (!payload.database.pageId) {
        await queryClient.invalidateQueries({
          queryKey: pagesNavRootQueryKey(payload.database.workspaceId),
        });
        return;
      }

      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(payload.database.workspaceId) },
        (current) =>
          payload.navDelta
            ? applyNavDelta(current, payload.navDelta)
            : applyCreatedDatabaseToPageNav(current, payload),
      );
    },
  });
}

export function useUpdateDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) =>
          current
            ? {
                ...current,
                database: {
                  ...current.database,
                  ...(variables.name !== undefined
                    ? { name: variables.name }
                    : {}),
                  ...(variables.config !== undefined
                    ? { config: variables.config }
                    : {}),
                  updatedAt: new Date().toISOString(),
                },
              }
            : current,
      );

      return { previous };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }
    },
    onSuccess: async (_result, variables) => {
      const payload = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      if (payload) {
        await queryClient.invalidateQueries({
          queryKey: pagesQueryKey(payload.database.workspaceId),
        });
      }
    },
  });
}

export function useUpdateDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures();
  const mutationSequenceRef = useRef(0);
  const latestMutationByViewRef = useRef(new Map<string, number>());

  return useMutation({
    onMutate: async (variables) => {
      const mutationSequence = mutationSequenceRef.current + 1;
      const mutationKey = `${variables.databaseId}:${variables.databaseViewId}`;

      mutationSequenceRef.current = mutationSequence;
      latestMutationByViewRef.current.set(mutationKey, mutationSequence);

      await queryClient.cancelQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) => updateDatabaseViewInPayload(current, variables),
      );

      return { mutationKey, mutationSequence, previous };
    },
    mutationFn: async ({
      databaseId,
      databaseViewId,
      ...patch
    }: UpdateDatabaseViewInput) => {
      return apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );
    },
    onError: (_error, variables, context) => {
      const isLatestMutation =
        context?.mutationKey &&
        latestMutationByViewRef.current.get(context.mutationKey) ===
          context.mutationSequence;

      if (isLatestMutation && context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }
    },
    onSuccess: async (response, variables, context) => {
      const isLatestMutation =
        context?.mutationKey &&
        latestMutationByViewRef.current.get(context.mutationKey) ===
          context.mutationSequence;

      if (!isLatestMutation) {
        return;
      }

      await commitDatabaseMutation(queryClient, variables.databaseId, response);
    },
    onSettled: (_result, _error, _variables, context) => {
      if (
        context?.mutationKey &&
        latestMutationByViewRef.current.get(context.mutationKey) ===
          context.mutationSequence
      ) {
        latestMutationByViewRef.current.delete(context.mutationKey);
      }
    },
  });
}

export function useAddDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddDatabaseViewInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

type DeleteDatabaseResult = {
  database: DatabasePayload["database"] | null;
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};

type RestoreDatabaseResult = {
  database: DatabasePayload["database"];
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

export function useDeleteDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async (databaseId: string) =>
      apiFetch<DeleteDatabaseResult>(`/databases/${databaseId}`, {
        method: "DELETE",
      }),
    onSuccess: async (result) =>
      invalidateDeletedItems({
        workspaceId: result.database?.workspaceId,
        queryClient,
        result,
      }),
  });
}

export function useRestoreDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async (databaseId: string) =>
      apiFetch<RestoreDatabaseResult>(`/databases/${databaseId}/restore`, {
        method: "POST",
      }),
    onSuccess: async (result) =>
      invalidateRestoredItems({
        workspaceId: result.database.workspaceId,
        queryClient,
        result,
      }),
  });
}

export function useDeleteDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
    }: DeleteDatabaseViewInput) => {
      const response = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        { method: "DELETE" },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

export function useAddDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddPropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

export function useUpdateDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) => updateDatabasePropertyInPayload(current, variables),
      );

      return { previous };
    },
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      ...patch
    }: UpdatePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }
    },
  });
}

export function useDeleteDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
    }: DeletePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        { method: "DELETE" },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
  });
}

export function useDuplicateDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures();

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

export function useAddDatabaseRow() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddRowInput) => {
      await queryClient.cancelQueries({
        queryKey: databaseQueryKey(databaseId),
      });

      const current = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(databaseId),
      );
      const optimistic = current
        ? applyOptimisticAddedDatabaseRow(current, input)
        : null;

      if (optimistic) {
        setDatabasePayloadQueryData(
          queryClient,
          databaseId,
          optimistic.payload,
        );
      }

      let response: AddRowResponse | DatabaseMutationResponse;
      let payload: DatabasePayload;

      try {
        response = await apiFetch<AddRowResponse | DatabaseMutationResponse>(
          `/databases/${databaseId}/rows`,
          {
            method: "POST",
            body: JSON.stringify(input),
          },
        );

        if (isAddRowResponse(response)) {
          const latest =
            queryClient.getQueryData<DatabasePayload | null>(
              databaseQueryKey(databaseId),
            ) ??
            optimistic?.payload ??
            current;

          if (!latest) {
            throw new Error("Failed to apply database mutation");
          }

          payload = applyConfirmedAddedDatabaseRow(
            latest,
            optimistic
              ? { pageId: optimistic.pageId, rowId: optimistic.rowId }
              : null,
            response,
          );
          setDatabasePayloadQueryData(queryClient, databaseId, payload);
        } else if (isDatabaseMutationResponse(response)) {
          if (current) {
            setDatabasePayloadQueryData(queryClient, databaseId, current);
          }

          payload = await commitDatabaseMutation(
            queryClient,
            databaseId,
            response,
          );
        } else {
          throw new Error("Failed to apply database mutation");
        }
      } catch (error) {
        if (current) {
          setDatabasePayloadQueryData(queryClient, databaseId, current);
        }

        throw error;
      }

      if (
        (isAddRowResponse(response) && response.isFavorite) ||
        (!isAddRowResponse(response) && current?.database.isFavorite)
      ) {
        await queryClient.invalidateQueries({
          queryKey: pagesQueryKey(payload.database.workspaceId),
        });
      }

      return payload;
    },
  });
}

export function useReorderDatabaseRows() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) => reorderDatabaseRows(current, variables.rowIds),
      );

      return { previous };
    },
    mutationFn: async ({ databaseId, rowIds }: ReorderRowsInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/reorder`,
        {
          method: "PATCH",
          body: JSON.stringify({ rowIds }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }
    },
  });
}

export function useMoveDatabaseRow() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) => moveDatabaseRow(current, variables),
      );

      return { previous };
    },
    mutationFn: async ({
      databaseId,
      rowId,
      rowIds,
      groupPropertyId,
      groupValue,
    }: MoveRowInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/${rowId}/move`,
        {
          method: "PATCH",
          body: JSON.stringify({
            groupPropertyId,
            groupValue,
            rowIds,
          }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }
    },
  });
}

export function useUpdateDatabasePropertyValue() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: databasePayloadRootQueryKey(variables.databaseId),
      });
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) => updateDatabasePropertyValue(current, variables),
      );

      return { previous };
    },
    mutationFn: async ({
      databaseId,
      propertyId,
      rowId,
      value,
    }: UpdatePropertyValueInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/${rowId}/properties/${propertyId}`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      );

      return commitDatabaseMutation(queryClient, databaseId, response);
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }
    },
  });
}

export function useSetDatabaseFavorite() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ databaseId, isFavorite }: SetDatabaseFavoriteInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/favorite`, {
        method: isFavorite ? "PUT" : "DELETE",
      }),
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: databasePayloadRootQueryKey(variables.databaseId),
        }),
        queryClient.cancelQueries({ queryKey: pagesRootQueryKey() }),
      ]);
      const previous = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      );
      const previousNavQueries =
        queryClient.getQueriesData<PageNavigationPayload>({
          queryKey: previous
            ? pagesNavRootQueryKey(previous.database.workspaceId)
            : pagesRootQueryKey(),
        });

      queryClient.setQueriesData<DatabasePayload | null>(
        { queryKey: databasePayloadRootQueryKey(variables.databaseId) },
        (current) =>
          current
            ? {
                ...current,
                database: {
                  ...current.database,
                  isFavorite: variables.isFavorite,
                },
              }
            : current,
      );

      if (previous) {
        queryClient.setQueriesData<PageNavigationPayload | undefined>(
          { queryKey: pagesNavRootQueryKey(previous.database.workspaceId) },
          (current) =>
            applyDatabaseFavoriteToNav(current, {
              ...previous.database,
              isFavorite: variables.isFavorite,
              views: previous.views,
            }),
        );
      }

      return { previous, previousNavQueries };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        setDatabasePayloadQueryData(
          queryClient,
          variables.databaseId,
          context.previous,
        );
      }

      for (const [queryKey, data] of context?.previousNavQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (payload) => {
      setDatabasePayloadQueryData(queryClient, payload.database.id, payload);
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(payload.database.workspaceId) },
        (current) =>
          applyDatabaseFavoriteToNav(current, {
            ...payload.database,
            views: payload.views,
          }),
      );
    },
  });
}
