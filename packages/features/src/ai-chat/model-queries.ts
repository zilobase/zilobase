import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/context"
import { workspaceRequestOptions } from "../workspaces/queries"

export type WorkspaceAiChatModel = {
  chef: string
  chefSlug: string
  description?: string
  gatewayId: string
  id: string
  name: string
  providers: string[]
}

export type WorkspaceAiModelsResponse = {
  models: WorkspaceAiChatModel[]
}

export const aiModelsQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-models"] as const

export const aiModelsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiModelsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) =>
      apiFetch<WorkspaceAiModelsResponse>(
        "/api/workspace/settings/ai/models",
        workspaceRequestOptions(workspaceId, { signal }),
      ),
  })
