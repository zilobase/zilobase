import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowUp,
  AtSign,
  Check,
  ImagePlus,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useSession } from "@notelab/features/auth"
import {
  useAddWorkspaceCommentReaction,
  useCreateWorkspaceComment,
  useDeleteWorkspaceComment,
  useRemoveWorkspaceCommentReaction,
  useResolveWorkspaceCommentThread,
  useUpdateWorkspaceComment,
  useUpdateWorkspacePropertyValue,
  useWorkspaceComments,
  useWorkspacePersonAccessTargets,
  useWorkspaceProperties,
  type CommentAuthor,
  type WorkspaceCommentMessage,
} from "@notelab/features/workspaces"

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

type WorkspaceMetadataProps = {
  contentClassName?: string
  editable?: boolean
  icon?: string
  onIconChange?: (icon: string) => void
  onTitleChange?: (title: string) => void
  title?: string
  workspaceId?: string | null
}

export function WorkspaceMetadata({
  contentClassName,
  editable = true,
  icon: iconProp,
  onIconChange,
  onTitleChange,
  title: titleProp,
  workspaceId,
}: WorkspaceMetadataProps) {
  const [coverVisible, setCoverVisible] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [localIcon, setLocalIcon] = useState("")
  const [localTitle, setLocalTitle] = useState("")
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [newCommentBody, setNewCommentBody] = useState("")
  const [editingComment, setEditingComment] = useState<{
    body: string
    id: string
  } | null>(null)
  const [draftValues, setDraftValues] = useState<Record<string, DatabasePropertyValue>>({})
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const { data: propertyPayload } = useWorkspaceProperties(workspaceId)
  const { data: accessTargets } = useWorkspacePersonAccessTargets(workspaceId)
  const { data: session } = useSession()
  const commentsEnabled = Boolean(workspaceId && session?.user)
  const { data: commentsPayload, isLoading: commentsLoading } =
    useWorkspaceComments(workspaceId, commentsEnabled)
  const createWorkspaceComment = useCreateWorkspaceComment()
  const updateWorkspaceComment = useUpdateWorkspaceComment()
  const deleteWorkspaceComment = useDeleteWorkspaceComment()
  const addWorkspaceCommentReaction = useAddWorkspaceCommentReaction()
  const removeWorkspaceCommentReaction = useRemoveWorkspaceCommentReaction()
  const resolveWorkspaceCommentThread = useResolveWorkspaceCommentThread()
  const updatePropertyValue = useUpdateWorkspacePropertyValue()
  const icon = iconProp ?? localIcon
  const title = titleProp ?? localTitle
  const comments = commentsPayload?.comments ?? []
  const activeCommentCount = comments.length
  const totalCommentCount = comments.length
  const commentsMutating =
    createWorkspaceComment.isPending ||
    updateWorkspaceComment.isPending ||
    deleteWorkspaceComment.isPending ||
    addWorkspaceCommentReaction.isPending ||
    removeWorkspaceCommentReaction.isPending ||
    resolveWorkspaceCommentThread.isPending
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
    if (!workspaceId || !editable) {
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
        workspaceId,
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

  const createComment = () => {
    const body = newCommentBody.trim()

    if (!workspaceId || !editable || !body) {
      return
    }

    createWorkspaceComment.mutate(
      { body, workspaceId },
      {
        onSuccess: () => {
          setNewCommentBody("")
          setCommentsOpen(true)
        },
      }
    )
  }

  const saveEditedComment = () => {
    const body = editingComment?.body.trim()

    if (!workspaceId || !editingComment || !body) {
      return
    }

    updateWorkspaceComment.mutate(
      { body, messageId: editingComment.id, workspaceId },
      {
        onSuccess: () => setEditingComment(null),
      }
    )
  }

  const removeComment = (commentId: string) => {
    if (!workspaceId) {
      return
    }

    deleteWorkspaceComment.mutate({ messageId: commentId, workspaceId })
  }

  const addCommentReaction = (commentId: string, emoji: string) => {
    if (!workspaceId) {
      return
    }

    addWorkspaceCommentReaction.mutate({
      emoji,
      messageId: commentId,
      workspaceId,
    })
  }

  const removeCommentReaction = (commentId: string, emoji: string) => {
    if (!workspaceId) {
      return
    }

    removeWorkspaceCommentReaction.mutate({
      emoji,
      messageId: commentId,
      workspaceId,
    })
  }

  const resolveCommentThread = () => {
    if (!workspaceId || !commentsPayload?.thread) {
      return
    }

    resolveWorkspaceCommentThread.mutate(
      { workspaceId },
      {
        onSuccess: () => {
          setCommentsOpen(false)
          setEditingComment(null)
        },
      }
    )
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
            aria-label="Change workspace icon"
            className="flex size-11 items-center justify-center rounded-md text-3xl transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            disabled={!editable}
            type="button"
          >
            {icon}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto gap-0 overflow-hidden p-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          sideOffset={6}
        >
          <EmojiPicker
            onEmojiSelect={({ emoji }) => {
              updateIcon(emoji)
              setIconOpen(false)
            }}
          >
            <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </PopoverContent>
      </Popover>
      <button
        aria-label="Remove workspace icon"
        className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none group-hover/icon:flex [&_svg]:size-3"
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
        <button
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
          disabled={!editable}
          type="button"
        >
          <SmilePlus />
          Add icon
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto gap-0 overflow-hidden p-0"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <EmojiPicker
          onEmojiSelect={({ emoji }) => {
            updateIcon(emoji)
            setIconOpen(false)
          }}
        >
          <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  ) : null

  return (
    <section contentEditable={false}>
      {coverVisible ? (
        <div className="relative h-40 bg-gradient-to-r from-stone-200 via-neutral-300 to-zinc-200 dark:from-stone-800 dark:via-neutral-700 dark:to-zinc-800">
          <Button
            aria-label="Remove cover"
            className="absolute right-3 top-3 bg-background/80 shadow-sm backdrop-blur"
            disabled={!editable}
            onClick={() => setCoverVisible(false)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <X />
          </Button>
        </div>
      ) : null}

      <div
        className={`${contentClassName ?? ""} px-5 py-6 sm:px-8 md:px-20 md:py-8 lg:px-24`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!icon ? iconPicker : null}
          {!coverVisible && editable ? (
            <Button
              className="text-muted-foreground"
              disabled={!editable}
              onClick={() => setCoverVisible(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ImagePlus />
              Add cover
            </Button>
          ) : null}
          {commentsEnabled && (editable || totalCommentCount > 0) ? (
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
              {formatCommentButtonLabel(activeCommentCount)}
            </Button>
          ) : null}
        </div>

        <div className="flex items-start gap-3">
          {icon ? (
            editable ? (
              iconPicker
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md text-3xl">
                {icon}
              </div>
            )
          ) : null}
          <textarea
            aria-label="Workspace title"
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-4xl font-semibold leading-tight tracking-normal whitespace-pre-wrap text-balance text-foreground shadow-none outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0 dark:bg-transparent"
            onChange={(event) => updateTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            placeholder="New workspace"
            readOnly={!editable}
            ref={titleRef}
            rows={1}
            value={title}
          />
        </div>

        {commentsEnabled && (commentsOpen || totalCommentCount > 0) ? (
          <div className="mt-6 pb-3">
            <div className="relative">
              {!commentsLoading && comments.length > 0 ? (
                <Separator
                  className="absolute left-3 top-3 bottom-4 h-auto"
                  orientation="vertical"
                />
              ) : null}
              {commentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-2/3" />
                  <Skeleton className="h-9 w-1/2" />
                </div>
              ) : comments.length > 0 ? (
                <div className="relative z-10 space-y-0">
                  {comments.map((comment, index) => (
                    <CommentItem
                    canEdit={
                      editable &&
                      Boolean(
                        comment.authorId &&
                          comment.authorId === session?.user?.id
                      )
                    }
                    canReact={editable}
                    canResolve={
                      editable &&
                      index === 0 &&
                        Boolean(commentsPayload?.thread)
                      }
                      comment={comment}
                      editingBody={
                        editingComment?.id === comment.id
                          ? editingComment.body
                          : null
                      }
                    isMutating={commentsMutating}
                    key={comment.id}
                    onCancelEdit={() => setEditingComment(null)}
                    onAddReaction={(emoji) => addCommentReaction(comment.id, emoji)}
                    onDelete={() => removeComment(comment.id)}
                    onEdit={() => {
                      if (comment.body) {
                          setEditingComment({
                            body: comment.body,
                            id: comment.id,
                          })
                        }
                      }}
                      onEditingBodyChange={(body) =>
                        setEditingComment((current) =>
                          current?.id === comment.id
                            ? { ...current, body }
                            : current
                        )
                      }
                    onResolve={resolveCommentThread}
                    onRemoveReaction={(emoji) =>
                      removeCommentReaction(comment.id, emoji)
                    }
                    onSaveEdit={saveEditedComment}
                  />
                  ))}
                </div>
              ) : null}

              {editable ? (
                <form
                  className="group/comment-composer relative z-10 flex min-h-8 gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    createComment()
                  }}
                >
                  <div className="flex w-6 shrink-0 justify-center pt-1.5">
                    <CommentAvatar author={session?.user ?? null} small />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Textarea
                      aria-label="Add a comment"
                      className="min-h-8 flex-1 resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-1 text-sm leading-6 shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
                      disabled={commentsMutating}
                      onChange={(event) => setNewCommentBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()
                          createComment()
                        }
                      }}
                      placeholder="Add a comment..."
                      rows={1}
                      value={newCommentBody}
                    />
                    <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      <Button
                        aria-label="Attach file"
                        className="text-muted-foreground"
                        disabled={commentsMutating}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Paperclip />
                      </Button>
                      <Button
                        aria-label="Mention person"
                        className="text-muted-foreground"
                        disabled={commentsMutating}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <AtSign />
                      </Button>
                      <Button
                        aria-label="Post comment"
                        className="rounded-full"
                        disabled={commentsMutating || !newCommentBody.trim()}
                        size="icon-sm"
                        type="submit"
                        variant="secondary"
                      >
                        <ArrowUp />
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}
            </div>
            <Separator className="mt-3" />
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

type CommentAvatarAuthor =
  | Pick<CommentAuthor, "email" | "image" | "name">
  | { email?: string | null; image?: string | null; name?: string | null }
  | null

function CommentAvatar({
  author,
  small = false,
}: {
  author: CommentAvatarAuthor
  small?: boolean
}) {
  const label = getCommentAuthorName(author)

  return (
    <Avatar aria-hidden size={small ? "sm" : "default"}>
      {author?.image ? <AvatarImage alt={label} src={author.image} /> : null}
      <AvatarFallback className="font-medium">
        {getCommentInitials(label)}
      </AvatarFallback>
    </Avatar>
  )
}

function CommentItem({
  canEdit,
  canReact,
  canResolve,
  comment,
  editingBody,
  isMutating,
  onCancelEdit,
  onAddReaction,
  onDelete,
  onEdit,
  onEditingBodyChange,
  onResolve,
  onRemoveReaction,
  onSaveEdit,
}: {
  canEdit: boolean
  canReact: boolean
  canResolve: boolean
  comment: WorkspaceCommentMessage
  editingBody: string | null
  isMutating: boolean
  onCancelEdit: () => void
  onAddReaction: (emoji: string) => void
  onDelete: () => void
  onEdit: () => void
  onEditingBodyChange: (body: string) => void
  onResolve: () => void
  onRemoveReaction: (emoji: string) => void
  onSaveEdit: () => void
}) {
  const isEditing = editingBody !== null
  const reactions = comment.reactions ?? []

  return (
    <article className="group/comment relative flex min-h-16 gap-2 pb-3">
      <div className="relative flex w-6 shrink-0 justify-center">
        <CommentAvatar author={comment.author ?? null} small />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 pr-28 text-sm leading-5">
          <span className="truncate font-semibold text-foreground">
            {getCommentAuthorName(comment.author ?? null)}
          </span>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {formatCommentTime(comment.createdAt)}
          </span>
          {comment.editedAt ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              (edited)
            </span>
          ) : null}
          {(canReact || canEdit || canResolve) && !isEditing ? (
            <AlertDialog>
              <span className="absolute right-0 top-0 flex shrink-0 items-center gap-1 rounded-xl border bg-background p-1 opacity-0 shadow-sm transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
                {canReact ? (
                  <CommentReactionPicker
                    align="end"
                    disabled={isMutating}
                    onSelect={onAddReaction}
                  >
                    <Button
                      aria-label="Add reaction"
                      className="text-muted-foreground"
                      disabled={isMutating}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <SmilePlus />
                    </Button>
                  </CommentReactionPicker>
                ) : null}
                {canResolve ? (
                  <Button
                    aria-label="Resolve thread"
                    className="text-muted-foreground"
                    disabled={isMutating}
                    onClick={onResolve}
                    size="icon-sm"
                    title="Resolve"
                    type="button"
                    variant="secondary"
                  >
                    <Check />
                  </Button>
                ) : null}
                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="More comment actions"
                        className="text-muted-foreground"
                        disabled={isMutating}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-28"
                      sideOffset={6}
                    >
                      <DropdownMenuItem disabled={isMutating} onClick={onEdit}>
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          disabled={isMutating}
                          onSelect={(event) => event.preventDefault()}
                          variant="destructive"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </span>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the comment.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isMutating}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isMutating}
                    onClick={onDelete}
                    variant="destructive"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        {isEditing ? (
          <div className="mt-1">
            <Textarea
              aria-label="Edit comment"
              className="min-h-16 resize-y text-sm md:text-sm"
              disabled={isMutating}
              onChange={(event) => onEditingBodyChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault()
                  onSaveEdit()
                }

                if (event.key === "Escape") {
                  event.preventDefault()
                  onCancelEdit()
                }
              }}
              value={editingBody}
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <Button
                disabled={isMutating}
                onClick={onCancelEdit}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                aria-label="Save edited comment"
                disabled={isMutating || !editingBody.trim()}
                onClick={onSaveEdit}
                size="sm"
                type="button"
              >
                <Check />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-foreground">
              {comment.body}
            </p>
            {reactions.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {reactions.map((reaction) => (
                  <Button
                    aria-label={`${reaction.emoji} reaction, ${reaction.count}`}
                    className={
                      reaction.reactedByMe
                        ? "h-7 gap-1 rounded-full border-transparent bg-primary/15 px-2 text-primary hover:bg-primary/20 dark:bg-primary/25 dark:hover:bg-primary/30"
                        : "h-7 gap-1 rounded-full bg-muted px-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }
                    disabled={isMutating}
                    key={reaction.emoji}
                    onClick={() =>
                      reaction.reactedByMe
                        ? onRemoveReaction(reaction.emoji)
                        : onAddReaction(reaction.emoji)
                    }
                    size="sm"
                    type="button"
                    variant={reaction.reactedByMe ? "secondary" : "ghost"}
                  >
                    <span className="text-base leading-none">
                      {reaction.emoji}
                    </span>
                    <span className="text-sm tabular-nums">
                      {reaction.count}
                    </span>
                  </Button>
                ))}
                {canReact ? (
                  <CommentReactionPicker
                    disabled={isMutating}
                    onSelect={onAddReaction}
                  >
                    <Button
                      aria-label="Add another reaction"
                      className="h-7 rounded-full bg-muted px-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      disabled={isMutating}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <SmilePlus className="size-4" />
                    </Button>
                  </CommentReactionPicker>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}

function CommentReactionPicker({
  align = "start",
  children,
  disabled,
  onSelect,
}: {
  align?: "center" | "end" | "start"
  children: ReactNode
  disabled: boolean
  onSelect: (emoji: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto gap-0 overflow-hidden p-0"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <EmojiPicker
          onEmojiSelect={({ emoji }) => {
            onSelect(emoji)
            setOpen(false)
          }}
        >
          <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  )
}

function formatCommentButtonLabel(commentCount: number) {
  if (commentCount === 0) {
    return "Add comment"
  }

  return `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`
}

function getCommentAuthorName(author: CommentAvatarAuthor) {
  return author?.name?.trim() || author?.email?.trim() || "Unknown"
}

function getCommentInitials(label: string) {
  const parts = label
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return "?"
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function formatCommentTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (seconds < 60) {
    return "Just now"
  }

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h ago`
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date)
}
