import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MailPersistedView, MailViewCreateInput, MailViewsBootstrap, MailViewUpdateInput } from "@zilobase/features/mail"

import { apiFetch } from "@/features/desktop/network/api"

import { mailApiBasePath } from "./mail-api-path"

export function useMailViews(input: {
  bindingId: string | null | undefined
  enabled: boolean
  workspaceId: string | null | undefined
}) {
  const queryClient = useQueryClient()
  const mailBasePath = mailApiBasePath(input.workspaceId)
  const queryKey = ["mail", "views", input.workspaceId, input.bindingId] as const
  const query = useQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId),
    queryFn: ({ signal }) => apiFetch<MailViewsBootstrap>(`${mailBasePath}/views`, { signal }),
    queryKey,
    staleTime: 15_000,
  })
  const updateMutation = useMutation({
    mutationFn: ({ value, viewId }: { value: MailViewUpdateInput; viewId: string }) => apiFetch<{ view: MailPersistedView }>(`${mailBasePath}/views/${encodeURIComponent(viewId)}`, {
      body: JSON.stringify(value),
      method: "PATCH",
    }),
    onSuccess: ({ view }) => queryClient.setQueryData<MailViewsBootstrap>(queryKey, (current) => current ? {
      ...current,
      views: current.views.map((item) => item.id === view.id ? view : item),
    } : current),
  })
  const createMutation = useMutation({
    mutationFn: (value: MailViewCreateInput) => apiFetch<{ view: MailPersistedView }>(`${mailBasePath}/views`, {
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
