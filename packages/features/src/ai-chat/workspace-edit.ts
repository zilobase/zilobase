export const WORKSPACE_EDIT_SNAPSHOT_PART_TYPE = "workspace-edit-snapshot" as const

export const PROPOSE_PAGE_CONTENT_UPDATE_TOOL = "proposePageContentUpdate" as const

export type WorkspaceEditSnapshotStatus =
  | "applied"
  | "declined"
  | "failed"
  | "preview"
  | "undone"

export type WorkspaceEditSnapshotPart = {
  type: typeof WORKSPACE_EDIT_SNAPSHOT_PART_TYPE
  toolCallId: string
  parentMessageId: string
  workspaceId: string
  summary: string
  afterContentJson?: unknown
  beforeMarkdown: string
  afterMarkdown: string
  beforeContentJson: unknown
  status: WorkspaceEditSnapshotStatus
  appliedAt: string
  undoneAt?: string
  errorMessage?: string
}

import type { PageEditMode } from "./apply-page-content-patch"

export type { PageEditMode }

export type ProposePageContentUpdateOutput = {
  editId: string
  workspaceId: string
  summary: string
  editMode: PageEditMode
  afterMarkdown?: string
  searchText?: string
  replaceText?: string
}

type MessageWithParts = {
  id: string
  role: string
  parts: Array<{ type: string } & Record<string, unknown>>
}

export function isWorkspaceEditSnapshotPart(
  part: { type: string } & Record<string, unknown>,
): part is WorkspaceEditSnapshotPart {
  return part.type === WORKSPACE_EDIT_SNAPSHOT_PART_TYPE
}

export function isWorkspaceEditSnapshotMessage(
  message: MessageWithParts,
): message is MessageWithParts & { role: "data" } {
  return (
    message.role === "data" &&
    message.parts.some((part) => part.type === WORKSPACE_EDIT_SNAPSHOT_PART_TYPE)
  )
}

export function isProposePageContentUpdateToolName(toolName: string) {
  return toolName === PROPOSE_PAGE_CONTENT_UPDATE_TOOL
}

export function buildWorkspaceEditSnapshotMap(
  messages: readonly MessageWithParts[],
) {
  const map = new Map<string, WorkspaceEditSnapshotPart>()

  for (const message of messages) {
    if ((message.role as string) !== "data") {
      continue
    }

    for (const part of message.parts) {
      if (!isWorkspaceEditSnapshotPart(part)) {
        continue
      }

      map.set(part.toolCallId, part)
    }
  }

  return map
}

export function isWorkspaceEditBaselineCurrent(
  baselineContentJson: unknown,
  currentContentJson: unknown,
  options?: {
    baselineMarkdown?: string
    currentMarkdown?: string
  },
) {
  if (baselineContentJson != null && currentContentJson != null) {
    if (
      JSON.stringify(baselineContentJson) === JSON.stringify(currentContentJson)
    ) {
      return true
    }
  }

  const baselineMarkdown = options?.baselineMarkdown?.trim()
  const currentMarkdown = options?.currentMarkdown?.trim()

  if (!baselineMarkdown || !currentMarkdown) {
    return false
  }

  return baselineMarkdown === currentMarkdown
}

export function isWorkspaceEditReviewAvailable(
  snapshot: WorkspaceEditSnapshotPart,
  currentContentJson: unknown,
  currentMarkdown?: string,
) {
  if (!snapshot.afterMarkdown || currentContentJson == null) {
    return false
  }

  if (snapshot.status === "preview" || snapshot.status === "declined") {
    return isWorkspaceEditBaselineCurrent(
      snapshot.beforeContentJson,
      currentContentJson,
      {
        baselineMarkdown: snapshot.beforeMarkdown,
        currentMarkdown,
      },
    )
  }

  if (snapshot.status === "applied") {
    return isWorkspaceEditBaselineCurrent(
      snapshot.afterContentJson ?? null,
      currentContentJson,
      {
        baselineMarkdown: snapshot.afterMarkdown,
        currentMarkdown,
      },
    )
  }

  if (snapshot.status === "undone") {
    return isWorkspaceEditBaselineCurrent(
      snapshot.beforeContentJson,
      currentContentJson,
      {
        baselineMarkdown: snapshot.beforeMarkdown,
        currentMarkdown,
      },
    )
  }

  return false
}

export function dedupeChatMessagesById<T extends { id: string }>(
  messages: readonly T[],
) {
  const seen = new Set<string>()
  const result: T[] = []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!

    if (seen.has(message.id)) {
      continue
    }

    seen.add(message.id)
    result.unshift(message)
  }

  return result
}

export function findWorkspaceEditSnapshotMessage(
  messages: readonly MessageWithParts[],
  toolCallId: string,
) {
  return messages.find(
    (message) =>
      (message.role as string) === "data" &&
      message.parts.some(
        (part) =>
          isWorkspaceEditSnapshotPart(part) && part.toolCallId === toolCallId,
      ),
  )
}