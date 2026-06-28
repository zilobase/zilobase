import { type QueryClient, queryOptions } from "@tanstack/react-query"

import {
  ACTIVE_ORGANIZATION_MISMATCH_CODE,
  ActiveOrganizationMismatchError,
} from "../api-errors"
import type { ApiFetcher } from "../context"
import type { EmbeddedItemsOpenAs, WorkspaceMetadata } from "./item-relationships"

export type {
  EmbeddedItemsOpenAs,
  ItemRef,
  NavItemKind,
  WorkspaceMetadata,
} from "./item-relationships"
export { readLinkedItems, readParentItemId } from "./item-relationships"

export type NotelabAiMode = "instruction" | "skill"

export const notelabAiModeLabels: Record<NotelabAiMode, string> = {
  instruction: "Use as instruction",
  skill: "Use as skill",
}

export const embeddedItemsOpenAsLabels: Record<EmbeddedItemsOpenAs, string> = {
  dialog: "Dialog",
  sidepanel: "Side panel",
}

export const embeddedItemsOpenAsModes: EmbeddedItemsOpenAs[] = [
  "sidepanel",
  "dialog",
]

export type WorkspaceDatabaseView = {
  id: string
  databaseId: string
  position: number
  name: string
  type: string
  config?: unknown
  createdAt: string
  updatedAt: string
}

export type WorkspaceDatabase = {
  id: string
  organizationId: string
  pageId: string
  name: string
  config?: unknown
  isFavorite?: boolean
  views: WorkspaceDatabaseView[]
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type WorkspaceItemPlacement = {
  id: string
  organizationId: string
  parentKind: "workspace" | "database"
  parentId: string
  itemKind: "workspace" | "database"
  itemId: string
  placementKind: "primary" | "linked" | "database_row"
  sourceRowId?: string | null
  position: number
}

export type Workspace = {
  id: string
  databases?: WorkspaceDatabase[]
  isFavorite?: boolean
  isTeamspace?: boolean
  navigationPlacements?: WorkspaceItemPlacement[]
  organizationId: string
  createdById?: string | null
  type: string
  name: string
  url: string
  content?: unknown
  metadata?: WorkspaceMetadata | null
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type NotelabAiWorkspaceSummary = {
  id: string
  name: string
  organizationId: string
  updatedAt: string
  url: string
  metadata: {
    emoji?: string | null
    notelabai: NotelabAiMode | null
  }
}

export function usesUserFullWidthPreference(
  metadata: WorkspaceMetadata | null | undefined,
) {
  return metadata?.useUserFullWidthPreference !== false
}

export function resolveWorkspaceFullWidth(
  workspace: { metadata?: WorkspaceMetadata | null } | null | undefined,
  userFullWidthPreference: boolean | null | undefined,
) {
  const metadata = workspace?.metadata ?? null

  if (usesUserFullWidthPreference(metadata)) {
    return Boolean(userFullWidthPreference)
  }

  return Boolean(metadata?.fullWidth)
}

export function usesUserEmbeddedItemsPreference(
  metadata: WorkspaceMetadata | null | undefined,
) {
  return metadata?.useUserEmbeddedItemsPreference !== false
}

export function resolveEmbeddedItemsOpenAs(
  workspace: { metadata?: WorkspaceMetadata | null } | null | undefined,
  userEmbeddedItemsPreference: EmbeddedItemsOpenAs | null | undefined,
) {
  const metadata = workspace?.metadata ?? null

  if (usesUserEmbeddedItemsPreference(metadata)) {
    return userEmbeddedItemsPreference ?? "sidepanel"
  }

  return metadata?.embeddedItemsOpenAs ?? "sidepanel"
}

export type WorkspaceProperty = {
  id: string
  organizationId: string
  name: string
  type: string
  config?: unknown
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type WorkspacePropertyValue = {
  id: string
  workspaceId: string
  propertyId: string
  value: unknown
  createdAt: string
  updatedAt: string
}

export type WorkspacePropertiesPayload = {
  properties: WorkspaceProperty[]
  values: WorkspacePropertyValue[]
}

export type CommentAuthor = {
  email: string
  id: string
  image?: string | null
  name: string
}

export type WorkspaceCommentThread = {
  id: string
  organizationId: string
  workspaceId: string
  createdById?: string | null
  resolvedAt?: string | null
  resolvedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  lastActivityAt: string
}

export type WorkspaceCommentReaction = {
  count: number
  emoji: string
  reactedByMe: boolean
}

export type WorkspaceCommentMessage = {
  id: string
  threadId: string
  authorId?: string | null
  author?: CommentAuthor | null
  body: string
  editedAt?: string | null
  reactions: WorkspaceCommentReaction[]
  createdAt: string
  updatedAt: string
}

export type WorkspaceCommentsPayload = {
  comments: WorkspaceCommentMessage[]
  thread: WorkspaceCommentThread | null
}

export type WorkspaceThreadsPayload = {
  threads: WorkspaceCommentsPayload[]
}

export type AccessLevel = "view" | "edit" | "full"

export type AccessTargetType = "public" | "user" | "team"

export type WorkspaceAccessRule = {
  id: string
  organizationId: string
  workspaceId: string
  targetType: AccessTargetType
  targetId: string
  accessLevel: AccessLevel
  createdAt: string
  updatedAt: string
}

export type WorkspaceAccessPayload = {
  access: WorkspaceAccessRule[]
}

export type WorkspaceAccessTargetMember = {
  email: string
  id: string
  memberId: string
  name: string
  role: string
}

export type WorkspaceAccessTargetTeam = {
  id: string
  name: string
}

export type WorkspaceAccessTargetsPayload = {
  members: WorkspaceAccessTargetMember[]
  teams: WorkspaceAccessTargetTeam[]
}

export type WorkspacePersonAccessTargetsPayload = {
  members: WorkspaceAccessTargetMember[]
}

export const workspacesQueryKey = (organizationId: string | null | undefined) =>
  ["workspaces", organizationId ?? "none", "nav"] as const

export const notelabAiWorkspacesQueryKey = (
  organizationId: string | null | undefined,
) => ["workspaces", "notelab-ai", organizationId ?? "none"] as const

export const workspaceQueryKey = (workspaceId: string | null | undefined) =>
  ["workspace", workspaceId ?? "none"] as const

export type WorkspaceDetail = {
  accessLevel?: AccessLevel | null
  workspace: Workspace
}

export function getWorkspaceFromDetail(
  detail: WorkspaceDetail | Workspace | null | undefined,
) {
  if (!detail || typeof detail !== "object") {
    return null
  }

  if ("workspace" in detail) {
    return detail.workspace
  }

  return detail as Workspace
}

export const workspacePropertiesQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace-properties", workspaceId ?? "none"] as const

export const workspaceCommentsQueryKey = (
  workspaceId: string | null | undefined,
  threadId?: string | null,
) => ["workspace-comments", workspaceId ?? "none", threadId ?? "active"] as const

export const workspaceThreadsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace-threads", workspaceId ?? "none"] as const

export const workspaceAccessQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace-access", workspaceId ?? "none"] as const

export const workspaceAccessTargetsQueryKey = (
  organizationId: string | null | undefined,
) => ["workspace-access-targets", organizationId ?? "none"] as const

export const workspacePersonAccessTargetsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace-person-access-targets", workspaceId ?? "none"] as const

export const workspacesQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspacesQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return []
      }

      try {
        const result = await apiFetch<{
          placements?: WorkspaceItemPlacement[]
          workspaces: Workspace[]
        }>(
          `/workspaces?organizationId=${encodeURIComponent(organizationId)}&fields=nav`,
          { method: "GET" },
        )

        return result.workspaces.map((workspace) => ({
          ...workspace,
          navigationPlacements: result.placements ?? [],
        }))
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return []
        }

        throw error
      }
    },
  })

export const notelabAiWorkspacesQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: notelabAiWorkspacesQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return []
      }

      try {
        const params = new URLSearchParams({
          fields: "summary",
          notelabai: "instruction,skill",
          organizationId,
        })
        const result = await apiFetch<{ workspaces: NotelabAiWorkspaceSummary[] }>(
          `/workspaces?${params.toString()}`,
          { method: "GET" },
        )

        return result.workspaces
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return []
        }

        throw error
      }
    },
  })

export const workspaceQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    queryFn: async (): Promise<WorkspaceDetail | null> => {
      if (!workspaceId) {
        throw new Error("workspaceId is required")
      }

      try {
        const result = await apiFetch<{
          accessLevel?: AccessLevel
          workspace: Workspace
        }>(
          `/workspaces/${workspaceId}`,
          { method: "GET" },
        )

        return {
          accessLevel: result.accessLevel ?? null,
          workspace: result.workspace,
        }
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 409 &&
          "body" in error &&
          error.body &&
          typeof error.body === "object" &&
          "code" in error.body &&
          error.body.code === ACTIVE_ORGANIZATION_MISMATCH_CODE &&
          "organizationId" in error.body &&
          typeof error.body.organizationId === "string"
        ) {
          const mismatchBody = error.body as {
            error?: unknown
            organizationId: string
          }
          const message =
            typeof mismatchBody.error === "string"
              ? mismatchBody.error
              : undefined

          throw new ActiveOrganizationMismatchError(
            mismatchBody.organizationId,
            message,
          )
        }

        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error.status === 401 ||
            error.status === 403 ||
            error.status === 404)
        ) {
          return null
        }

        throw error
      }
    },
  })

export async function ensureWorkspaceDetail(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  workspaceId: string,
) {
  return queryClient.ensureQueryData(
    workspaceQueryOptions(apiFetch, workspaceId),
  )
}

export const workspaceAccessQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceAccessQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        return { access: [] }
      }

      try {
        return await apiFetch<WorkspaceAccessPayload>(
          `/workspaces/${workspaceId}/access`,
          { method: "GET" },
        )
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 403
        ) {
          return { access: [] }
        }

        throw error
      }
    },
  })

export const workspaceAccessTargetsQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceAccessTargetsQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return { members: [], teams: [] }
      }

      return apiFetch<WorkspaceAccessTargetsPayload>(
        `/organizations/${organizationId}/access-targets`,
        { method: "GET" },
      )
    },
  })

export const workspacePersonAccessTargetsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspacePersonAccessTargetsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        return { members: [] }
      }

      return apiFetch<WorkspacePersonAccessTargetsPayload>(
        `/workspaces/${workspaceId}/access-targets`,
        { method: "GET" },
      )
    },
  })



export const workspacePropertiesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspacePropertiesQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error("workspaceId is required")
      }

      return apiFetch<WorkspacePropertiesPayload>(
        `/workspaces/${workspaceId}/properties`,
        { method: "GET" },
      )
    },
  })

export const workspaceCommentsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  threadId?: string | null,
  enabled = true,
) =>
  queryOptions({
    queryKey: workspaceCommentsQueryKey(workspaceId, threadId),
    enabled: Boolean(workspaceId) && enabled,
    queryFn: async () => {
      if (!workspaceId) {
        return { comments: [], thread: null }
      }

      const url = threadId
        ? `/workspaces/${workspaceId}/comments?threadId=${encodeURIComponent(threadId)}`
        : `/workspaces/${workspaceId}/comments`

      return apiFetch<WorkspaceCommentsPayload>(url, { method: "GET" })
    },
  })

export const workspaceThreadsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled = true,
) =>
  queryOptions({
    queryKey: workspaceThreadsQueryKey(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    queryFn: async () => {
      if (!workspaceId) {
        return { threads: [] }
      }

      return apiFetch<WorkspaceThreadsPayload>(
        `/workspaces/${workspaceId}/threads`,
        { method: "GET" },
      )
    },
  })

export function getWorkspaceEmoji(workspace: Pick<Workspace, "metadata">) {
  return workspace.metadata?.emoji ?? null
}

export function getWorkspaceCover(workspace: Pick<Workspace, "metadata">) {
  return workspace.metadata?.cover ?? null
}
