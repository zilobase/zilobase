import { useInfiniteQuery } from "@tanstack/react-query"
import type { MailViewQueryResponse } from "@zilobase/features/mail"

import { apiFetch } from "@/features/desktop/network/api"

import { mailApiBasePath } from "./mail-api-path"

export function useIndexedMailView(input: {
  bindingId: string | null | undefined
  enabled: boolean
  routeId: string
  search: string
  workspaceId: string | null | undefined
}) {
  const mailBasePath = mailApiBasePath(input.workspaceId)
  return useInfiniteQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId && input.routeId),
    getNextPageParam: (lastPage: MailViewQueryResponse) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }): Promise<MailViewQueryResponse> => apiFetch<MailViewQueryResponse>(
      `${mailBasePath}/query`,
      {
        body: JSON.stringify({
          cursor: pageParam ?? undefined,
          limit: 50,
          routeId: input.routeId,
          search: input.search || undefined,
        }),
        method: "POST",
        signal,
      },
    ),
    queryKey: [
      "mail",
      "indexed-query",
      input.workspaceId,
      input.bindingId,
      input.routeId,
      input.search,
    ],
  })
}
