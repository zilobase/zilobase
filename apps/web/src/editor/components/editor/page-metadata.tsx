import { useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus, MessageSquare, SmilePlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker"
import { PageIconDisplay } from "@/lib/page-icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { usePageEditorComments } from "@/components/page-editor-comments"
import { useSession } from "@notelab/features/auth"
import {
  useUpdatePagePropertyValue,
  usePagePersonAccessTargets,
  usePageProperties,
  usePageThreads,
} from "@notelab/features/pages"
import {
  formatCommentButtonLabel,
  PageCommentThread,
} from "@/components/page-comments"

import { ImageSourcePicker } from "@/packages/editor/components/image-source-picker"

import { DatabasePropertyDate } from "../../extensions/database/database-property-date"
import { DatabasePropertyButton } from "../../extensions/database/database-property-button"
import { DatabasePropertyFiles } from "../../extensions/database/database-property-files"
import { DatabasePropertyInput } from "../../extensions/database/database-property-input"
import { DatabasePropertySelect } from "../../extensions/database/database-property-select"
import { getDatabasePropertyType } from "../../extensions/database/constants"
import { defaultStatusOptions } from "../../extensions/database/constants"
import { formatDatabaseDateValue } from "../../extensions/database/shared/database-date-config"
import { getPersonLimit } from "../../extensions/database/shared/database-view-config"
import {
  type DatabasePropertyValue,
  parsePropertyValue,
  serializePropertyValue,
} from "../../extensions/database/utils"

type PageMetadataProps = {
  contentClassName?: string
  cover?: string
  databaseId?: string | null
  editable?: boolean
  enableComments?: boolean
  icon?: string
  onCoverChange?: (cover: string) => void
  onIconChange?: (icon: string) => void
  onTitleChange?: (title: string) => void
  workspaceId?: string | null
  title?: string
  pageId?: string | null
}

export function PageMetadata({
  contentClassName,
  cover: coverProp,
  databaseId,
  editable = true,
  enableComments = true,
  icon: iconProp,
  onCoverChange,
  onIconChange,
  onTitleChange,
  workspaceId,
  title: titleProp,
  pageId,
}: PageMetadataProps) {
  const [coverOpen, setCoverOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [localCover, setLocalCover] = useState("")
  const [localIcon, setLocalIcon] = useState("")
  const [localTitle, setLocalTitle] = useState("")
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [draftValues, setDraftValues] = useState<Record<string, DatabasePropertyValue>>({})
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
  const commentsEnabled = Boolean(
    enableComments && pageId && session?.user,
  )
  const { data: threadsData } = usePageThreads(pageId, commentsEnabled)
  const updatePropertyValue = useUpdatePagePropertyValue()
  const cover = coverProp ?? localCover
  const icon = iconProp ?? localIcon
  const title = titleProp ?? localTitle
  const unresolvedThreads = useMemo(
    () =>
      (threadsData?.threads ?? []).filter(
        (item) => item.thread && !item.thread.resolvedAt,
      ),
    [threadsData?.threads],
  )
  const totalCommentCount = unresolvedThreads.reduce(
    (sum, item) => sum + item.comments.length,
    0,
  )
  const showCommentsSection = commentsOpen || unresolvedThreads.length > 0
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

  useEffect(() => {
    const titleElement = titleRef.current

    if (!titleElement) {
      return
    }

    titleElement.style.height = "0px"
    titleElement.style.height = `${titleElement.scrollHeight}px`
  }, [title])

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
    (commentsEnabled &&
      !showCommentsSection &&
      (editable || totalCommentCount > 0))

  const metadataActionVisibilityClassName =
    "opacity-0 transition-opacity pointer-events-none group-focus-within/metadata:opacity-100 group-focus-within/metadata:pointer-events-auto group-has-[[data-state=open]]/metadata:opacity-100 group-has-[[data-state=open]]/metadata:pointer-events-auto group-hover/metadata:opacity-100 group-hover/metadata:pointer-events-auto"

  return (
    <section className="group/metadata" contentEditable={false}>
      {cover ? (
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
        className={`${contentClassName ?? ""} px-5 py-6 sm:px-8 md:px-20 md:py-8 lg:px-24`}
      >
        {showMetadataActions ? (
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
            {commentsEnabled &&
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

        <div className="flex items-start gap-3">
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
              }
            }}
            placeholder="New page"
            readOnly={!editable}
            ref={titleRef}
            rows={1}
            value={title}
          />
        </div>

        {commentsEnabled && showCommentsSection ? (
          <div className="mt-6 space-y-0 pb-3">
            {unresolvedThreads.length > 0 ? (
              unresolvedThreads.map((item, index) => (
                <div
                  className={
                    index > 0 ? "mt-5 border-t border-border pt-4" : ""
                  }
                  key={item.thread!.id}
                >
                  <PageCommentThread
                    placeholder={index === 0 ? "Add a comment..." : "Reply..."}
                    threadId={item.thread!.id}
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

        {propertyPayload?.properties.length ? (
          <div className="mt-6 grid gap-1 border-y py-2">
            {propertyPayload.properties.map((property) => {
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
                    <PropertyIcon />
                    <span className="truncate">{property.name}</span>
                  </span>
                  <div className="min-w-0">
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
                          onCheckedChange={(nextChecked) =>
                            commitPropertyValue(
                              property.id,
                              property.type,
                              nextChecked === true ? "true" : "false"
                            )
                          }
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
                        onChange={(nextValue) =>
                          setDraftValues((drafts) => ({
                            ...drafts,
                            [property.id]: nextValue,
                          }))
                        }
                        onCommit={() =>
                          commitPropertyValue(property.id, property.type, inputValue)
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
