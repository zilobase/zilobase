import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { useZilobaseFeatures, type ApiFetcher } from "../shared/context"
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

const aiAgentProfileQueryKey = (
  workspaceId: string | null | undefined,
  agentId: string | null,
) => [...aiAgentProfilesQueryKey(workspaceId), agentId] as const

const customAgentQueryKey = (
  workspaceId: string | null | undefined,
  agentId: string | null,
  suffix: string,
) => [...aiAgentProfileQueryKey(workspaceId, agentId), suffix] as const

const customAgentRunQueryKey = (
  workspaceId: string | null | undefined,
  agentId: string | null,
  runId: string | null,
) => [...customAgentQueryKey(workspaceId, agentId, "runs"), runId] as const

const mcpCatalogQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "mcp-catalog"] as const

const approvedMcpServersQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "mcp-approved-servers"] as const

const mcpWorkspacePolicyQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "mcp-policy"] as const

function aiAgentProfilesQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) => apiFetch<{ agents: AiAgentProfileSummary[] }>(
      "/api/ai/agents",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.agents),
    queryKey: aiAgentProfilesQueryKey(workspaceId),
    retry: false,
  })
}

function aiAgentProfileQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  agentId: string | null,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && agentId),
    queryFn: ({ signal }) => apiFetch<{ agent: AiAgentProfileDetail }>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.agent),
    queryKey: aiAgentProfileQueryKey(workspaceId, agentId),
  })
}

function customAgentRunQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  agentId: string | null,
  runId: string | null,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && agentId && runId),
    queryFn: ({ signal }) => apiFetch<{
      events: CustomAgentRunEvent[]
      run: CustomAgentRun
    }>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}/runs/${encodeURIComponent(runId!)}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ),
    queryKey: customAgentRunQueryKey(workspaceId, agentId, runId),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status
      return status && ["queued", "running", "waiting_approval"].includes(status)
        ? 1_000
        : false
    },
  })
}

function mcpCatalogQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) => apiFetch<{ catalog: McpServerCatalogEntry[] }>(
      "/api/ai/mcp/catalog",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.catalog),
    queryKey: mcpCatalogQueryKey(workspaceId),
    retry: false,
  })
}

function approvedMcpServersQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) => apiFetch<{
      approvedServers: McpApprovedServer[]
    }>(
      "/api/ai/mcp/approved-servers",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.approvedServers),
    queryKey: approvedMcpServersQueryKey(workspaceId),
    retry: false,
  })
}

function mcpWorkspacePolicyQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) => apiFetch<{
      approvedServers: McpApprovedServer[]
      policy: McpWorkspacePolicy
    }>("/api/ai/mcp/policy", workspaceRequestOptions(workspaceId, { signal })),
    queryKey: mcpWorkspacePolicyQueryKey(workspaceId),
    retry: false,
  })
}

export function useAiAgentProfiles(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    aiAgentProfilesQueryOptions(
      apiFetch,
      workspaceId,
      options?.enabled ?? true,
    ),
  )
}

export function useAiAgentProfile(agentId: string | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    aiAgentProfileQueryOptions(apiFetch, workspaceId, agentId),
  )
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
  return useQuery(
    customAgentRunQueryOptions(apiFetch, workspaceId, agentId, runId),
  )
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
  return useQuery(
    mcpCatalogQueryOptions(apiFetch, workspaceId, options?.enabled ?? true),
  )
}

export function useApprovedMcpServers(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    approvedMcpServersQueryOptions(
      apiFetch,
      workspaceId,
      options?.enabled ?? true,
    ),
  )
}

export function useMcpWorkspacePolicy(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    mcpWorkspacePolicyQueryOptions(
      apiFetch,
      workspaceId,
      options?.enabled ?? true,
    ),
  )
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
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({
        queryKey: mcpWorkspacePolicyQueryKey(workspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: approvedMcpServersQueryKey(workspaceId),
      }),
    ]),
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

const mcpConnectionsQueryKey = (
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
) => [
  "workspaces",
  workspaceId ?? "none",
  "mcp",
  ...mcpScopeQueryKey(scope),
  "connections",
] as const

const mcpActivityQueryKey = (
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
) => [
  "workspaces",
  workspaceId ?? "none",
  "mcp",
  ...mcpScopeQueryKey(scope),
  "activity",
] as const

function mcpConnectionsQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && scope),
    queryFn: ({ signal }) => apiFetch<{
      connections: McpConnectionSummary[]
    }>(
      `${mcpScopeApiPath(scope!)}/connections`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.connections),
    queryKey: mcpConnectionsQueryKey(workspaceId, scope),
  })
}

function mcpActivityQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && scope && enabled),
    queryFn: ({ signal }) => apiFetch<{ activity: McpActivityEntry[] }>(
      `${mcpScopeApiPath(scope!)}/activity`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.activity),
    queryKey: mcpActivityQueryKey(workspaceId, scope),
  })
}

function customAgentQueryOptions<TOutput>(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  agentId: string | null,
  suffix: string,
  refetchInterval?: number,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && agentId),
    queryFn: ({ signal }) => apiFetch<TOutput>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}/${suffix}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ),
    queryKey: customAgentQueryKey(workspaceId, agentId, suffix),
    refetchInterval,
  })
}

export function useMcpConnections(scope: McpConnectionScopeRef | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    mcpConnectionsQueryOptions(apiFetch, workspaceId, scope),
  )
}

export function useMcpActivity(scope: McpConnectionScopeRef | null, enabled: boolean) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    mcpActivityQueryOptions(apiFetch, workspaceId, scope, enabled),
  )
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
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({
        queryKey: mcpConnectionsQueryKey(workspaceId, scope),
      }),
      queryClient.invalidateQueries({
        queryKey: aiAgentProfilesQueryKey(workspaceId),
      }),
    ]),
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
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({
        queryKey: aiAgentProfilesQueryKey(workspaceId),
      }),
      agentId
        ? queryClient.invalidateQueries({
            queryKey: aiAgentProfileQueryKey(workspaceId, agentId),
          })
        : Promise.resolve(),
    ]),
  })
}

function useCustomAgentQuery<TOutput>(agentId: string | null, suffix: string, refetchInterval?: number) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery(
    customAgentQueryOptions<TOutput>(
      apiFetch,
      workspaceId,
      agentId,
      suffix,
      refetchInterval,
    ),
  )
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
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({
        queryKey: aiAgentProfileQueryKey(workspaceId, agentId),
      }),
      queryClient.invalidateQueries({
        queryKey: aiAgentProfilesQueryKey(workspaceId),
      }),
    ]),
  })
}
