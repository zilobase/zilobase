import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react"
import { ImagePlus, MessageSquare, SmilePlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker"
import { PageIconDisplay } from "@/lib/page-icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { usePageEditorComments } from "@/components/page-editor-comments"
import { useSession } from "@notelab/features/auth"
import {
  useDatabaseRealtime,
  type DatabasePresenceCollaborator,
} from "@notelab/features/databases"
import {
  useUpdatePagePropertyValue,
  usePagePersonAccessTargets,
  usePageProperties,
} from "@notelab/features/pages"
import { usePageCommentsSnapshot } from "@/contexts/page-comments-registry"
import type {
  PageLayoutConfig,
  PagePropertyPresenceTarget,
} from "@notelab/features/pages"
import {
  formatCommentButtonLabel,
  PageCommentThread,
} from "@/components/page-comments"

import { ImageSourcePicker } from "@/packages/editor/components/image-source-picker"

import { DatabasePropertyDate } from "../../extensions/database/properties/database-property-date"
import { DatabasePropertyButton } from "../../extensions/database/properties/database-property-button"
import { DatabasePropertyFiles } from "../../extensions/database/properties/database-property-files"
import { DatabasePropertyInput } from "../../extensions/database/properties/database-property-input"
import { DatabasePropertySelect } from "../../extensions/database/properties/database-property-select"
import { getDatabasePropertyType } from "../../extensions/database/core/database-property-types"
import { defaultStatusOptions } from "../../extensions/database/core/database-property-types"
import { formatDatabaseDateValue } from "../../extensions/database/properties/database-date-config"
import { getPersonLimit } from "../../extensions/database/views/database-view-config"
import {
  type DatabasePropertyValue,
  parsePropertyValue,
  serializePropertyValue,
} from "../../extensions/database/core/utils"

export type PageMetadataHandle = {
  focusTitleEnd: () => boolean
}

type PageMetadataProps = {
  compact?: boolean
  compactSpacing?: "default" | "comfortable"
  contentClassName?: string
  cover?: string
  databaseId?: string | null
  editable?: boolean
  enableComments?: boolean
  forceDiscussionsExpanded?: boolean
  icon?: string
  layoutConfig?: PageLayoutConfig
  layoutPropertyId?: string
  layoutSection?: "heading" | "properties" | "discussions"
  onCoverChange?: (cover: string) => void
  onIconChange?: (icon: string) => void
  onTitleEnter?: () => void
  onTitleChange?: (title: string) => void
  workspaceId?: string | null
  title?: string
  pageId?: string | null
  ref?: Ref<PageMetadataHandle>
}

function PageDatabaseRealtimeSubscription({
  activePropertyId,
  editable,
  enabled,
  onPresenceChange,
  target,
}: {
  activePropertyId: string | null
  editable: boolean
  enabled: boolean
  onPresenceChange: (
    databaseId: string,
    presence: Record<string, DatabasePresenceCollaborator[]> | null,
  ) => void
  target: PagePropertyPresenceTarget
}) {
  const presence = activePropertyId && target.propertyIds.includes(activePropertyId)
    ? {
        columnKey: activePropertyId,
        rowId: target.rowId,
        viewId: null,
      }
    : null
  const realtime = useDatabaseRealtime(target.databaseId, {
    enabled,
    presence,
    publishPresence: editable,
  })

  useEffect(() => {
    onPresenceChange(target.databaseId, realtime.cellPresenceByKey)
  }, [onPresenceChange, realtime.cellPresenceByKey, target.databaseId])

  useEffect(
    () => () => onPresenceChange(target.databaseId, null),
    [onPresenceChange, target.databaseId],
  )

  return null
}

function PagePropertyPresence({
  collaborators,
}: {
  collaborators: DatabasePresenceCollaborator[]
}) {
  if (collaborators.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className="database-cell-presence"
      title={collaborators.map((item) => item.user.name).join(", ")}
    >
      <span
        className="database-cell-presence-border"
        style={{
          "--database-presence-color": collaborators[0]?.color,
        } as CSSProperties}
      />
      <span className="database-cell-presence-stack">
        {collaborators.slice(0, 3).map((collaborator) => (
          <span
            className="database-cell-presence-dot"
            key={collaborator.sessionId}
            style={{
              "--database-presence-color": collaborator.color,
            } as CSSProperties}
          />
        ))}
      </span>
    </div>
  )
}

function resizeTitleTextarea(
  titleElement: HTMLTextAreaElement,
  titleRow: HTMLDivElement,
) {
  if (titleRow.clientWidth < 64) {
    return
  }

  titleElement.style.height = "0px"
  titleElement.style.height = `${titleElement.scrollHeight}px`
}

export function PageMetadata({
  compact = false,
  compactSpacing = "default",
  contentClassName,
  cover: coverProp,
  databaseId,
  editable = true,
  enableComments = true,
  forceDiscussionsExpanded = false,
  icon: iconProp,
  layoutConfig,
  layoutPropertyId,
  layoutSection,
  onCoverChange,
  onIconChange,
  onTitleEnter,
  onTitleChange,
  workspaceId,
  title: titleProp,
  pageId,
  ref,
}: PageMetadataProps) {
  const [coverOpen, setCoverOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [localCover, setLocalCover] = useState("")
  const [localIcon, setLocalIcon] = useState("")
  const [localTitle, setLocalTitle] = useState("")
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [draftValues, setDraftValues] = useState<Record<string, DatabasePropertyValue>>({})
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null)
  const [presenceByDatabase, setPresenceByDatabase] = useState<
    Record<string, Record<string, DatabasePresenceCollaborator[]>>
  >({})
  const titleRowRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const { editorCommentsOpenRequest } = usePageEditorComments()
  const { data: propertyPayload } = usePageProperties(pageId, {
    databaseId,
  })
  const needsPersonAccessTargets = useMemo(
    () =>
      (propertyPayload?.properties ?? []).some(
        (property) => property.type === "person",
      ),
    [propertyPayload?.properties],
  )
  const { data: accessTargets } = usePagePersonAccessTargets(pageId, {
    enabled: needsPersonAccessTargets,
  })
  const { data: session } = useSession()
  const presenceTargets = propertyPayload?.presenceTargets ?? []
  const updateDatabasePresence = useCallback((
    realtimeDatabaseId: string,
    presence: Record<string, DatabasePresenceCollaborator[]> | null,
  ) => {
    setPresenceByDatabase((current) => {
      if (presence === null) {
        if (!(realtimeDatabaseId in current)) return current

        const next = { ...current }
        delete next[realtimeDatabaseId]
        return next
      }

      if (current[realtimeDatabaseId] === presence) return current

      return { ...current, [realtimeDatabaseId]: presence }
    })
  }, [])
  const propertyPresenceById = useMemo(() => {
    const result: Record<string, DatabasePresenceCollaborator[]> = {}

    for (const target of presenceTargets) {
      const databasePresence = presenceByDatabase[target.databaseId]

      for (const propertyId of target.propertyIds) {
        const collaborators =
          databasePresence?.[`${target.rowId}:${propertyId}`] ?? []
        const existing = result[propertyId] ?? []

        result[propertyId] = [
          ...existing,
          ...collaborators.filter(
            (collaborator) =>
              !existing.some((item) => item.user.id === collaborator.user.id),
          ),
        ]
      }
    }

    return result
  }, [presenceByDatabase, presenceTargets])
  const setPropertyActive = useCallback((propertyId: string, active: boolean) => {
    setActivePropertyId((current) =>
      active ? propertyId : current === propertyId ? null : current,
    )
  }, [])
  const commentsEnabled = Boolean(
    enableComments && layoutConfig?.discussionsVisible !== false && pageId && session?.user,
  )
  const commentsSnapshot = usePageCommentsSnapshot(commentsEnabled ? pageId : null)
  const updatePropertyValue = useUpdatePagePropertyValue()
  const cover = coverProp ?? localCover
  const icon = iconProp ?? localIcon
  const title = titleProp ?? localTitle
  const unresolvedThreads = useMemo(
    () =>
      commentsSnapshot.threads.filter(
        (thread) => thread.kind === "page" && !thread.resolvedAt,
      ),
    [commentsSnapshot.threads],
  )
  const totalCommentCount = unresolvedThreads.reduce(
    (sum, thread) => sum + thread.comments.length,
    0,
  )
  const showHeading = !layoutSection || layoutSection === "heading"
  const showProperties = !layoutSection || layoutSection === "properties"
  const showDiscussions = !layoutSection || layoutSection === "discussions"
  const showCommentsSection =
    forceDiscussionsExpanded || commentsOpen || unresolvedThreads.length > 0
  const propertyValues = useMemo(() => {
    const values: Record<string, DatabasePropertyValue> = {}

    for (const value of propertyPayload?.values ?? []) {
      const property = propertyPayload?.properties.find(
        (item) => item.id === value.propertyId
      )
      values[value.propertyId] = parsePropertyValue(value.value, property?.type)
    }

    return values
  }, [propertyPayload?.properties, propertyPayload?.values])
  const standalonePropertyIds = useMemo(
    () => new Set(
      (layoutConfig?.modules ?? [])
        .filter((module) => module.type === "property" && module.propertyId)
        .map((module) => module.propertyId as string),
    ),
    [layoutConfig?.modules],
  )
  const visibleProperties = useMemo(
    () => [...(propertyPayload?.properties ?? [])].sort((left, right) => {
      const leftIndex = layoutConfig?.propertyOrder.indexOf(left.id) ?? -1
      const rightIndex = layoutConfig?.propertyOrder.indexOf(right.id) ?? -1
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
    }).filter((property) => {
      const setting = layoutConfig?.propertySettings[property.id]
      const value = propertyValues[property.id]
      if (setting?.display === "hidden") return false
      if (setting?.display === "hide_when_empty" && (value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0))) return false
      return !layoutConfig?.pinnedPropertyIds.includes(property.id) && !standalonePropertyIds.has(property.id)
    }),
    [layoutConfig?.pinnedPropertyIds, layoutConfig?.propertyOrder, layoutConfig?.propertySettings, propertyPayload?.properties, propertyValues, standalonePropertyIds],
  )
  const personOptions = useMemo(
    () =>
      (accessTargets?.members ?? []).map((member) => ({
        id: member.id,
        name: member.name || member.email,
        suffix: member.id === session?.user?.id ? "(you)" : undefined,
      })),
    [accessTargets?.members, session?.user?.id]
  )

  const commitPropertyValue = (
    propertyId: string,
    propertyType: string,
    value: DatabasePropertyValue
  ) => {
    if (!pageId || !editable) {
      return
    }

    setDraftValues((drafts) => ({
      ...drafts,
      [propertyId]: value,
    }))

    updatePropertyValue.mutate(
      {
        propertyId,
        value: serializePropertyValue(propertyType, value),
        pageId,
      },
      {
        onSuccess: () => {
          setDraftValues((drafts) => {
            const nextDrafts = { ...drafts }

            delete nextDrafts[propertyId]

            return nextDrafts
          })
        },
      }
    )
  }

  useEffect(() => {
    setCommentsOpen(false)
    setActivePropertyId(null)
  }, [pageId])

  useEffect(() => {
    if (editorCommentsOpenRequest > 0) {
      setCommentsOpen(true)
    }
  }, [editorCommentsOpenRequest])

  const updateCover = (nextCover: string) => {
    if (!editable) {
      return
    }

    onCoverChange?.(nextCover)

    if (coverProp === undefined) {
      setLocalCover(nextCover)
    }
  }

  const updateIcon = (nextIcon: string) => {
    if (!editable) {
      return
    }

    onIconChange?.(nextIcon)

    if (iconProp === undefined) {
      setLocalIcon(nextIcon)
    }
  }

  const updateTitle = (nextTitle: string) => {
    if (!editable) {
      return
    }

    onTitleChange?.(nextTitle)

    if (titleProp === undefined) {
      setLocalTitle(nextTitle)
    }
  }

  useLayoutEffect(() => {
    const titleElement = titleRef.current
    const titleRow = titleRowRef.current

    if (titleElement && titleRow) {
      resizeTitleTextarea(titleElement, titleRow)
    }
  }, [title])

  useEffect(() => {
    const titleElement = titleRef.current
    const titleRow = titleRowRef.current

    if (!titleElement || !titleRow) {
      return
    }

    let resizeFrame = 0
    let previousWidth = titleRow.clientWidth
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? titleRow.clientWidth

      if (width === previousWidth) {
        return
      }

      previousWidth = width
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeTitleTextarea(titleElement, titleRow)
      })
    })

    observer.observe(titleRow)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(resizeFrame)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    focusTitleEnd: () => {
      const titleElement = titleRef.current

      if (!showHeading || !titleElement) return false

      titleElement.focus()
      titleElement.setSelectionRange(
        titleElement.value.length,
        titleElement.value.length,
      )
      return true
    },
  }), [showHeading])

  const iconPicker = icon && editable ? (
    <div className="group/icon relative shrink-0">
      <Popover open={iconOpen} onOpenChange={setIconOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Change page icon"
            className="flex size-11 items-center justify-center rounded-md text-3xl transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            disabled={!editable}
            type="button"
          >
            <PageIconDisplay size="xl" value={icon} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto gap-0 overflow-hidden p-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          sideOffset={6}
        >
          <IconEmojiPicker
            onEmojiSelect={(emoji) => {
              updateIcon(emoji)
              setIconOpen(false)
            }}
            onIconSelect={(svg) => {
              updateIcon(svg)
              setIconOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        aria-label="Remove page icon"
        className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:flex focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none group-focus-within/metadata:flex group-hover/icon:flex group-hover/metadata:flex [&_svg]:size-3"
        onClick={() => {
          updateIcon("")
          setIconOpen(false)
        }}
        disabled={!editable}
        type="button"
      >
        <X />
      </button>
    </div>
  ) : !icon && editable ? (
    <Popover open={iconOpen} onOpenChange={setIconOpen}>
      <PopoverTrigger asChild>
        <Button
          className="text-muted-foreground"
          disabled={!editable}
          size="sm"
          type="button"
          variant="ghost"
        >
          <SmilePlus />
          Add icon
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto gap-0 overflow-hidden p-0"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <IconEmojiPicker
          onEmojiSelect={(emoji) => {
            updateIcon(emoji)
            setIconOpen(false)
          }}
          onIconSelect={(svg) => {
            updateIcon(svg)
            setIconOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  ) : null

  const showMetadataActions =
    (!icon && editable) ||
    (!cover && editable) ||
    (commentsEnabled && !layoutSection &&
      !showCommentsSection &&
      (editable || totalCommentCount > 0))

  const metadataActionVisibilityClassName =
    "opacity-0 transition-opacity pointer-events-none group-focus-within/metadata:opacity-100 group-focus-within/metadata:pointer-events-auto group-has-[[data-state=open]]/metadata:opacity-100 group-has-[[data-state=open]]/metadata:pointer-events-auto group-hover/metadata:opacity-100 group-hover/metadata:pointer-events-auto"

  return (
    <section className="group/metadata" contentEditable={false}>
      {presenceTargets.map((target) => (
        <PageDatabaseRealtimeSubscription
          activePropertyId={activePropertyId}
          editable={editable}
          enabled={Boolean(session?.user)}
          key={`${target.databaseId}:${target.rowId}`}
          onPresenceChange={updateDatabasePresence}
          target={target}
        />
      ))}
      {showHeading && cover ? (
        <div className="relative h-40 w-full overflow-hidden bg-muted">
          <img alt="Cover" className="size-full object-cover" src={cover} />
          {editable ? (
            <Button
              aria-label="Remove cover"
              className="absolute right-3 top-3 bg-background/80 opacity-0 shadow-sm backdrop-blur transition-opacity group-focus-within/metadata:opacity-100 group-hover/metadata:opacity-100 focus-visible:opacity-100"
              disabled={!editable}
              onClick={() => updateCover("")}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <X />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        className={`${contentClassName ?? ""} ${compact ? compactSpacing === "comfortable" ? "px-8 py-5" : "px-4 py-4" : "px-5 py-6 sm:px-8 md:px-20 md:py-8 lg:px-24"}`}
      >
        {showHeading && showMetadataActions ? (
          <div className="relative mb-3 min-h-8">
            <div
              className={`absolute inset-0 flex flex-wrap items-center gap-2 ${metadataActionVisibilityClassName}`}
            >
            {!icon ? iconPicker : null}
            {!cover && editable ? (
              <Popover onOpenChange={setCoverOpen} open={coverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    className="text-muted-foreground"
                    disabled={!editable}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ImagePlus />
                    Add cover
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(42rem,calc(100vw-2rem))] p-4"
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  side="bottom"
                  sideOffset={8}
                >
                  <ImageSourcePicker
                    databaseId={databaseId}
                    onSelect={(url) => {
                      updateCover(url)
                      setCoverOpen(false)
                    }}
                    workspaceId={workspaceId}
                    pageId={pageId}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
            {commentsEnabled && !layoutSection &&
            !showCommentsSection &&
            (editable || totalCommentCount > 0) ? (
              <Button
                className="text-muted-foreground"
                onClick={() => {
                  setCommentsOpen((open) => !open)
                  if (totalCommentCount === 0) {
                    setCommentsOpen(true)
                  }
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <MessageSquare />
                {formatCommentButtonLabel(totalCommentCount)}
              </Button>
            ) : null}
            </div>
          </div>
        ) : null}

        {showHeading ? <div className="flex items-start gap-3" ref={titleRowRef}>
          {icon ? (
            editable ? (
              iconPicker
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md text-3xl">
                <PageIconDisplay size="xl" value={icon} />
              </div>
            )
          ) : null}
          <textarea
            aria-label="Page title"
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-3 py-0 text-4xl font-semibold leading-tight tracking-normal whitespace-pre-wrap text-balance text-foreground shadow-none outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0 dark:bg-transparent"
            onChange={(event) => updateTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
                onTitleEnter?.()
              }
            }}
            placeholder="New page"
            readOnly={!editable}
            ref={titleRef}
            rows={1}
            value={title}
          />
        </div> : null}

        {showHeading && layoutConfig?.pinnedPropertyIds.length ? (
          <div className="mt-3 flex flex-wrap gap-2 pl-3">
            {layoutConfig.pinnedPropertyIds.flatMap((propertyId) => {
              const property = propertyPayload?.properties.find(
                (item) => item.id === propertyId,
              )
              if (!property) return []
              const value = propertyValues[property.id]
              const PropertyIcon = getDatabasePropertyType(property.type).icon
              return [
                <span
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                  key={property.id}
                >
                  {layoutConfig.propertyIcons ? <PropertyIcon className="size-3.5" /> : null}
                  <span>{property.name}</span>
                  <span className="text-foreground">
                    {Array.isArray(value) ? value.join(", ") : String(value || "Empty")}
                  </span>
                </span>,
              ]
            })}
          </div>
        ) : null}

        {showDiscussions && commentsEnabled && showCommentsSection ? (
          <div className="mt-6 space-y-0 pb-3">
            {unresolvedThreads.length > 0 ? (
              unresolvedThreads.map((thread, index) => (
                <div
                  className={
                    index > 0 ? "mt-5 border-t border-border pt-4" : ""
                  }
                  key={thread.id}
                >
                  <PageCommentThread
                    placeholder={index === 0 ? "Add a comment..." : "Reply..."}
                    threadId={thread.id}
                    pageId={pageId}
                  />
                </div>
              ))
            ) : (
              <PageCommentThread
                placeholder="Add a comment..."
                pageId={pageId}
              />
            )}
            <div className="mt-5 border-t border-border" />
          </div>
        ) : null}

        {showProperties && (layoutPropertyId
          ? propertyPayload?.properties.some((property) => property.id === layoutPropertyId)
          : visibleProperties.length) ? (
          <div className="mt-6 grid gap-1 border-y py-2">
            {(layoutPropertyId
              ? propertyPayload?.properties.filter((property) => property.id === layoutPropertyId) ?? []
              : visibleProperties
            ).map((property) => {
              const PropertyIcon = getDatabasePropertyType(property.type).icon
              const value =
                draftValues[property.id] ?? propertyValues[property.id] ?? ""
              const isSelectProperty =
                property.type === "select" ||
                property.type === "multi_select" ||
                property.type === "status"
              const isCheckboxProperty = property.type === "checkbox"
              const isButtonProperty = property.type === "button"
              const isDateProperty = property.type === "date"
              const isFilesProperty = property.type === "files"
              const isPersonProperty = property.type === "person"
              const isReadOnlyTimeProperty =
                property.type === "created_time" || property.type === "edited_time"
              const isMultiSelectProperty =
                property.type === "multi_select" ||
                (isPersonProperty && getPersonLimit(property.config) !== "one_person")
              const inputValue = Array.isArray(value) ? value.join(", ") : value

              return (
                <div
                  className="grid min-h-8 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm"
                  key={property.id}
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
                    {layoutConfig?.propertyIcons === false ? null : <PropertyIcon />}
                    <span className="truncate">{property.name}</span>
                  </span>
                  <div
                    className="relative min-w-0 rounded-[3px]"
                    data-presence={
                      (propertyPresenceById[property.id]?.length ?? 0) > 0
                        ? "true"
                        : undefined
                    }
                  >
                    <PagePropertyPresence
                      collaborators={propertyPresenceById[property.id] ?? []}
                    />
                    {isReadOnlyTimeProperty ? (
                      <span className="database-date-cell-trigger">
                        {formatDatabaseDateValue(value, property.config) || (
                          <span className="text-muted-foreground">Empty</span>
                        )}
                      </span>
                    ) : isCheckboxProperty ? (
                      <div className="database-checkbox-cell px-0">
                        <Checkbox
                          aria-label={`${property.name} value`}
                          checked={value === "true"}
                          disabled={!editable}
                          onBlur={() => setPropertyActive(property.id, false)}
                          onCheckedChange={(nextChecked) =>
                            commitPropertyValue(
                              property.id,
                              property.type,
                              nextChecked === true ? "true" : "false"
                            )
                          }
                          onFocus={() => setPropertyActive(property.id, true)}
                        />
                      </div>
                    ) : isButtonProperty ? (
                      <DatabasePropertyButton
                        editable={editable}
                        label={property.name}
                        value={value}
                      />
                    ) : isSelectProperty || isPersonProperty ? (
                      <DatabasePropertySelect
                        allowCreate={false}
                        defaultOptions={
                          property.type === "status"
                            ? defaultStatusOptions
                            : isPersonProperty
                              ? personOptions
                              : undefined
                        }
                        editable={editable}
                        label={property.name}
                        multiple={isMultiSelectProperty}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(property.id, property.type, nextValue)
                        }
                        propertyConfig={property.config}
                        showStatusDot={property.type === "status"}
                        value={value}
                        valueKey={isPersonProperty ? "id" : "name"}
                      />
                    ) : isDateProperty ? (
                      <DatabasePropertyDate
                        editable={editable}
                        label={property.name}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(property.id, property.type, nextValue)
                        }
                        propertyConfig={property.config}
                        value={value}
                      />
                    ) : isFilesProperty ? (
                      <DatabasePropertyFiles
                        editable={editable}
                        label={property.name}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(property.id, property.type, nextValue)
                        }
                        propertyConfig={property.config}
                        value={value}
                      />
                    ) : (
                      <DatabasePropertyInput
                        editable={editable}
                        label={property.name}
                        onActivate={() => setPropertyActive(property.id, true)}
                        onChange={(nextValue) =>
                          setDraftValues((drafts) => ({
                            ...drafts,
                            [property.id]: nextValue,
                          }))
                        }
                        onCommit={() =>
                          commitPropertyValue(property.id, property.type, inputValue)
                        }
                        onDeactivate={() =>
                          setPropertyActive(property.id, false)
                        }
                        propertyConfig={property.config}
                        type={property.type}
                        value={inputValue}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
