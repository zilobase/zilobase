import { useMutation, useQuery } from "@tanstack/react-query"

import {
  databaseQueryKey,
  databaseQueryOptions,
  type DatabasePayload,
} from "@/features/databases/queries"
import { workspacesQueryKey } from "@/features/workspaces/queries"
import { apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

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

type AddPropertyInput = {
  config?: unknown
  databaseId: string
  name?: string
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

type SetDatabaseFavoriteInput = {
  databaseId: string
  isFavorite: boolean
}

function setDatabasePayload(payload: DatabasePayload | null) {
  if (!payload) {
    return
  }

  queryClient.setQueryData(databaseQueryKey(payload.database.id), payload)
}

export function useDatabase(databaseId: string | null | undefined) {
  return useQuery(databaseQueryOptions(databaseId))
}

export function useCreateDatabase() {
  return useMutation({
    mutationFn: async (input: CreateDatabaseInput) =>
      apiFetch<DatabasePayload>("/databases", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}

export function useUpdateDatabase() {
  return useMutation({
    mutationFn: async ({ databaseId, ...patch }: UpdateDatabaseInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}

export function useAddDatabaseProperty() {
  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddPropertyInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/properties`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: setDatabasePayload,
  })
}

export function useUpdateDatabaseProperty() {
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
    onSuccess: setDatabasePayload,
  })
}

export function useAddDatabaseRow(organizationId: string | null | undefined) {
  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddRowInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/rows`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(organizationId),
      })
    },
  })
}

export function useReorderDatabaseRows() {
  return useMutation({
    mutationFn: async ({ databaseId, rowIds }: ReorderRowsInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/rows/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ rowIds }),
      }),
    onSuccess: setDatabasePayload,
  })
}

export function useUpdateDatabasePropertyValue() {
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
    onSuccess: setDatabasePayload,
  })
}

export function useSetDatabaseFavorite() {
  return useMutation({
    mutationFn: async ({
      databaseId,
      isFavorite,
    }: SetDatabaseFavoriteInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/favorite`, {
        method: isFavorite ? "PUT" : "DELETE",
      }),
    onSuccess: async (payload) => {
      setDatabasePayload(payload)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(payload.database.organizationId),
      })
    },
  })
}
