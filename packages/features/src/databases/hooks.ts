import { useMutation, useQuery } from "@tanstack/react-query"
import { useCallback } from "react"

import { useNotelabFeatures } from "../context"
import {
  favoriteWorkspacePages,
  invalidateDeletedItems,
  isWorkspaceFavoriteInCache,
} from "../item-action-cache"

import { applyMutationToCache } from "./mutation-cache"
import { setDatabasePayloadQueryData } from "./query-cache"
import {
  databaseQueryKey,
  databaseQueryOptions,
  type DatabasePayload,
} from "./queries"
import type { DatabaseMutationResponse } from "./mutation-types"
import { workspacesQueryKey } from "../workspaces/queries"

type CreateDatabaseInput = {
  name?: string
  organizationId: string
  pageId: string
  standalone?: boolean
}

type UpdateDatabaseInput = {
  databaseId: string
  name?: string
  config?: unknown
}

type UpdateDatabaseViewInput = {
  config?: unknown
  databaseId: string
  databaseViewId: string
  name?: string
  type?: string
}

type AddDatabaseViewInput = {
  config?: unknown
  databaseId: string
  name?: string
  type?: string
}

type DeleteDatabaseViewInput = {
  databaseId: string
  databaseViewId: string
}

type AddPropertyInput = {
  config?: unknown
  databaseId: string
  name?: string
  position?: number
  type?: string
}

type UpdatePropertyInput = {
  databaseId: string
  databasePropertyId: string
  config?: unknown
  name?: string
  type?: string
  visible?: boolean
  width?: number | null
}

type AddRowInput = {
  databaseId: string
  pageId?: string
  parentRowId?: string | null
  position?: number
  title?: string
}

type ReorderRowsInput = {
  databaseId: string
  rowIds: string[]
}

type MoveRowInput = {
  databaseId: string
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
}

type UpdatePropertyValueInput = {
  databaseId: string
  propertyId: string
  rowId: string
  value: unknown
}

type DeletePropertyInput = {
  databaseId: string
  databasePropertyId: string
}

type DuplicatePropertyInput = {
  databaseId: string
  databasePropertyId: string
  includeValues?: boolean
}

type SetDatabaseFavoriteInput = {
  databaseId: string
  isFavorite: boolean
}

async function commitDatabaseMutation(
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
  databaseId: string,
  response: unknown,
) {
  const payload = applyMutationToCache(queryClient, databaseId, response)

  if (!payload) {
    throw new Error("Failed to apply database mutation")
  }

  return payload
}

export function useDatabase(
  databaseId: string | null | undefined,
  options?: { schemaOnly?: boolean },
) {
  const { apiFetch } = useNotelabFeatures()
  const query = useQuery(databaseQueryOptions(apiFetch, databaseId, options))
  const hasNextPage = false

  const fetchNextPage = useCallback(async () => {
    return
  }, [])

  return {
    ...query,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: false,
  }
}

export function useCreateDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async (input: CreateDatabaseInput) => {
      const shouldInheritFavorite = isWorkspaceFavoriteInCache(
        queryClient,
        input.pageId,
        input.organizationId,
      )
      const payload = await apiFetch<DatabasePayload>("/databases", {
        method: "POST",
        body: JSON.stringify(input),
      })

      if (!shouldInheritFavorite || payload.database.isFavorite) {
        return payload
      }

      return apiFetch<DatabasePayload>(
        `/databases/${payload.database.id}/favorite`,
        { method: "PUT" },
      )
    },
    onSuccess: async (payload) => {
      setDatabasePayloadQueryData(queryClient, payload.database.id, payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}

export function useUpdateDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
    onSuccess: async (_result, variables) => {
      const payload = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(variables.databaseId),
      )

      if (payload) {
        await queryClient.invalidateQueries({
          queryKey: workspacesQueryKey(payload.database.organizationId),
        })
      }
    },
  })
}

export function useUpdateDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      ...patch
    }: UpdateDatabaseViewInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useAddDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddDatabaseViewInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/views`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

type DeleteDatabaseResult = {
  database: DatabasePayload["database"] | null
  deletedDatabaseIds: string[]
  deletedWorkspaceIds: string[]
}

export function useDeleteDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async (databaseId: string) =>
      apiFetch<DeleteDatabaseResult>(`/databases/${databaseId}`, {
        method: "DELETE",
      }),
    onSuccess: async (result) =>
      invalidateDeletedItems({
        organizationId: result.database?.organizationId,
        queryClient,
        result,
      }),
  })
}

export function useDeleteDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
    }: DeleteDatabaseViewInput) => {
      const response = await apiFetch<DatabasePayload>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        { method: "DELETE" },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useAddDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddPropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useUpdateDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
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
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useDeleteDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, databasePropertyId }: DeletePropertyInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        { method: "DELETE" },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useDuplicateDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

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
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useAddDatabaseRow() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddRowInput) => {
      const current = queryClient.getQueryData<DatabasePayload | null>(
        databaseQueryKey(databaseId),
      )
      const existingRowIds = new Set(
        current?.rows.map((row) => row.id) ?? [],
      )
      const shouldInheritFavorite = Boolean(current?.database.isFavorite)
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      )

      const payload = await commitDatabaseMutation(
        queryClient,
        databaseId,
        response,
      )

      if (shouldInheritFavorite) {
        const inheritedPageIds = input.pageId
          ? [input.pageId]
          : payload.rows
              .filter((row) => !existingRowIds.has(row.id))
              .map((row) => row.pageId)

        await favoriteWorkspacePages({
          apiFetch,
          organizationId: payload.database.organizationId,
          pageIds: inheritedPageIds,
          queryClient,
        })
      }

      return payload
    },
  })
}

export function useReorderDatabaseRows() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, rowIds }: ReorderRowsInput) => {
      const response = await apiFetch<DatabaseMutationResponse>(
        `/databases/${databaseId}/rows/reorder`,
        {
          method: "PATCH",
          body: JSON.stringify({ rowIds }),
        },
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useMoveDatabaseRow() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
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
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useUpdateDatabasePropertyValue() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
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
      )

      return commitDatabaseMutation(queryClient, databaseId, response)
    },
  })
}

export function useSetDatabaseFavorite() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      databaseId,
      isFavorite,
    }: SetDatabaseFavoriteInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/favorite`, {
        method: isFavorite ? "PUT" : "DELETE",
      }),
    onSuccess: async (payload) => {
      setDatabasePayloadQueryData(queryClient, payload.database.id, payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}
