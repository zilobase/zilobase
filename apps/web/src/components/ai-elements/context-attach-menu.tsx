"use client"

import { useEffect, useMemo, useRef } from "react"
import { DatabaseIcon, FileTextIcon } from "lucide-react"

import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
} from "@/components/ai-elements/prompt-input"
import { useActiveOrganizationId } from "@notelab/features/integrations"
import type { AppSearchResult } from "@notelab/features/search"
import { useWorkspaces, type Workspace } from "@notelab/features/workspaces"
import type { ContextAttachment } from "@notelab/workspace-context"

function buildWorkspacePath(
  workspacesById: Map<string, Workspace>,
  workspaceId: string,
) {
  const parts: string[] = []
  const visited = new Set<string>()
  let current = workspacesById.get(workspaceId)

  while (current) {
    if (visited.has(current.id)) {
      break
    }

    visited.add(current.id)
    parts.unshift(current.name.trim() || "Untitled")

    const parentWorkspaceId = current.metadata?.parentWorkspaceId

    if (!parentWorkspaceId) {
      break
    }

    current = workspacesById.get(parentWorkspaceId)
  }

  return parts.join(" / ")
}

function readDatabaseEmoji(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null
  }

  const emoji = (config as { emoji?: unknown }).emoji

  return typeof emoji === "string" && emoji.length > 0 ? emoji : null
}

function buildAttachResults(
  workspaces: Workspace[],
  query: string,
): AppSearchResult[] {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const normalizedQuery = query.trim().toLowerCase()
  const results: AppSearchResult[] = []

  for (const workspace of workspaces) {
    const title = workspace.name.trim() || "Untitled"
    const path = buildWorkspacePath(workspacesById, workspace.id)
    const pageSearchText = `${title} ${path}`.toLowerCase()

    if (!normalizedQuery || pageSearchText.includes(normalizedQuery)) {
      results.push({
        emoji: workspace.metadata?.emoji ?? null,
        id: workspace.id,
        path,
        title,
        type: "page",
      })
    }

    for (const database of workspace.databases ?? []) {
      const databaseTitle = database.name.trim() || "Database"
      const databasePath = `${path} / ${databaseTitle}`
      const databaseSearchText = `${databaseTitle} ${databasePath}`.toLowerCase()

      if (!normalizedQuery || databaseSearchText.includes(normalizedQuery)) {
        results.push({
          emoji: readDatabaseEmoji(database.config),
          id: database.id,
          path: databasePath,
          title: databaseTitle,
          type: "database",
        })
      }
    }
  }

  return results.sort((left, right) => left.title.localeCompare(right.title))
}

function toAttachment(result: AppSearchResult): ContextAttachment {
  return {
    id: result.id,
    type: result.type === "database" ? "database" : "page",
    title: result.title,
    path: result.path,
    emoji: result.emoji,
  }
}

type AttachMenuItem = {
  attachment: ContextAttachment
  key: string
  result: AppSearchResult
}

export function ContextAttachMenu({
  existingAttachmentKeys,
  onItemsChange,
  onSelect,
  open,
  query,
  selectedIndex,
  setSelectedIndex,
}: {
  existingAttachmentKeys: Set<string>
  onItemsChange?: (items: ContextAttachment[]) => void
  onSelect: (attachment: ContextAttachment) => void
  open: boolean
  query: string
  selectedIndex: number
  setSelectedIndex: (index: number) => void
}) {
  const organizationId = useActiveOrganizationId()
  const {
    data: workspaces = [],
    isFetching,
    isLoading,
  } = useWorkspaces(organizationId)
  const selectedItemRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(
    () => (open ? buildAttachResults(workspaces, query) : []),
    [open, query, workspaces],
  )

  const items = useMemo(() => {
    const nextItems: AttachMenuItem[] = []

    for (const result of results) {
      const key = `${result.type === "database" ? "database" : "page"}:${result.id}`

      if (existingAttachmentKeys.has(key)) {
        continue
      }

      nextItems.push({
        attachment: toAttachment(result),
        key,
        result,
      })
    }

    return nextItems
  }, [existingAttachmentKeys, results])

  const groupedResults = useMemo(() => {
    const pages: AttachMenuItem[] = []
    const databases: AttachMenuItem[] = []

    for (const item of items) {
      if (item.result.type === "database") {
        databases.push(item)
      } else {
        pages.push(item)
      }
    }

    return { databases, pages }
  }, [items])

  const selectedItem = items[selectedIndex]
  const isLoadingResults = (isLoading || isFetching) && workspaces.length === 0

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  useEffect(() => {
    onItemsChange?.(items.map((item) => item.attachment))
  }, [items, onItemsChange])

  if (!open) {
    return null
  }

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-md overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <PromptInputCommand
        onValueChange={(value) => {
          const nextIndex = items.findIndex((item) => item.key === value)

          if (nextIndex >= 0) {
            setSelectedIndex(nextIndex)
          }
        }}
        shouldFilter={false}
        value={selectedItem?.key ?? ""}
      >
        <PromptInputCommandList className="max-h-60">
          {isLoadingResults ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading pages and databases...
            </div>
          ) : items.length === 0 ? (
            <PromptInputCommandEmpty>No pages or databases found.</PromptInputCommandEmpty>
          ) : (
            <>
              {groupedResults.pages.length > 0 ? (
                <PromptInputCommandGroup heading="Pages">
                  {groupedResults.pages.map((item) => {
                    const itemIndex = items.findIndex(
                      (candidate) => candidate.key === item.key,
                    )

                    return (
                      <PromptInputCommandItem
                        aria-selected={itemIndex === selectedIndex}
                        className={
                          itemIndex === selectedIndex
                            ? "bg-muted text-foreground"
                            : ""
                        }
                        key={item.key}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          onSelect(item.attachment)
                        }}
                        onSelect={() => onSelect(item.attachment)}
                        ref={itemIndex === selectedIndex ? selectedItemRef : undefined}
                        value={item.key}
                      >
                        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate">{item.result.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.result.path}
                          </div>
                        </div>
                      </PromptInputCommandItem>
                    )
                  })}
                </PromptInputCommandGroup>
              ) : null}
              {groupedResults.databases.length > 0 ? (
                <PromptInputCommandGroup heading="Databases">
                  {groupedResults.databases.map((item) => {
                    const itemIndex = items.findIndex(
                      (candidate) => candidate.key === item.key,
                    )

                    return (
                      <PromptInputCommandItem
                        aria-selected={itemIndex === selectedIndex}
                        className={
                          itemIndex === selectedIndex
                            ? "bg-muted text-foreground"
                            : ""
                        }
                        key={item.key}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          onSelect(item.attachment)
                        }}
                        onSelect={() => onSelect(item.attachment)}
                        ref={itemIndex === selectedIndex ? selectedItemRef : undefined}
                        value={item.key}
                      >
                        <DatabaseIcon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate">{item.result.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.result.path}
                          </div>
                        </div>
                      </PromptInputCommandItem>
                    )
                  })}
                </PromptInputCommandGroup>
              ) : null}
            </>
          )}
        </PromptInputCommandList>
      </PromptInputCommand>
    </div>
  )
}

export function getAttachmentKey(attachment: Pick<ContextAttachment, "type" | "id">) {
  return `${attachment.type}:${attachment.id}`
}

export function parseMentionState(
  text: string,
  caretPosition: number | null | undefined,
): { mentionQuery: string; mentionStart: number } | null {
  if (caretPosition === null || caretPosition === undefined || caretPosition < 0) {
    return null
  }

  const beforeCaret = text.slice(0, caretPosition)
  const match = /(?:^|\s)@([^\s@]*)$/.exec(beforeCaret)

  if (!match) {
    return null
  }

  const mentionQuery = match[1] ?? ""
  const mentionStart = beforeCaret.length - mentionQuery.length - 1

  return {
    mentionQuery,
    mentionStart,
  }
}