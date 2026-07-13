import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import {
  type PageLayoutConfig,
  type PageLayoutScope,
  type PageLayoutTarget,
  type ResolvedPageLayout,
} from "./page-layouts"

export const pageLayoutKeys = {
  all: ["page-layouts"] as const,
  resolved: (target: PageLayoutTarget) => [
    "page-layouts",
    "resolved",
    target.pageId ?? "none",
    target.databaseId ?? "none",
  ] as const,
  scope: (scope: PageLayoutScope, scopeId: string) => [
    "page-layouts",
    "scope",
    scope,
    scopeId,
  ] as const,
}

export function useResolvedPageLayout(target: PageLayoutTarget) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery({
    queryKey: pageLayoutKeys.resolved(target),
    enabled: Boolean(target.pageId || target.databaseId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      if (target.pageId) params.set("pageId", target.pageId)
      if (target.databaseId) params.set("databaseId", target.databaseId)
      return apiFetch<ResolvedPageLayout>(`/page-layouts/resolve?${params}`, { signal })
    },
    staleTime: 30_000,
  })
}

export function useSavePageLayout() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: {
      config: PageLayoutConfig
      scope: PageLayoutScope
      scopeId: string
    }) => apiFetch(`/page-layouts/${input.scope}/${encodeURIComponent(input.scopeId)}`, {
      method: "PUT",
      body: JSON.stringify({ config: input.config }),
    }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: pageLayoutKeys.all })
      const previous = queryClient.getQueriesData({ queryKey: pageLayoutKeys.all })
      queryClient.setQueryData(pageLayoutKeys.scope(input.scope, input.scopeId), input.config)
      return { previous }
    },
    onError: (_error, _input, context) => {
      for (const [key, value] of context?.previous ?? []) {
        queryClient.setQueryData(key, value)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pageLayoutKeys.all }),
  })
}

export function useResetPageLayout() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: { scope: PageLayoutScope; scopeId: string }) =>
      apiFetch(`/page-layouts/${input.scope}/${encodeURIComponent(input.scopeId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pageLayoutKeys.all }),
  })
}
