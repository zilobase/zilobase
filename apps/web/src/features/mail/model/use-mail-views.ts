import { useQuery } from "@tanstack/react-query"
import type { MailViewsBootstrap } from "@zilobase/features/mail"

import { apiFetch } from "@/features/desktop/network/api"

import { mailApiBasePath } from "./mail-api-path"

export function useMailViews(input: {
  bindingId: string | null | undefined
  enabled: boolean
  workspaceId: string | null | undefined
}) {
  const mailBasePath = mailApiBasePath(input.workspaceId)
  return useQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId),
    queryFn: ({ signal }) => apiFetch<MailViewsBootstrap>(`${mailBasePath}/views`, { signal }),
    queryKey: ["mail", "views", input.workspaceId, input.bindingId],
    staleTime: 15_000,
  })
}
