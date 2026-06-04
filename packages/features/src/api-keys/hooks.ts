import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { useActiveOrganizationId } from "../integrations/hooks"
import {
  apiKeysQueryKey,
  apiKeysQueryOptions,
  type ApiKeyRecord,
  type CreatedApiKeyRecord,
} from "./queries"

export function useApiKeys(organizationId?: string | null) {
  const { apiFetch } = useNotelabFeatures()
  const activeOrganizationId = useActiveOrganizationId()

  return useQuery(apiKeysQueryOptions(apiFetch, organizationId ?? activeOrganizationId))
}

export function useCreateApiKey() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: {
      expiresIn?: number | null
      name: string
      organizationId: string
    }) =>
      apiFetch<{ key: CreatedApiKeyRecord }>("/api/keys", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.organizationId),
      })
    },
  })
}

export function useUpdateApiKey() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      enabled?: boolean
      id: string
      name?: string
      organizationId: string
    }) =>
      apiFetch<{ key: ApiKeyRecord }>(`/api/keys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.organizationId),
      })
    },
  })
}

export function useDeleteApiKey() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: ({
      id,
    }: {
      id: string
      organizationId: string
    }) =>
      apiFetch<{ deleted: boolean }>(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: apiKeysQueryKey(variables.organizationId),
      })
    },
  })
}
