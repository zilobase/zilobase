import { useMutation, useQuery } from "@tanstack/react-query"

import {
  apiKeysQueryKey,
  apiKeysQueryOptions,
  type ApiKeyRecord,
  type CreatedApiKeyRecord,
} from "@/features/api-keys/queries"
import { useActiveOrganizationId } from "@/features/integrations/hooks"
import { apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

export function useApiKeys(organizationId?: string | null) {
  const activeOrganizationId = useActiveOrganizationId()

  return useQuery(apiKeysQueryOptions(organizationId ?? activeOrganizationId))
}

export function useCreateApiKey() {
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
