import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import {
  databaseQueryKey,
  databaseQueryOptions,
  type DatabasePayload,
} from "./queries"
import {
  createDatabaseClientMutationId,
  rememberDatabaseClientMutationId,
} from "./mutation-tracker"
import { workspacesQueryKey } from "../workspaces/queries"

type DatabaseMutationInput = {
  clientMutationId?: string
}

type CreateDatabaseInput = DatabaseMutationInput & {
  name?: string
  organizationId: string
  pageId: string
}

type UpdateDatabaseInput = DatabaseMutationInput & {
  databaseId: string
  name?: string
  config?: unknown
}

type UpdateDatabaseViewInput = DatabaseMutationInput & {
  config?: unknown
  databaseId: string
  databaseViewId: string
  name?: string
  type?: string
}

type AddDatabaseViewInput = DatabaseMutationInput & {
  config?: unknown
  databaseId: string
  name?: string
  type?: string
}

type DeleteDatabaseViewInput = DatabaseMutationInput & {
  databaseId: string
  databaseViewId: string
}

type AddPropertyInput = DatabaseMutationInput & {
  config?: unknown
  databaseId: string
  name?: string
  position?: number
  type?: string
}

type UpdatePropertyInput = DatabaseMutationInput & {
  databaseId: string
  databasePropertyId: string
  config?: unknown
  name?: string
  type?: string
  visible?: boolean
  width?: number | null
}

type AddRowInput = DatabaseMutationInput & {
  databaseId: string
  pageId?: string
  parentRowId?: string | null
  position?: number
  title?: string
}

type ReorderRowsInput = DatabaseMutationInput & {
  databaseId: string
  rowIds: string[]
}

type MoveRowInput = DatabaseMutationInput & {
  databaseId: string
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
}

type UpdatePropertyValueInput = DatabaseMutationInput & {
  databaseId: string
  propertyId: string
  rowId: string
  value: unknown
}

type DeletePropertyInput = DatabaseMutationInput & {
  databaseId: string
  databasePropertyId: string
}

type DuplicatePropertyInput = DatabaseMutationInput & {
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

function createMutationBody(input: Record<string, unknown>) {
  const clientMutationId =
    typeof input.clientMutationId === "string" && input.clientMutationId.length > 0
      ? input.clientMutationId
      : createDatabaseClientMutationId()

  rememberDatabaseClientMutationId(clientMutationId)

  return JSON.stringify({
    ...input,
    clientMutationId,
  })
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
        body: createMutationBody(input),
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
        body: createMutationBody(patch),
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
          body: createMutationBody(patch),
        }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useAddDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({ databaseId, ...input }: AddDatabaseViewInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/views`, {
        method: "POST",
        body: createMutationBody(input),
      }),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useDeleteDatabaseView() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
    }: DeleteDatabaseViewInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/views/${databaseViewId}`,
        { method: "DELETE" }
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
        body: createMutationBody(input),
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
          body: createMutationBody(patch),
        }
      ),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
  })
}

export function useDeleteDatabaseProperty() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      clientMutationId,
      databaseId,
      databasePropertyId,
    }: DeletePropertyInput) =>
      apiFetch<DatabasePayload>(
        `/databases/${databaseId}/properties/${databasePropertyId}`,
        {
          method: "DELETE",
          body: createMutationBody({ clientMutationId }),
        }
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
          body: createMutationBody({ includeValues }),
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
        body: createMutationBody(input),
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
        body: createMutationBody({ rowIds }),
      }),
    onSuccess: (payload) => setDatabasePayload(queryClient, payload),
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
    }: MoveRowInput) =>
      apiFetch<DatabasePayload>(`/databases/${databaseId}/rows/${rowId}/move`, {
        method: "PATCH",
        body: createMutationBody({ groupPropertyId, groupValue, rowIds }),
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
          body: createMutationBody({ value }),
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
