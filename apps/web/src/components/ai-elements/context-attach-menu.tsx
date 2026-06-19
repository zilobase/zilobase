"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { DatabaseIcon, FileTextIcon } from "lucide-react"

import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
} from "@/components/ai-elements/prompt-input"
import { WorkspacePageIcon } from "@/lib/workspace-icon"
import { useActiveOrganizationId } from "@notelab/features/integrations"
import type { AppSearchResult } from "@notelab/features/search"
import {
  readParentItemId,
  useWorkspaces,
  type Workspace,
} from "@notelab/features/workspaces"
import type {
  ContextAttachment,
  ContextSourceRef,
} from "@notelab/workspace-context"

const MAX_VISIBLE_PER_GROUP = 3

type AttachMenuCategory = "current-page" | "skills" | "link-to-page" | "databases"

const categoryHeadings: Record<AttachMenuCategory, string> = {
  "current-page": "Current page",
  skills: "Skills",
  "link-to-page": "Link to page",
  databases: "Databases",
}

const categoryOrder: AttachMenuCategory[] = [
  "current-page",
  "skills",
  "link-to-page",
  "databases",
]

export function buildWorkspacePath(
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

    const parentItemId = readParentItemId(current.metadata)

    if (!parentItemId) {
      break
    }

    current = workspacesById.get(parentItemId)
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

function matchesQuery(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return text.toLowerCase().includes(normalizedQuery)
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
  category: AttachMenuCategory
  key: string
  result: AppSearchResult
}

export type ContextAttachMenuEntry =
  | {
      attachment: ContextAttachment
      key: string
      menuItem: AttachMenuItem
      type: "attachment"
    }
  | {
      category: AttachMenuCategory
      hiddenCount: number
      key: string
      type: "expand"
    }

export type ContextAttachMenuHandle = {
  activateEntry: (entry: ContextAttachMenuEntry) => void
}

function getExpandKey(category: AttachMenuCategory) {
  return `expand:${category}`
}

function buildMenuEntries({
  expandedCategories,
  groupedResults,
}: {
  expandedCategories: Set<AttachMenuCategory>
  groupedResults: Record<AttachMenuCategory, AttachMenuItem[]>
}): ContextAttachMenuEntry[] {
  const entries: ContextAttachMenuEntry[] = []

  for (const category of categoryOrder) {
    const groupItems = groupedResults[category]
    const isExpanded = expandedCategories.has(category)
    const visibleItems = isExpanded
      ? groupItems
      : groupItems.slice(0, MAX_VISIBLE_PER_GROUP)

    for (const item of visibleItems) {
      entries.push({
        attachment: item.attachment,
        key: item.key,
        menuItem: item,
        type: "attachment",
      })
    }

    if (!isExpanded && groupItems.length > visibleItems.length) {
      entries.push({
        category,
        hiddenCount: groupItems.length - visibleItems.length,
        key: getExpandKey(category),
        type: "expand",
      })
    }
  }

  return entries
}

function buildAttachMenuItems({
  currentDatabaseId,
  currentPageId,
  existingAttachmentKeys,
  query,
  workspaces,
}: {
  currentDatabaseId?: string | null
  currentPageId?: string | null
  existingAttachmentKeys: Set<string>
  query: string
  workspaces: Workspace[]
}): AttachMenuItem[] {
  const workspacesById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  )
  const items: AttachMenuItem[] = []

  const pushItem = (
    result: AppSearchResult,
    category: AttachMenuCategory,
  ) => {
    const key = `${result.type === "database" ? "database" : "page"}:${result.id}`

    if (existingAttachmentKeys.has(key)) {
      return
    }

    items.push({
      attachment: toAttachment(result),
      category,
      key,
      result,
    })
  }

  if (currentPageId) {
    const workspace = workspacesById.get(currentPageId)

    if (workspace) {
      const title = workspace.name.trim() || "Untitled"
      const path = buildWorkspacePath(workspacesById, workspace.id)
      const searchText = `${title} ${path}`

      if (matchesQuery(searchText, query)) {
        pushItem(
          {
            emoji: workspace.metadata?.emoji ?? null,
            id: workspace.id,
            path,
            title,
            type: "page",
          },
          "current-page",
        )
      }
    }
  } else if (currentDatabaseId) {
    for (const workspace of workspaces) {
      const database = workspace.databases?.find(
        (item) => item.id === currentDatabaseId,
      )

      if (!database) {
        continue
      }

      const path = `${buildWorkspacePath(workspacesById, workspace.id)} / ${database.name.trim() || "Database"}`
      const title = database.name.trim() || "Database"
      const searchText = `${title} ${path}`

      if (matchesQuery(searchText, query)) {
        pushItem(
          {
            emoji: readDatabaseEmoji(database.config),
            id: database.id,
            path,
            title,
            type: "database",
          },
          "current-page",
        )
      }

      break
    }
  }

  const skillPages: AppSearchResult[] = []
  const linkPages: AppSearchResult[] = []
  const databases: AppSearchResult[] = []

  for (const workspace of workspaces) {
    const title = workspace.name.trim() || "Untitled"
    const path = buildWorkspacePath(workspacesById, workspace.id)
    const pageSearchText = `${title} ${path}`
    const isCurrentPage = workspace.id === currentPageId
    const isSkill = workspace.metadata?.notelabai === "skill"

    if (!isCurrentPage && matchesQuery(pageSearchText, query)) {
      const result: AppSearchResult = {
        emoji: workspace.metadata?.emoji ?? null,
        id: workspace.id,
        path,
        title,
        type: "page",
      }

      if (isSkill) {
        skillPages.push(result)
      } else {
        linkPages.push(result)
      }
    }

    for (const database of workspace.databases ?? []) {
      if (database.id === currentDatabaseId) {
        continue
      }

      const databaseTitle = database.name.trim() || "Database"
      const databasePath = `${path} / ${databaseTitle}`
      const databaseSearchText = `${databaseTitle} ${databasePath}`

      if (matchesQuery(databaseSearchText, query)) {
        databases.push({
          emoji: readDatabaseEmoji(database.config),
          id: database.id,
          path: databasePath,
          title: databaseTitle,
          type: "database",
        })
      }
    }
  }

  skillPages
    .sort((left, right) => left.title.localeCompare(right.title))
    .forEach((result) => pushItem(result, "skills"))

  linkPages
    .sort((left, right) => left.title.localeCompare(right.title))
    .forEach((result) => pushItem(result, "link-to-page"))

  databases
    .sort((left, right) => left.title.localeCompare(right.title))
    .forEach((result) => pushItem(result, "databases"))

  return items
}

export function buildPrimaryAttachment({
  databaseEmoji,
  databaseName,
  primarySource,
  workspaces,
}: {
  databaseEmoji?: string | null
  databaseName?: string | null
  primarySource: ContextSourceRef
  workspaces: Workspace[]
}): ContextAttachment | null {
  if (primarySource.type === "database") {
    if (!databaseName) {
      return null
    }

    for (const workspace of workspaces) {
      const database = workspace.databases?.find(
        (item) => item.id === primarySource.id,
      )

      if (!database) {
        continue
      }

      const workspacesById = new Map(
        workspaces.map((item) => [item.id, item]),
      )

      return {
        emoji: databaseEmoji ?? readDatabaseEmoji(database.config),
        id: primarySource.id,
        path: `${buildWorkspacePath(workspacesById, workspace.id)} / ${databaseName}`,
        title: databaseName,
        type: "database",
      }
    }

    return {
      emoji: databaseEmoji,
      id: primarySource.id,
      path: "",
      title: databaseName,
      type: "database",
    }
  }

  const workspacesById = new Map(workspaces.map((item) => [item.id, item]))
  const workspace = workspacesById.get(primarySource.id)

  if (!workspace) {
    return null
  }

  return {
    emoji: workspace.metadata?.emoji ?? null,
    id: primarySource.id,
    path: buildWorkspacePath(workspacesById, primarySource.id),
    title: workspace.name.trim() || "Untitled",
    type: "page",
  }
}

function AttachMenuItemIcon({
  item,
}: {
  item: AttachMenuItem
}) {
  if (item.result.type === "database") {
    if (item.result.emoji) {
      return <span className="text-base leading-none">{item.result.emoji}</span>
    }

    return <DatabaseIcon className="size-4 shrink-0 text-muted-foreground" />
  }

  if (item.category === "skills") {
    return <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
  }

  const workspace = {
    content: null,
    metadata: {
      emoji: item.result.emoji,
    },
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <WorkspacePageIcon workspace={workspace} />
    </span>
  )
}

function AttachMenuGroup({
  allEntries,
  category,
  isExpanded,
  items,
  onActivateEntry,
  selectedIndex,
  selectedItemRef,
}: {
  allEntries: ContextAttachMenuEntry[]
  category: AttachMenuCategory
  isExpanded: boolean
  items: AttachMenuItem[]
  onActivateEntry: (entry: ContextAttachMenuEntry) => void
  selectedIndex: number
  selectedItemRef: React.RefObject<HTMLDivElement | null>
}) {
  if (items.length === 0) {
    return null
  }

  const visibleItems = isExpanded
    ? items
    : items.slice(0, MAX_VISIBLE_PER_GROUP)
  const hiddenCount = isExpanded ? 0 : items.length - visibleItems.length
  const expandKey = getExpandKey(category)
  const expandEntry: ContextAttachMenuEntry | null =
    hiddenCount > 0
      ? {
          category,
          hiddenCount,
          key: expandKey,
          type: "expand",
        }
      : null

  return (
    <PromptInputCommandGroup heading={categoryHeadings[category]}>
      {visibleItems.map((item) => {
        const entryIndex = allEntries.findIndex((candidate) => candidate.key === item.key)

        return (
          <PromptInputCommandItem
            aria-selected={entryIndex === selectedIndex}
            className={
              entryIndex === selectedIndex ? "bg-muted text-foreground" : ""
            }
            key={item.key}
            onMouseDown={(event) => {
              event.preventDefault()
              onActivateEntry({
                attachment: item.attachment,
                key: item.key,
                menuItem: item,
                type: "attachment",
              })
            }}
            onSelect={() =>
              onActivateEntry({
                attachment: item.attachment,
                key: item.key,
                menuItem: item,
                type: "attachment",
              })
            }
            ref={entryIndex === selectedIndex ? selectedItemRef : undefined}
            value={item.key}
          >
            <AttachMenuItemIcon item={item} />
            <div className="min-w-0">
              <div className="truncate">{item.result.title}</div>
              {item.result.path ? (
                <div className="truncate text-xs text-muted-foreground">
                  {item.result.path}
                </div>
              ) : null}
            </div>
          </PromptInputCommandItem>
        )
      })}
      {expandEntry ? (
        (() => {
          const entryIndex = allEntries.findIndex(
            (candidate) => candidate.key === expandKey,
          )

          return (
            <PromptInputCommandItem
              aria-selected={entryIndex === selectedIndex}
              className={
                entryIndex === selectedIndex
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              }
              key={expandKey}
              onMouseDown={(event) => {
                event.preventDefault()
                onActivateEntry(expandEntry)
              }}
              onSelect={() => onActivateEntry(expandEntry)}
              ref={entryIndex === selectedIndex ? selectedItemRef : undefined}
              value={expandKey}
            >
              <span className="truncate">
                ... {expandEntry.hiddenCount} more result
                {expandEntry.hiddenCount === 1 ? "" : "s"}
              </span>
            </PromptInputCommandItem>
          )
        })()
      ) : null}
    </PromptInputCommandGroup>
  )
}

export const ContextAttachMenu = forwardRef<
  ContextAttachMenuHandle,
  {
    currentDatabaseId?: string | null
    currentPageId?: string | null
    existingAttachmentKeys: Set<string>
    onEntriesChange?: (entries: ContextAttachMenuEntry[]) => void
    onSelect: (attachment: ContextAttachment) => void
    open: boolean
    query: string
    selectedIndex: number
    setSelectedIndex: (index: number) => void
  }
>(function ContextAttachMenu(
  {
    currentDatabaseId = null,
    currentPageId = null,
    existingAttachmentKeys,
    onEntriesChange,
    onSelect,
    open,
    query,
    selectedIndex,
    setSelectedIndex,
  },
  ref,
) {
  const organizationId = useActiveOrganizationId()
  const {
    data: workspaces = [],
    isFetching,
    isLoading,
  } = useWorkspaces(organizationId, { enabled: open })
  const selectedItemRef = useRef<HTMLDivElement | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<
    Set<AttachMenuCategory>
  >(new Set())

  const items = useMemo(
    () =>
      open
        ? buildAttachMenuItems({
            currentDatabaseId,
            currentPageId,
            existingAttachmentKeys,
            query,
            workspaces,
          })
        : [],
    [
      currentDatabaseId,
      currentPageId,
      existingAttachmentKeys,
      open,
      query,
      workspaces,
    ],
  )

  const groupedResults = useMemo(() => {
    const groups: Record<AttachMenuCategory, AttachMenuItem[]> = {
      "current-page": [],
      databases: [],
      "link-to-page": [],
      skills: [],
    }

    for (const item of items) {
      groups[item.category].push(item)
    }

    return groups
  }, [items])

  const menuEntries = useMemo(
    () =>
      buildMenuEntries({
        expandedCategories,
        groupedResults,
      }),
    [expandedCategories, groupedResults],
  )

  const selectedEntry = menuEntries[selectedIndex]
  const isLoadingResults = (isLoading || isFetching) && workspaces.length === 0

  const handleExpandCategory = useCallback((category: AttachMenuCategory) => {
    setExpandedCategories((current) => {
      const next = new Set(current)
      next.add(category)
      return next
    })
  }, [])

  const handleActivateEntry = useCallback(
    (entry: ContextAttachMenuEntry) => {
      if (entry.type === "expand") {
        handleExpandCategory(entry.category)
        return
      }

      onSelect(entry.attachment)
    },
    [handleExpandCategory, onSelect],
  )

  useImperativeHandle(
    ref,
    () => ({
      activateEntry: handleActivateEntry,
    }),
    [handleActivateEntry],
  )

  useEffect(() => {
    setExpandedCategories(new Set())
  }, [open, query])

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  useEffect(() => {
    onEntriesChange?.(menuEntries)
  }, [menuEntries, onEntriesChange])

  useEffect(() => {
    if (selectedIndex >= menuEntries.length && menuEntries.length > 0) {
      setSelectedIndex(menuEntries.length - 1)
    }
  }, [menuEntries.length, selectedIndex, setSelectedIndex])

  if (!open) {
    return null
  }

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-md overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <PromptInputCommand
        onValueChange={(value) => {
          const nextIndex = menuEntries.findIndex((entry) => entry.key === value)

          if (nextIndex >= 0) {
            setSelectedIndex(nextIndex)
          }
        }}
        shouldFilter={false}
        value={selectedEntry?.key ?? ""}
      >
        <PromptInputCommandList className="max-h-60">
          {isLoadingResults ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading pages and databases...
            </div>
          ) : items.length === 0 ? (
            <PromptInputCommandEmpty>No pages or databases found.</PromptInputCommandEmpty>
          ) : (
            categoryOrder.map((category) => (
              <AttachMenuGroup
                allEntries={menuEntries}
                category={category}
                isExpanded={expandedCategories.has(category)}
                items={groupedResults[category]}
                key={category}
                onActivateEntry={handleActivateEntry}
                selectedIndex={selectedIndex}
                selectedItemRef={selectedItemRef}
              />
            ))
          )}
        </PromptInputCommandList>
      </PromptInputCommand>
    </div>
  )
})

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