import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import { useActiveWorkspaceId } from "../workspaces/hooks"
import { workspaceRequestOptions } from "../workspaces/queries"
import type {
  AiAgentProfileDetail,
  AiAgentProfileSummary,
  McpActivityEntry,
  McpApprovedServer,
  McpConnectionSummary,
  McpConnectionScopeRef,
  McpServerCatalogEntry,
  McpWorkspacePolicy,
} from "./mcp-contract"
import type {
  CustomAgentConversationMessage,
  CustomAgentResourceAccess,
  CustomAgentRevision,
  CustomAgentRun,
  CustomAgentRunEvent,
  CustomAgentTrigger,
} from "./custom-agent-contract"

export const aiAgentProfilesQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-agent-profiles"] as const

export function useAiAgentProfiles(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: aiAgentProfilesQueryKey(workspaceId),
    queryFn: ({ signal }) => apiFetch<{ agents: AiAgentProfileSummary[] }>(
      "/api/ai/agents",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.agents),
    retry: false,
  })
}

export function useAiAgentProfile(agentId: string | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && agentId),
    queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId],
    queryFn: ({ signal }) => apiFetch<{ agent: AiAgentProfileDetail }>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.agent),
  })
}

export function useCreateAiAgentProfile() {
  return useAgentMutation<{
    name: string
    description?: string
    instructions?: string
    defaultModel?: string
    icon?: unknown
    cover?: string | null
    iconPosition?: "inline" | "top"
  }, { agent: AiAgentProfileDetail }>(
    () => "/api/ai/agents",
    "POST",
  )
}

export function useUpdateAiAgentProfile(agentId: string | null) {
  return useAgentMutation<Partial<Pick<AiAgentProfileDetail, "name" | "description" | "instructions" | "defaultModel" | "icon" | "cover" | "iconPosition">>, { agent: AiAgentProfileDetail }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}`,
    "PATCH",
    agentId,
  )
}

export function useReplaceAiAgentProfileAccess(agentId: string | null) {
  return useAgentMutation<{
    grants: Array<{
      principalId: string
      principalType: "user" | "team"
      role: "editor" | "user"
    }>
  }, { agent: AiAgentProfileDetail }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}/access`,
    "PUT",
    agentId,
  )
}

export function useTransferAiAgentProfile(agentId: string | null) {
  return useAgentMutation<{ newOwnerUserId: string }, { agent: AiAgentProfileDetail }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}/transfer`,
    "POST",
    agentId,
  )
}

export function useArchiveAiAgentProfile(agentId: string | null) {
  return useAgentMutation<Record<string, never>, { result: {
    archived: boolean
  } }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}/archive`,
    "POST",
    agentId,
  )
}

export function useCustomAgentConversation(agentId: string | null) {
  return useCustomAgentQuery<{ messages: CustomAgentConversationMessage[] }>(agentId, "conversation", 1_500)
}

export function useCustomAgentRevisions(agentId: string | null) {
  return useCustomAgentQuery<{ revisions: CustomAgentRevision[] }>(agentId, "revisions")
}

export function useCustomAgentResources(agentId: string | null) {
  return useCustomAgentQuery<{ resources: CustomAgentResourceAccess[] }>(agentId, "resources")
}

export function useCustomAgentTriggers(agentId: string | null) {
  return useCustomAgentQuery<{ triggers: CustomAgentTrigger[] }>(agentId, "triggers")
}

export function useCustomAgentRuns(agentId: string | null) {
  return useCustomAgentQuery<{ runs: CustomAgentRun[] }>(agentId, "runs", 2_000)
}

export function useStartCustomAgentRun(agentId: string | null) {
  return useStandaloneAgentMutation<{ prompt?: string }, { run: CustomAgentRun }>(
    agentId,
    "runs",
    "POST",
  )
}

export function useCustomAgentRun(agentId: string | null, runId: string | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && agentId && runId),
    queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId, "runs", runId],
    queryFn: ({ signal }) => apiFetch<{ run: CustomAgentRun; events: CustomAgentRunEvent[] }>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}/runs/${encodeURIComponent(runId!)}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status
      return status && ["queued", "running", "waiting_approval"].includes(status) ? 1_000 : false
    },
  })
}

export function useSubmitCustomAgentMessage(agentId: string | null) {
  return useStandaloneAgentMutation<{
    clientId?: string
    message: string
  }, {
    intent: string
    message: CustomAgentConversationMessage
    revision: CustomAgentRevision | null
    run: CustomAgentRun | null
  }>(agentId, "conversation/messages", "POST")
}

export function useGrantCustomAgentResource(agentId: string | null) {
  return useStandaloneAgentMutation<{
    accessLevel: "view" | "comment" | "edit"
    resourceId: string
    resourceType: "page" | "database"
  }, { resources: CustomAgentResourceAccess[] }>(agentId, "resources", "PUT")
}

export function useRemoveCustomAgentResource(agentId: string | null) {
  return useStandaloneAgentMutation<{
    resourceId: string
    resourceType: "page" | "database"
  }, { resources: CustomAgentResourceAccess[] }>(
    agentId,
    (input) => `resources/${encodeURIComponent(input.resourceId)}?resourceType=${encodeURIComponent(input.resourceType)}`,
    "DELETE",
  )
}

export function useCreateCustomAgentTrigger(agentId: string | null) {
  return useStandaloneAgentMutation<{
    config: Record<string, unknown>
    kind: CustomAgentTrigger["kind"]
    label: string
    status?: CustomAgentTrigger["status"]
  }, { triggers: CustomAgentTrigger[] }>(agentId, "triggers", "POST")
}

export function useUpdateCustomAgentTrigger(agentId: string | null) {
  return useStandaloneAgentMutation<{
    config: Record<string, unknown>
    kind: CustomAgentTrigger["kind"]
    label: string
    status?: CustomAgentTrigger["status"]
    triggerId: string
  }, { triggers: CustomAgentTrigger[] }>(
    agentId,
    (input) => `triggers/${encodeURIComponent(input.triggerId)}`,
    "PUT",
  )
}

export function useRemoveCustomAgentTrigger(agentId: string | null) {
  return useStandaloneAgentMutation<{ triggerId: string }, { triggers: CustomAgentTrigger[] }>(
    agentId,
    (input) => `triggers/${encodeURIComponent(input.triggerId)}`,
    "DELETE",
  )
}

export function useRotateCustomAgentWebhookSecret(agentId: string | null) {
  return useStandaloneAgentMutation<{ triggerId: string }, { secret: string }>(
    agentId,
    (input) => `triggers/${encodeURIComponent(input.triggerId)}/rotate-secret`,
    "POST",
  )
}

export function useRevertCustomAgentRevision(agentId: string | null) {
  return useStandaloneAgentMutation<{ revisionId: string }, { revision: CustomAgentRevision }>(
    agentId,
    (input) => `revisions/${encodeURIComponent(input.revisionId)}/revert`,
    "POST",
  )
}

export function useMcpCatalog(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp-catalog"],
    queryFn: ({ signal }) => apiFetch<{ catalog: McpServerCatalogEntry[] }>(
      "/api/ai/mcp/catalog",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.catalog),
    retry: false,
  })
}

export function useApprovedMcpServers(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp-approved-servers"],
    queryFn: ({ signal }) => apiFetch<{ approvedServers: McpApprovedServer[] }>(
      "/api/ai/mcp/approved-servers",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.approvedServers),
    retry: false,
  })
}

export function useMcpWorkspacePolicy(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp-policy"],
    queryFn: ({ signal }) => apiFetch<{
      approvedServers: McpApprovedServer[]
      policy: McpWorkspacePolicy
    }>("/api/ai/mcp/policy", workspaceRequestOptions(workspaceId, { signal })),
    retry: false,
  })
}

export function useMcpPolicyMutation<TInput extends object, TOutput>(
  path: (input: TInput) => string,
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => apiFetch<TOutput>(path(input), {
      body: method === "DELETE" ? undefined : JSON.stringify(input),
      headers: {
        ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
        ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
      },
      method,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceId ?? "none", "mcp-policy"] })
      void queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceId ?? "none", "mcp-approved-servers"] })
    },
  })
}

export function mcpScopeApiPath(scope: McpConnectionScopeRef) {
  return scope.type === "agent"
    ? `/api/ai/agents/${encodeURIComponent(scope.agentProfileId)}`
    : "/api/ai/mcp"
}

function mcpScopeQueryKey(scope: McpConnectionScopeRef | null) {
  return scope?.type === "agent"
    ? ["agent", scope.agentProfileId]
    : ["personal"]
}

export function useMcpConnections(scope: McpConnectionScopeRef | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && scope),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "connections"],
    queryFn: ({ signal }) => apiFetch<{ connections: McpConnectionSummary[] }>(
      `${mcpScopeApiPath(scope!)}/connections`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.connections),
  })
}

export function useMcpActivity(scope: McpConnectionScopeRef | null, enabled: boolean) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && scope && enabled),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "activity"],
    queryFn: ({ signal }) => apiFetch<{ activity: McpActivityEntry[] }>(
      `${mcpScopeApiPath(scope!)}/activity`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.activity),
  })
}

export function useMcpConnectionMutation<TInput extends object, TOutput>(
  scope: McpConnectionScopeRef | null,
  path: (input: TInput) => string,
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => apiFetch<TOutput>(path(input), {
      body: method === "DELETE" ? undefined : JSON.stringify(input),
      headers: {
        ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
        ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
      },
      method,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "connections"],
      })
      void queryClient.invalidateQueries({ queryKey: aiAgentProfilesQueryKey(workspaceId) })
    },
  })
}

function useAgentMutation<TInput extends object, TOutput>(
  path: (input: TInput) => string,
  method: "POST" | "PATCH" | "PUT",
  agentId?: string | null,
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => apiFetch<TOutput>(path(input), {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
        ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
      },
      method,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiAgentProfilesQueryKey(workspaceId) })
      if (agentId) void queryClient.invalidateQueries({
        queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId],
      })
    },
  })
}

function useCustomAgentQuery<TOutput>(agentId: string | null, suffix: string, refetchInterval?: number) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && agentId),
    queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId, suffix],
    queryFn: ({ signal }) => apiFetch<TOutput>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}/${suffix}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ),
    refetchInterval,
  })
}

function useStandaloneAgentMutation<TInput extends object, TOutput>(
  agentId: string | null,
  suffix: string | ((input: TInput) => string),
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => {
      const resolved = typeof suffix === "function" ? suffix(input) : suffix
      return apiFetch<TOutput>(`/api/ai/agents/${encodeURIComponent(agentId!)}/${resolved}`, {
        body: method === "DELETE" ? undefined : JSON.stringify(input),
        headers: {
          ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
          ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
        },
        method,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId] })
      void queryClient.invalidateQueries({ queryKey: aiAgentProfilesQueryKey(workspaceId) })
    },
  })
}
