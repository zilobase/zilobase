import { useQuery } from "@tanstack/react-query"
import type { MailFilterExpression, MailViewGroupsResponse } from "@zilobase/features/mail"

import { apiFetch } from "@/features/desktop/network/api"
import { mailApiBasePath } from "./mail-api-path"

export function useMailGroups(input: {
  bindingId: string | null | undefined
  enabled: boolean
  filter?: MailFilterExpression
  routeId: string
  search: string
  workspaceId: string | null | undefined
}) {
  const mailBasePath = mailApiBasePath(input.workspaceId)
  return useQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId && input.routeId),
    queryFn: ({ signal }) => apiFetch<MailViewGroupsResponse>(`${mailBasePath}/query/groups`, {
      body: JSON.stringify({
        filter: input.filter,
        routeId: input.routeId,
        search: input.search || undefined,
      }),
      method: "POST",
      signal,
    }),
    queryKey: ["mail", "groups", input.workspaceId, input.bindingId, input.routeId, input.search, input.filter],
  })
}
