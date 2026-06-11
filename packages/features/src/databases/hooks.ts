import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import {
  databaseQueryKey,
  databaseQueryOptions,
  type DatabasePayload,
} from "./queries"
import { workspacesQueryKey } from "../workspaces/queries"

type CreateDatabaseInput = {
  name?: string
  organizationId: string
  pageId: string
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

function setDatabasePayload(
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
  payload: DatabasePayload | null,
) {
  if (!payload) {
    return
  }

  queryClient.setQueryData(databaseQueryKey(payload.database.id), payload)
}

export function useDatabase(databaseId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(databaseQueryOptions(apiFetch, databaseId))
}

export function useCreateDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async (input: CreateDatabaseInput) =>
      apiFetch<DatabasePayload>("/databases", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(queryClient, payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}

export function useUpdateDatabase() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(queryClient, payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
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
    }: UpdateDatabaseViewInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useAddDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddPropertyInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/properties`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useUpdateDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      ...patch
    }: UpdatePropertyInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useDeleteDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, databasePropertyId }: DeletePropertyInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        { method: "DELETE" }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useDuplicateDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      databaseId,
      databasePropertyId,
      includeValues = false,
    }: DuplicatePropertyInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/properties/${databasePropertyId}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ includeValues }),
        }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useAddDatabaseRow(organizationId: string | null | undefined) {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddRowInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/rows`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(queryClient, payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(organizationId),
      })
    },
  })
}

export function useReorderDatabaseRows() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, rowIds }: ReorderRowsInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/rows/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ rowIds }),
      }),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
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
    }: UpdatePropertyValueInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/rows/${rowId}/properties/${propertyId}`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
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
      setDatabasePayload(queryClient, payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}
