"use client"

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { ThreadAvatar, ThreadLine } from "@/components/ui/thread-line"
import {
  ArrowUp,
  AtSign,
  Check,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCcw,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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

import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  filterCommentMentionMembers,
  getCommentMentionLabels,
  getCommentMentionTrigger,
  insertCommentMention,
  tokenizeCommentMentions,
  type CommentMentionMember,
} from "@/components/page-comment-mentions"
import { useOptionalPageEditorComments } from "@/components/page-editor-comments"
import { useSession } from "@notelab/features/auth"
import {
  usePagePersonAccessTargets,
} from "@notelab/features/pages"
import { usePageCommentController, usePageCommentsSnapshot } from "@/contexts/page-comments-registry"
import type { CommentAuthorSnapshot, CommentMessageSnapshot } from "@/comments/yjs-comments"
import { toast } from "sonner"

type CommentAuthor = CommentAuthorSnapshot
type PageCommentMessage = CommentMessageSnapshot

type CommentAvatarAuthor =
  | Pick<CommentAuthor, "email" | "id" | "image" | "name">
  | { email?: string | null; id?: string | null; image?: string | null; name?: string | null }
  | null

export function CommentAvatar({
  author,
  authorId,
  small = false,
}: {
  author: CommentAvatarAuthor
  authorId?: string | null
  small?: boolean
}) {
  const label = getCommentAuthorName(author)

  return (
    <Avatar aria-hidden size={small ? "sm" : "default"}>
      {author?.image ? <AvatarImage alt={label} src={author.image} /> : null}
      <AvatarFallback gradientSeed={getCommentAvatarSeed(author, authorId, label)}>
        {getCommentInitials(label)}
      </AvatarFallback>
    </Avatar>
  )
}

type CommentItemProps = {
  canEdit: boolean
  canReact: boolean
  canResolve: boolean
  className?: string
  comment: PageCommentMessage
  editingBody: string | null
  isMutating: boolean
  mentionLabels?: string[]
  onCancelEdit: () => void
  onAddReaction: (emoji: string) => void
  onDelete: () => void
  onEdit: () => void
  onEditingBodyChange: (body: string) => void
  onResolve: () => void
  onRemoveReaction: (emoji: string) => void
  onSaveEdit: () => void
  onUnresolve?: () => void
  showResolveUnresolve?: boolean
}

function CommentItemComponent({
  canEdit,
  canReact,
  canResolve,
  className,
  comment,
  editingBody,
  isMutating,
  mentionLabels,
  onCancelEdit,
  onAddReaction,
  onDelete,
  onEdit,
  onEditingBodyChange,
  onResolve,
  onRemoveReaction,
  onSaveEdit,
  onUnresolve,
  showResolveUnresolve = true,
}: CommentItemProps) {
  const isEditing = editingBody !== null
  const reactions = comment.reactions ?? []
  const commentTextParts = useMemo(
    () => tokenizeCommentMentions(comment.body, mentionLabels ?? []),
    [comment.body, mentionLabels],
  )

  return (
    <article className={`group/comment relative flex min-h-16 gap-2 pb-3 ${className || ""}`}>
      <ThreadAvatar>
        <CommentAvatar
          author={comment.author ?? null}
          authorId={comment.authorId}
          small
        />
      </ThreadAvatar>
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
          {(canReact || canEdit || (showResolveUnresolve && (canResolve || onUnresolve))) && !isEditing ? (
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
                    variant="ghost"
                  >
                    <Check />
                  </Button>
                ) : null}
                {onUnresolve ? (
                  <Button
                    aria-label="Unresolve thread"
                    className="text-muted-foreground"
                    disabled={isMutating}
                    onClick={onUnresolve}
                    size="icon-sm"
                    title="Unresolve"
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw className="size-4" />
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
          <div className="mt-1 flex items-end gap-2">
            <Textarea
              aria-label="Edit comment"
              className="min-h-8 flex-1 resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-1 text-sm leading-6 shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
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
            <div className="flex shrink-0 items-center gap-1 pb-1 text-muted-foreground">
              <Button
                aria-label="Cancel edit"
                className="text-muted-foreground"
                disabled={isMutating}
                onClick={onCancelEdit}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
              <Button
                aria-label="Save edited comment"
                className="rounded-full"
                disabled={isMutating || !editingBody?.trim()}
                onClick={onSaveEdit}
                size="icon-sm"
                type="button"
                variant="default"
              >
                <Check />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-foreground">
              <CommentMentionText parts={commentTextParts} />
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

export const CommentItem = memo(
  CommentItemComponent,
  (previous, next) =>
    previous.canEdit === next.canEdit &&
    previous.canReact === next.canReact &&
    previous.canResolve === next.canResolve &&
    previous.className === next.className &&
    previous.comment === next.comment &&
    previous.editingBody === next.editingBody &&
    previous.isMutating === next.isMutating &&
    previous.mentionLabels === next.mentionLabels &&
    Boolean(previous.onUnresolve) === Boolean(next.onUnresolve) &&
    previous.showResolveUnresolve === next.showResolveUnresolve,
)

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

function CommentMentionMenu({
  members,
  onSelect,
  selectedIndex,
  setSelectedIndex,
}: {
  members: CommentMentionMember[]
  onSelect: (member: CommentMentionMember) => void
  selectedIndex: number
  setSelectedIndex: (index: number) => void
}) {
  const selectedItemRef = useRef<HTMLDivElement | null>(null)
  const selectedMember = members[selectedIndex]

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  return (
    <div className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-4rem))] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <Command
        shouldFilter={false}
        value={selectedMember?.id ?? ""}
        onValueChange={(value) => {
          const nextIndex = members.findIndex((member) => member.id === value)

          if (nextIndex >= 0) {
            setSelectedIndex(nextIndex)
          }
        }}
      >
        <CommandList className="max-h-60">
          <CommandEmpty>No people found.</CommandEmpty>
          <CommandGroup>
            {members.map((member, index) => {
              const label = member.name || member.email

              return (
                <CommandItem
                  aria-selected={index === selectedIndex}
                  className={
                    index === selectedIndex ? "bg-muted text-foreground" : ""
                  }
                  key={member.id}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onSelect(member)
                  }}
                  onSelect={() => onSelect(member)}
                  ref={index === selectedIndex ? selectedItemRef : undefined}
                  value={member.id}
                >
                  <CommentAvatar author={member} small />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

function CommentMentionText({
  parts,
}: {
  parts: Array<{ isMention: boolean; text: string }>
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.isMention ? (
          <span className="text-muted-foreground" key={`${part.text}-${index}`}>
            {part.text}
          </span>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function formatCommentButtonLabel(commentCount: number) {
  if (commentCount === 0) {
    return "Add comment"
  }

  return `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`
}

export function getCommentAuthorName(author: CommentAvatarAuthor) {
  return author?.name?.trim() || author?.email?.trim() || "Unknown"
}

function getCommentAvatarSeed(
  author: CommentAvatarAuthor,
  authorId: string | null | undefined,
  label: string,
) {
  return author?.id?.trim() || authorId?.trim() || label
}

export function getCommentInitials(label: string) {
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

export function formatCommentTime(value: string) {
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

function runCommentAction(action: () => void) {
  try {
    action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not update comment")
  }
}

// ------------------------------------------------------------------
// PageCommentThread: reusable full "comment thread" UI + setup
// This encapsulates fetching, local composer/edit state, all mutations
// (create, update, delete, reactions, resolve/unresolve), the vertical
// thread line, mapped rich CommentItems (with hover button groups for
// resolve/unresolve etc), and the reply composer.
// Use this anywhere you want the complete interactive thread experience
// for a page (sidebar current/past threads, etc).
// ------------------------------------------------------------------

export function PageCommentThread({
  pageId,
  threadId,
  label,
  className,
  placeholder = "Reply...",
  onThreadResolved,
  onThreadCreated,
  collapseLongThreads = false,
  newThreadKind = "page",
}: {
  pageId?: string | null
  threadId?: string | null
  label?: string
  className?: string
  placeholder?: string
  onThreadResolved?: () => void
  onThreadCreated?: (threadId: string) => void
  collapseLongThreads?: boolean
  newThreadKind?: "inline" | "page"
}) {
  const editorComments = useOptionalPageEditorComments()
  const { data: session } = useSession()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const controller = usePageCommentController(pageId)
  const commentsSnapshot = usePageCommentsSnapshot(pageId)
  const { data: accessTargets } = usePagePersonAccessTargets(
    pageId ?? null
  )

  const thread = threadId
    ? commentsSnapshot.threads.find((item) => item.id === threadId) ?? null
    : null
  const comments = thread?.comments ?? []
  const commentsLoading = Boolean(pageId && !controller)

  const [newCommentBody, setNewCommentBody] = useState("")
  const [newCommentCursor, setNewCommentCursor] = useState(0)
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(
    null
  )
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [threadExpanded, setThreadExpanded] = useState(false)
  const [editingComment, setEditingComment] = useState<{
    body: string
    id: string
  } | null>(null)

  useEffect(() => {
    setThreadExpanded(false)
  }, [threadId, comments.length])

  const mentionTrigger = useMemo(
    () => getCommentMentionTrigger(newCommentBody, newCommentCursor),
    [newCommentBody, newCommentCursor],
  )
  const mentionKey = mentionTrigger
    ? `${mentionTrigger.start}:${mentionTrigger.query}`
    : null
  const activeMentionTrigger =
    mentionTrigger && mentionKey !== dismissedMentionKey ? mentionTrigger : null
  const mentionMembers = useMemo(
    () =>
      filterCommentMentionMembers(
        accessTargets?.members ?? [],
        session?.user?.id,
        activeMentionTrigger?.query ?? "",
      ),
    [accessTargets?.members, activeMentionTrigger?.query, session?.user?.id],
  )
  const mentionMenuOpen = Boolean(activeMentionTrigger)
  const mentionLabels = useMemo(
    () => getCommentMentionLabels(accessTargets?.members ?? []),
    [accessTargets?.members],
  )
  const newCommentTextParts = useMemo(
    () =>
      newCommentBody.includes("@")
        ? tokenizeCommentMentions(newCommentBody, mentionLabels)
        : [],
    [mentionLabels, newCommentBody],
  )
  const showMentionHighlight = newCommentTextParts.some(
    (part) => part.isMention,
  )

  useEffect(() => {
    setSelectedMentionIndex(0)
  }, [activeMentionTrigger?.query, mentionMembers.length])

  const focusCommentInput = (cursor: number) => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(cursor, cursor)
      setNewCommentCursor(cursor)
    })
  }

  const syncCommentInputCursor = () => {
    const input = inputRef.current

    if (input) {
      const cursor = input.selectionStart ?? input.value.length
      setNewCommentCursor((current) => current === cursor ? current : cursor)
    }
  }

  const isMutating = false

  const threadResolved = Boolean(thread?.resolvedAt)
  const hasComments = comments.length > 0
  const threadLineClassName =
    pageId && !threadResolved
      ? "bg-muted-foreground/70"
      : "bg-muted-foreground/40"

  const createComment = () => {
    const body = newCommentBody.trim()
    if (!controller || !body) return

    runCommentAction(() => {
      if (thread) controller.reply(thread.id, body)
      else {
        const createdThreadId = newThreadKind === "inline"
          ? controller.createInlineThread(body)
          : controller.createPageThread(body)
        if (!createdThreadId) throw new Error("Select text before adding an inline comment")
        onThreadCreated?.(createdThreadId)
      }
      setNewCommentBody("")
      setNewCommentCursor(0)
      setDismissedMentionKey(null)
    })
  }

  const selectMentionMember = (member: CommentMentionMember) => {
    if (!activeMentionTrigger) {
      return
    }

    const label = member.name || member.email
    const next = insertCommentMention(
      newCommentBody,
      activeMentionTrigger,
      label,
    )

    setNewCommentBody(next.value)
    setDismissedMentionKey(null)
    focusCommentInput(next.cursor)
  }

  const openMentionPicker = () => {
    const input = inputRef.current
    const cursor = input?.selectionStart ?? newCommentBody.length
    const existingTrigger = getCommentMentionTrigger(newCommentBody, cursor)

    if (existingTrigger) {
      setNewCommentCursor(cursor)
      setDismissedMentionKey(null)
      focusCommentInput(cursor)
      return
    }

    const needsSeparator =
      cursor > 0 && !/\s/.test(newCommentBody.charAt(cursor - 1))
    const insertedText = `${needsSeparator ? " " : ""}@`
    const nextValue =
      newCommentBody.slice(0, cursor) +
      insertedText +
      newCommentBody.slice(cursor)
    const nextCursor = cursor + insertedText.length

    setNewCommentBody(nextValue)
    setDismissedMentionKey(null)
    focusCommentInput(nextCursor)
  }

  const saveEditedComment = () => {
    const body = editingComment?.body.trim()
    if (!controller || !thread || !editingComment || !body) return

    runCommentAction(() => {
      controller.editMessage(thread.id, editingComment.id, body)
      setEditingComment(null)
    })
  }

  const removeComment = (commentId: string) => {
    if (!controller || !thread) return
    runCommentAction(() => controller.deleteMessage(thread.id, commentId))
  }

  const addCommentReaction = (commentId: string, emoji: string) => {
    if (!controller || !thread) return
    runCommentAction(() => controller.addReaction(thread.id, commentId, emoji))
  }

  const removeCommentReaction = (commentId: string, emoji: string) => {
    if (!controller || !thread) return
    runCommentAction(() => controller.removeReaction(thread.id, commentId, emoji))
  }

  const resolveThread = () => {
    if (!controller || !thread) return
    runCommentAction(() => {
      controller.resolveThread(thread.id)
      onThreadResolved?.()
    })
  }

  const unresolveThread = () => {
    if (!controller || !thread) return
    runCommentAction(() => {
      controller.unresolveThread(thread.id)
      editorComments?.requestEditorComments()
    })
  }

  const shouldCollapse =
    collapseLongThreads && comments.length > 3 && !threadExpanded
  const hiddenReplyCount = Math.max(0, comments.length - 3)

  const visibleComments = useMemo(() => {
    if (!shouldCollapse) {
      return comments
    }

    return [comments[0], ...comments.slice(-2)]
  }, [comments, shouldCollapse])

  const renderCommentItem = (comment: (typeof comments)[number], index: number) => {
    const isRoot = index === 0
    return (
      <CommentItem
        key={comment.id}
        canEdit={Boolean(
          controller?.canEdit &&
            (controller.canModerate ||
              (comment.authorId && comment.authorId === session?.user?.id))
        )}
        canReact={Boolean(controller?.canEdit)}
        canResolve={Boolean(controller?.canEdit && !threadResolved && isRoot && thread)}
        comment={comment}
        editingBody={
          editingComment?.id === comment.id ? editingComment.body : null
        }
        isMutating={isMutating}
        mentionLabels={mentionLabels}
        onAddReaction={(emoji) => addCommentReaction(comment.id, emoji)}
        onCancelEdit={() => setEditingComment(null)}
        onDelete={() => removeComment(comment.id)}
        onEdit={() =>
          comment.body &&
          setEditingComment({ body: comment.body, id: comment.id })
        }
        onEditingBodyChange={(body) =>
          setEditingComment((cur) =>
            cur?.id === comment.id ? { ...cur, body } : cur
          )
        }
        onRemoveReaction={(emoji) => removeCommentReaction(comment.id, emoji)}
        onResolve={resolveThread}
        onSaveEdit={saveEditedComment}
        onUnresolve={controller?.canEdit && threadResolved && isRoot ? unresolveThread : undefined}
        showResolveUnresolve
      />
    )
  }

  return (
    <div className={className}>
      {label ? (
        <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      ) : null}

      {commentsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-9 w-1/2" />
        </div>
      ) : (
        <>
          <div className="relative">
            {hasComments ? <ThreadLine className={threadLineClassName} /> : null}
            {hasComments ? (
              <div className="space-y-0 bg-transparent">
                {shouldCollapse ? (
                  <>
                    {renderCommentItem(visibleComments[0], 0)}
                    <div className="pb-1 pl-8">
                      <Button
                        className="h-7 px-2 text-muted-foreground"
                        onClick={() => setThreadExpanded(true)}
                        type="button"
                        variant="ghost"
                      >
                        Show {hiddenReplyCount}{" "}
                        {hiddenReplyCount === 1 ? "reply" : "replies"}
                      </Button>
                    </div>
                    {visibleComments.slice(1).map((comment, offset) =>
                      renderCommentItem(comment, comments.length - 2 + offset)
                    )}
                  </>
                ) : (
                  comments.map((comment, index) =>
                    renderCommentItem(comment, index)
                  )
                )}
              </div>
            ) : null}

            {/* Reply composer for the current (active) thread.
                The single ThreadLine spans to the reply avatar center. */}
            {pageId && controller?.canEdit && !threadResolved ? (
              <div className="mt-1 flex items-center gap-2 pt-1.5">
                <ThreadAvatar>
                  <CommentAvatar author={session?.user ?? null} small />
                </ThreadAvatar>
                <div className="relative min-w-0 flex-1">
                  {showMentionHighlight && !mentionMenuOpen ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre text-sm text-foreground"
                    >
                      <CommentMentionText parts={newCommentTextParts} />
                    </div>
                  ) : null}
                  <input
                    className={`relative w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none ${
                      showMentionHighlight && !mentionMenuOpen
                        ? "text-transparent caret-foreground"
                        : "text-foreground"
                    }`}
                    disabled={isMutating}
                    onChange={(event) => {
                      setNewCommentBody(event.target.value)
                      setNewCommentCursor((current) => {
                        const cursor =
                          event.target.selectionStart ?? event.target.value.length
                        return current === cursor ? current : cursor
                      })
                      setDismissedMentionKey(null)
                    }}
                    onClick={syncCommentInputCursor}
                    onKeyDown={(event) => {
                      if (mentionMenuOpen) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault()
                          setSelectedMentionIndex((index) =>
                            mentionMembers.length
                              ? (index + 1) % mentionMembers.length
                              : 0,
                          )
                          return
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault()
                          setSelectedMentionIndex((index) =>
                            mentionMembers.length
                              ? (index - 1 + mentionMembers.length) %
                                mentionMembers.length
                              : 0,
                          )
                          return
                        }

                        if (event.key === "Escape") {
                          event.preventDefault()
                          setDismissedMentionKey(mentionKey)
                          return
                        }

                        if (
                          (event.key === "Enter" || event.key === "Tab") &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()

                          const selectedMember =
                            mentionMembers[selectedMentionIndex]

                          if (selectedMember) {
                            selectMentionMember(selectedMember)
                          } else {
                            setDismissedMentionKey(mentionKey)
                          }

                          return
                        }
                      }

                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        createComment()
                      }
                    }}
                    onKeyUp={syncCommentInputCursor}
                    onSelect={syncCommentInputCursor}
                    placeholder={placeholder}
                    ref={inputRef}
                    value={newCommentBody}
                  />
                  {mentionMenuOpen ? (
                    <CommentMentionMenu
                      members={mentionMembers}
                      onSelect={selectMentionMember}
                      selectedIndex={selectedMentionIndex}
                      setSelectedIndex={setSelectedMentionIndex}
                    />
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                  <Button
                    aria-label="Attach file"
                    className="text-muted-foreground"
                    disabled={isMutating}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Paperclip className="size-4" />
                  </Button>
                  <Button
                    aria-label="Mention person"
                    className="text-muted-foreground"
                    disabled={isMutating}
                    onClick={openMentionPicker}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <AtSign className="size-4" />
                  </Button>
                  <Button
                    aria-label="Send reply"
                    className="h-7 w-7 rounded-full bg-white text-black hover:bg-white/90"
                    disabled={isMutating || !newCommentBody.trim()}
                    onClick={createComment}
                    size="icon-sm"
                    type="button"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
