import { useEffect } from "react"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import type {
  MailFilterExpression,
  MailPersistedView,
  MailPropertiesBootstrap,
  MailPropertyDefinition,
  MailPropertyWriteInput,
  MailReminder,
  MailThreadPropertyValue,
  MailThreadPropertyValuesResponse,
  MailViewCreateInput,
  MailViewsBootstrap,
  MailViewUpdateInput,
} from "./organization"
import {
  indexedMailViewQueryOptions,
  invalidateMailListQueries,
  mailApiBasePath,
  mailGroupsQueryOptions,
  mailKeys,
  mailPropertiesQueryOptions,
  mailRemindersQueryOptions,
  mailThreadPropertiesQueryOptions,
  mailViewsQueryOptions,
} from "./queries"

type MailHookScope = {
  bindingId: string | null | undefined
  enabled: boolean
  workspaceId: string | null | undefined
}

export function useMailViews(input: MailHookScope) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = mailKeys.views(input)
  const options = mailViewsQueryOptions(apiFetch, input)
  const query = useQuery({ ...options, enabled: input.enabled && options.enabled })
  const updateMutation = useMutation({
    mutationFn: ({ value, viewId }: { value: MailViewUpdateInput; viewId: string }) => apiFetch<{ view: MailPersistedView }>(`${basePath}/views/${encodeURIComponent(viewId)}`, {
      body: JSON.stringify(value),
      method: "PATCH",
    }),
    onSuccess: ({ view }) => queryClient.setQueryData<MailViewsBootstrap>(queryKey, (current) => current ? {
      ...current,
      views: current.views.map((item) => item.id === view.id ? view : item),
    } : current),
  })
  const createMutation = useMutation({
    mutationFn: (value: MailViewCreateInput) => apiFetch<{ view: MailPersistedView }>(`${basePath}/views`, {
      body: JSON.stringify(value),
      method: "POST",
    }),
    onSuccess: ({ view }) => queryClient.setQueryData<MailViewsBootstrap>(queryKey, (current) => current ? {
      ...current,
      views: [...current.views, view],
    } : current),
  })

  return {
    ...query,
    createView: createMutation.mutateAsync,
    savingView: createMutation.isPending || updateMutation.isPending,
    updateView: updateMutation.mutateAsync,
  }
}

export function useMailProperties(input: MailHookScope) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = mailKeys.properties(input)
  const options = mailPropertiesQueryOptions(apiFetch, input)
  const query = useQuery({ ...options, enabled: input.enabled && options.enabled })
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
      queryClient.setQueryData<MailThreadPropertyValuesResponse>(mailKeys.threadProperties(input, variables.threadId), (current) => ({
        values: [...current?.values.filter((item) => item.propertyId !== value.propertyId) ?? [], value],
      }))
      void invalidateMailListQueries(queryClient, input)
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

export function useMailThreadProperties(input: MailHookScope & { threadId: string | null }) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = mailKeys.threadProperties(input, input.threadId)
  const options = mailThreadPropertiesQueryOptions(apiFetch, input)
  const query = useQuery({ ...options, enabled: input.enabled && options.enabled })
  const mutation = useMutation({
    mutationFn: ({ propertyId, value }: { propertyId: string; value: MailThreadPropertyValue["value"] }) => apiFetch<{ value: MailThreadPropertyValue }>(`${basePath}/threads/${encodeURIComponent(input.threadId!)}/properties/${encodeURIComponent(propertyId)}`, {
      body: JSON.stringify({ value }),
      method: "PUT",
    }),
    onSuccess: ({ value }) => {
      queryClient.setQueryData<MailThreadPropertyValuesResponse>(queryKey, (current) => ({
        values: [...current?.values.filter((item) => item.propertyId !== value.propertyId) ?? [], value],
      }))
      void invalidateMailListQueries(queryClient, input)
    },
  })
  return { ...query, setValue: mutation.mutateAsync, setting: mutation.isPending }
}

export function useMailReminders(input: MailHookScope) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = mailKeys.reminders(input)
  const options = mailRemindersQueryOptions(apiFetch, input)
  const query = useQuery({ ...options, enabled: input.enabled && options.enabled })
  const refreshMail = () => void invalidateMailListQueries(queryClient, input)
  const schedule = useMutation({
    mutationFn: ({ remindAt, threadId }: { remindAt: string; threadId: string }) => apiFetch<{ reminder: MailReminder }>(`${basePath}/threads/${encodeURIComponent(threadId)}/remind`, { body: JSON.stringify({ remindAt }), method: "POST" }),
    onSuccess: ({ reminder }) => {
      queryClient.setQueryData<{ reminders: MailReminder[] }>(queryKey, (current) => ({ reminders: [...current?.reminders.filter((item) => item.threadId !== reminder.threadId) ?? [], reminder] }))
      refreshMail()
    },
  })
  const cancel = useMutation({
    mutationFn: (reminderId: string) => apiFetch<{ success: true }>(`${basePath}/reminders/${encodeURIComponent(reminderId)}`, { method: "DELETE" }).then(() => reminderId),
    onSuccess: (reminderId) => queryClient.setQueryData<{ reminders: MailReminder[] }>(queryKey, (current) => ({ reminders: current?.reminders.filter((item) => item.id !== reminderId) ?? [] })),
  })
  const advance = useMutation({
    mutationFn: () => apiFetch<{ fired: MailReminder[] }>(`${basePath}/reminders/advance`, { body: "{}", method: "POST" }),
    onSuccess: () => { void query.refetch(); refreshMail() },
  })
  const nextReminderAt = query.data?.reminders.reduce<number | null>((next, reminder) => {
    const value = new Date(reminder.remindAt).getTime()
    return next === null || value < next ? value : next
  }, null) ?? null
  useEffect(() => {
    if (nextReminderAt === null) return
    const timer = window.setTimeout(() => advance.mutate(), Math.max(0, Math.min(2_147_483_647, nextReminderAt - Date.now() + 250)))
    return () => window.clearTimeout(timer)
  }, [advance, nextReminderAt])
  return { ...query, cancel: cancel.mutateAsync, schedule: schedule.mutateAsync, working: schedule.isPending || cancel.isPending || advance.isPending }
}

export function useMailGroups(input: MailHookScope & {
  filter?: MailFilterExpression
  routeId: string
  search: string
}) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(mailGroupsQueryOptions(apiFetch, input))
}

export function useIndexedMailView(input: MailHookScope & {
  filter?: MailFilterExpression
  groupKey?: string
  routeId: string
  search: string
}) {
  const { apiFetch } = useZilobaseFeatures()
  return useInfiniteQuery(indexedMailViewQueryOptions(apiFetch, input))
}
