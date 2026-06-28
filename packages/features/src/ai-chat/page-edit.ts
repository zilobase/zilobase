export const WORKSPACE_EDIT_SNAPSHOT_PART_TYPE = "page-edit-snapshot" as const

export const PROPOSE_PAGE_CONTENT_UPDATE_TOOL = "proposePageContentUpdate" as const

export type PageEditSnapshotStatus =
  | "applied"
  | "declined"
  | "failed"
  | "preview"
  | "undone"

export type PageEditSnapshotPart = {
  type: typeof WORKSPACE_EDIT_SNAPSHOT_PART_TYPE
  toolCallId: string
  parentMessageId: string
  pageId: string
  summary: string
  afterContentJson?: unknown
  beforeMarkdown: string
  afterMarkdown: string
  beforeContentJson: unknown
  status: PageEditSnapshotStatus
  appliedAt: string
  undoneAt?: string
  errorMessage?: string
}

import type { PageEditMode } from "./apply-page-content-patch"

export type { PageEditMode }

export type ProposePageContentUpdateOutput = {
  editId: string
  pageId: string
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

export function isPageEditSnapshotPart(
  part: { type: string } & Record<string, unknown>,
): part is PageEditSnapshotPart {
  return part.type === WORKSPACE_EDIT_SNAPSHOT_PART_TYPE
}

export function isPageEditSnapshotMessage(
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

export function buildPageEditSnapshotMap(
  messages: readonly MessageWithParts[],
) {
  const map = new Map<string, PageEditSnapshotPart>()

  for (const message of messages) {
    if ((message.role as string) !== "data") {
      continue
    }

    for (const part of message.parts) {
      if (!isPageEditSnapshotPart(part)) {
        continue
      }

      map.set(part.toolCallId, part)
    }
  }

  return map
}

export function isPageEditBaselineCurrent(
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

export function isPageEditReviewAvailable(
  snapshot: PageEditSnapshotPart,
  currentContentJson: unknown,
  currentMarkdown?: string,
) {
  if (!snapshot.afterMarkdown || currentContentJson == null) {
    return false
  }

  if (snapshot.status === "preview" || snapshot.status === "declined") {
    return isPageEditBaselineCurrent(
      snapshot.beforeContentJson,
      currentContentJson,
      {
        baselineMarkdown: snapshot.beforeMarkdown,
        currentMarkdown,
      },
    )
  }

  if (snapshot.status === "applied") {
    return isPageEditBaselineCurrent(
      snapshot.afterContentJson ?? null,
      currentContentJson,
      {
        baselineMarkdown: snapshot.afterMarkdown,
        currentMarkdown,
      },
    )
  }

  if (snapshot.status === "undone") {
    return isPageEditBaselineCurrent(
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

export function findPageEditSnapshotMessage(
  messages: readonly MessageWithParts[],
  toolCallId: string,
) {
  return messages.find(
    (message) =>
      (message.role as string) === "data" &&
      message.parts.some(
        (part) =>
          isPageEditSnapshotPart(part) && part.toolCallId === toolCallId,
      ),
  )
}