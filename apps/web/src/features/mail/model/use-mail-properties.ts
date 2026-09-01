import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  MailPropertiesBootstrap,
  MailPropertyDefinition,
  MailPropertyWriteInput,
  MailThreadPropertyValue,
  MailThreadPropertyValuesResponse,
} from "@zilobase/features/mail"

import { apiFetch } from "@/features/desktop/network/api"
import { mailApiBasePath } from "./mail-api-path"

export function useMailProperties(input: {
  bindingId: string | null | undefined
  enabled: boolean
  workspaceId: string | null | undefined
}) {
  const queryClient = useQueryClient()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = ["mail", "properties", input.workspaceId, input.bindingId] as const
  const query = useQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId),
    queryFn: ({ signal }) => apiFetch<MailPropertiesBootstrap>(`${basePath}/properties`, { signal }),
    queryKey,
  })
  const create = useMutation({
    mutationFn: (value: MailPropertyWriteInput) => apiFetch<{ property: MailPropertyDefinition }>(`${basePath}/properties`, { body: JSON.stringify(value), method: "POST" }),
    onSuccess: ({ property }) => queryClient.setQueryData<MailPropertiesBootstrap>(queryKey, (current) => current ? { ...current, properties: [...current.properties, property] } : current),
  })
  const update = useMutation({
    mutationFn: ({ propertyId, value }: { propertyId: string; value: MailPropertyWriteInput }) => apiFetch<{ property: MailPropertyDefinition }>(`${basePath}/properties/${encodeURIComponent(propertyId)}`, { body: JSON.stringify(value), method: "PATCH" }),
    onSuccess: ({ property }) => queryClient.setQueryData<MailPropertiesBootstrap>(queryKey, (current) => current ? { ...current, properties: current.properties.map((item) => item.id === property.id ? property : item) } : current),
  })
  const remove = useMutation({
    mutationFn: (propertyId: string) => apiFetch<{ success: true }>(`${basePath}/properties/${encodeURIComponent(propertyId)}`, { method: "DELETE" }).then(() => propertyId),
    onSuccess: (propertyId) => queryClient.setQueryData<MailPropertiesBootstrap>(queryKey, (current) => current ? { ...current, properties: current.properties.filter((item) => item.id !== propertyId) } : current),
  })
  const setThreadValue = useMutation({
    mutationFn: ({ propertyId, threadId, value }: { propertyId: string; threadId: string; value: MailThreadPropertyValue["value"] }) => apiFetch<{ value: MailThreadPropertyValue }>(`${basePath}/threads/${encodeURIComponent(threadId)}/properties/${encodeURIComponent(propertyId)}`, {
      body: JSON.stringify({ value }),
      method: "PUT",
    }),
    onSuccess: ({ value }, variables) => {
      queryClient.setQueryData<MailThreadPropertyValuesResponse>(["mail", "thread-properties", input.workspaceId, input.bindingId, variables.threadId], (current) => ({
        values: [...current?.values.filter((item) => item.propertyId !== value.propertyId) ?? [], value],
      }))
      void queryClient.invalidateQueries({ queryKey: ["mail", "indexed-query", input.workspaceId, input.bindingId] })
      void queryClient.invalidateQueries({ queryKey: ["mail", "groups", input.workspaceId, input.bindingId] })
    },
  })
  return {
    ...query,
    createProperty: create.mutateAsync,
    deleteProperty: remove.mutateAsync,
    mutating: create.isPending || update.isPending || remove.isPending || setThreadValue.isPending,
    setThreadValue: setThreadValue.mutateAsync,
    updateProperty: update.mutateAsync,
  }
}

export function useMailThreadProperties(input: {
  bindingId: string | null | undefined
  enabled: boolean
  threadId: string | null
  workspaceId: string | null | undefined
}) {
  const queryClient = useQueryClient()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = ["mail", "thread-properties", input.workspaceId, input.bindingId, input.threadId] as const
  const query = useQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId && input.threadId),
    queryFn: ({ signal }) => apiFetch<MailThreadPropertyValuesResponse>(`${basePath}/threads/${encodeURIComponent(input.threadId!)}/properties`, { signal }),
    queryKey,
  })
  const mutation = useMutation({
    mutationFn: ({ propertyId, value }: { propertyId: string; value: MailThreadPropertyValue["value"] }) => apiFetch<{ value: MailThreadPropertyValue }>(`${basePath}/threads/${encodeURIComponent(input.threadId!)}/properties/${encodeURIComponent(propertyId)}`, {
      body: JSON.stringify({ value }),
      method: "PUT",
    }),
    onSuccess: ({ value }) => {
      queryClient.setQueryData<MailThreadPropertyValuesResponse>(queryKey, (current) => ({
        values: [...current?.values.filter((item) => item.propertyId !== value.propertyId) ?? [], value],
      }))
      void queryClient.invalidateQueries({ queryKey: ["mail", "indexed-query", input.workspaceId, input.bindingId] })
      void queryClient.invalidateQueries({ queryKey: ["mail", "groups", input.workspaceId, input.bindingId] })
    },
  })
  return { ...query, setValue: mutation.mutateAsync, setting: mutation.isPending }
}
