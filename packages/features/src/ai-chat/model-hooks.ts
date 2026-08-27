import { useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../context"
import { useActiveWorkspaceId } from "../workspaces/hooks"
import { aiModelsQueryOptions } from "./model-queries"

export function useWorkspaceAiModels() {
  const { apiFetch } = useZilobaseFeatures()

  return useQuery(aiModelsQueryOptions(apiFetch, useActiveWorkspaceId()))
}
