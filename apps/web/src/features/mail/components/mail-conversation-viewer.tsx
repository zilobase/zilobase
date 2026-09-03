import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { MailLabelRecord, MailMessageRecord, MailModifyRequest, MailThreadSummary } from "@zilobase/features/mail"
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { getApiErrorMessage } from "@/features/desktop/network/api"
import {
  ArchiveIcon,
  ChevronDown,
  ChevronUp,
  ChevronsRightIcon,
  DownloadIcon,
  MailIcon,
  MoreHorizontalIcon,
  Paperclip,
  StarIcon,
  TrashIcon,
  TriangleAlertIcon,
  XIcon,
} from "@/shared/components/icons"
import { EmbeddedItemPresentationDropdown } from "@/features/pages/components"
import { useThemeFamily } from "@/shared/providers/theme-family-provider"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Separator } from "@/shared/ui/separator"

import { MailActionButton, MailLabelMenu, showMailError } from "./mail-actions"
import { MailboxLoading } from "./mail-connection-state"
import { applyMailDocumentTheme } from "../model/mail-document-theme"
import { sanitizeMailHtml } from "../model/mail-html"
import { forwardSeed, replySeed, type MailComposeSeed } from "../model/mail-compose"
import { formatBytes, formatMessageDate } from "../model/mail-view-model"

export type ConversationProps = {
  labels: MailLabelRecord[]
  messages: MailMessageRecord[]
  mode: EmbeddedItemsOpenAs
  mutating: boolean
  nextDisabled: boolean
  onActOnMessage: (messageId: string, action: "restore" | "trash") => Promise<void>
  onActOnThread: (threadId: string, action: "restore" | "trash") => Promise<void>
  onClose: () => void
  onDownload: (messageId: string, attachmentId: string, filename: string) => Promise<void>
  onLoadInlineAttachment: (messageId: string, attachmentId: string) => Promise<string>
  onModeChange: (mode: EmbeddedItemsOpenAs) => void
  onCompose: (seed: MailComposeSeed) => void
  onModifyMessage: (messageId: string, modification: MailModifyRequest) => Promise<void>
  onModifyThread: (threadId: string, modification: MailModifyRequest) => Promise<void>
  onNext: () => void
  onPrevious: () => void
  online: boolean
  ownEmail: string
  previousDisabled: boolean
  propertyBar?: ReactNode
  thread: MailThreadSummary
}

export function ConversationViewer(props: ConversationProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-surface-canvas dark:bg-surface-navigation">
      <header className="sticky top-0 z-10 flex h-12 bg-surface-canvas dark:bg-surface-navigation"><ConversationToolbar {...props} /></header>
      <ConversationBody {...props} />
    </div>
  )
}

export function ConversationToolbar({ labels, mode, mutating, nextDisabled, onActOnThread, onClose, onModifyThread, onModeChange, onNext, onPrevious, online, previousDisabled, thread }: ConversationProps) {
  const CloseIcon = mode === "sidepanel" ? ChevronsRightIcon : XIcon
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1 px-2">
      <Button aria-label="Close message" onClick={onClose} size="icon" title="Close" type="button" variant="ghost"><CloseIcon /></Button>
      <EmbeddedItemPresentationDropdown itemLabel="mail" mode={mode} onSelect={onModeChange} />
      <Separator className="mx-1 data-[orientation=vertical]:h-4" orientation="vertical" />
      <Button aria-label="Open previous message" disabled={previousDisabled} onClick={onPrevious} size="icon" title="Previous message" type="button" variant="ghost"><ChevronUp /></Button>
      <Button aria-label="Open next message" disabled={nextDisabled} onClick={onNext} size="icon" title="Next message" type="button" variant="ghost"><ChevronDown /></Button>
      <Separator className="mx-1 data-[orientation=vertical]:h-4" orientation="vertical" />
      <MailActionButton disabled={!online || mutating} icon={<MailIcon />} label={thread.unread ? "Mark read" : "Mark unread"} onClick={() => onModifyThread(thread.id, thread.unread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })} />
      <MailActionButton disabled={!online || mutating} icon={<StarIcon weight={thread.starred ? "fill" : "regular"} />} label={thread.starred ? "Unstar" : "Star"} onClick={() => onModifyThread(thread.id, thread.starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] })} />
      <MailActionButton disabled={!online || mutating} icon={<ArchiveIcon />} label="Archive" onClick={() => onModifyThread(thread.id, { removeLabelIds: ["INBOX"] })} />
      <MailLabelMenu labels={labels} modificationTarget={thread} mutating={mutating} onToggle={(labelId, active) => onModifyThread(thread.id, active ? { removeLabelIds: [labelId] } : { addLabelIds: [labelId] })} online={online} />
      <MailActionButton disabled={!online || mutating} icon={<TriangleAlertIcon />} label="Move to spam" onClick={() => onModifyThread(thread.id, { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] })} />
      <MailActionButton disabled={!online || mutating} icon={thread.labelIds.includes("TRASH") ? <ArchiveIcon /> : <TrashIcon />} label={thread.labelIds.includes("TRASH") ? "Restore" : "Move to trash"} onClick={() => onActOnThread(thread.id, thread.labelIds.includes("TRASH") ? "restore" : "trash")} />
    </div>
  )
}

export function ConversationBody({ labels, messages, mutating, onActOnMessage, onCompose, onDownload, onLoadInlineAttachment, onModifyMessage, online, ownEmail, propertyBar, thread }: ConversationProps) {
  const latestMessageId = messages.at(-1)?.id ?? null
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => latestMessageId ? new Set([latestMessageId]) : new Set())

  useEffect(() => {
    setExpandedMessageIds(latestMessageId ? new Set([latestMessageId]) : new Set())
  }, [latestMessageId, thread.id])

  const toggleMessage = (messageId: string) => {
    setExpandedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  return (
    <div className="w-full bg-surface-canvas dark:bg-surface-navigation">
      <article className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-7">
        <h2 className="text-xl font-semibold leading-7 text-content-primary">{thread.subject}</h2>
        {propertyBar}
        {!messages.length ? <MailboxLoading /> : messages.map((message) => (
          <MailThreadMessage
            expanded={expandedMessageIds.has(message.id)}
            key={message.id}
            labels={labels}
            message={message}
            mutating={mutating}
            onActOnMessage={onActOnMessage}
            onCompose={onCompose}
            onDownload={onDownload}
            onLoadInlineAttachment={onLoadInlineAttachment}
            onModifyMessage={onModifyMessage}
            onToggle={() => toggleMessage(message.id)}
            online={online}
            ownEmail={ownEmail}
          />
        ))}
      </article>
    </div>
  )
}

function MailThreadMessage({ expanded, labels, message, mutating, onActOnMessage, onCompose, onDownload, onLoadInlineAttachment, onModifyMessage, onToggle, online, ownEmail }: {
  expanded: boolean
  labels: MailLabelRecord[]
  message: MailMessageRecord
  mutating: boolean
  onActOnMessage: ConversationProps["onActOnMessage"]
  onCompose: ConversationProps["onCompose"]
  onDownload: ConversationProps["onDownload"]
  onLoadInlineAttachment: ConversationProps["onLoadInlineAttachment"]
  onModifyMessage: ConversationProps["onModifyMessage"]
  onToggle: () => void
  online: boolean
  ownEmail: string
}) {
  const sender = message.from?.name || message.from?.address || "Unknown sender"
  const recipients = message.to.map((address) => address.name || address.address).join(", ") || "me"
  return (
    <section className="mt-3 rounded-xl border border-stroke-default bg-surface-canvas px-4 py-3 first:mt-5 dark:bg-surface-navigation" data-mail-message-expanded={expanded ? "true" : "false"}>
      <div className="flex min-w-0 items-start gap-2">
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} message from ${sender}`}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-focus-ring"
          onClick={onToggle}
          type="button"
        >
          <ChevronDown className={`mt-0.5 size-4 shrink-0 text-content-secondary transition-transform ${expanded ? "rotate-180" : ""}`} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-3">
              <span className="max-w-40 shrink-0 truncate text-sm font-medium text-content-primary">{sender}</span>
              {!expanded ? <span className="min-w-0 flex-1 truncate text-sm text-content-secondary">{message.snippet || "No message preview"}</span> : null}
              {!expanded && message.attachments.length ? <Paperclip className="size-3.5 shrink-0 text-content-secondary" /> : null}
            </span>
            {expanded ? <span className="block truncate text-xs text-content-secondary">to {recipients}</span> : null}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <time className="whitespace-nowrap text-xs text-content-secondary">{formatMessageDate(message.internalDate)}</time>
          <MailMessageActions labels={labels} message={message} mutating={mutating} onAction={onActOnMessage} onModify={onModifyMessage} online={online} />
        </div>
      </div>
      {expanded ? (
        <div>
          <MailMessageBody message={message} onLoadInlineAttachment={onLoadInlineAttachment} online={online} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!online} onClick={() => onCompose(replySeed(message, ownEmail))} size="sm" type="button" variant="outline">Reply</Button>
            <Button disabled={!online} onClick={() => onCompose(replySeed(message, ownEmail, true))} size="sm" type="button" variant="outline">Reply all</Button>
            <Button disabled={!online} onClick={() => onCompose(forwardSeed(message))} size="sm" type="button" variant="outline">Forward</Button>
          </div>
          {message.attachments.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <Button
                  disabled={!online}
                  key={attachment.attachmentId}
                  onClick={() => void onDownload(message.id, attachment.attachmentId, attachment.filename).catch((error) => toast.error(getApiErrorMessage(error)))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <DownloadIcon /> {attachment.filename} <span className="text-content-secondary">{formatBytes(attachment.size)}</span>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function MailMessageActions({ labels, message, mutating, onAction, onModify, online }: {
  labels: MailLabelRecord[]
  message: MailMessageRecord
  mutating: boolean
  onAction: (messageId: string, action: "restore" | "trash") => Promise<void>
  onModify: (messageId: string, modification: MailModifyRequest) => Promise<void>
  online: boolean
}) {
  const run = (operation: Promise<unknown>) => void operation.catch(showMailError)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Message actions" disabled={!online || mutating} size="icon-sm" type="button" variant="ghost"><MoreHorizontalIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run(onModify(message.id, message.labelIds.includes("UNREAD") ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] }))}>{message.labelIds.includes("UNREAD") ? "Mark read" : "Mark unread"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onModify(message.id, message.labelIds.includes("STARRED") ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] }))}>{message.labelIds.includes("STARRED") ? "Unstar" : "Star"}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onModify(message.id, { removeLabelIds: ["INBOX"] }))}>Archive</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(onModify(message.id, { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] }))}>Move to spam</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Labels</DropdownMenuLabel>
        {labels.filter((label) => label.type === "user").map((label) => (
          <DropdownMenuCheckboxItem
            checked={message.labelIds.includes(label.id)}
            key={label.id}
            onCheckedChange={() => run(onModify(message.id, message.labelIds.includes(label.id) ? { removeLabelIds: [label.id] } : { addLabelIds: [label.id] }))}
          >
            {label.name}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run(onAction(message.id, message.labelIds.includes("TRASH") ? "restore" : "trash"))}>{message.labelIds.includes("TRASH") ? "Restore from trash" : "Move to trash"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


function MailMessageBody({ message, onLoadInlineAttachment, online }: {
  message: MailMessageRecord
  onLoadInlineAttachment: (messageId: string, attachmentId: string) => Promise<string>
  online: boolean
}) {
  const frameObserver = useRef<ResizeObserver | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const { resolvedTheme } = useTheme()
  const { themeFamily } = useThemeFamily()
  const [inlineImageUrls, setInlineImageUrls] = useState<Record<string, string>>({})
  const inlineAttachments = useMemo(
    () => message.attachments.filter((attachment) => attachment.inline && attachment.contentId),
    [message.attachments],
  )
  const inlineAttachmentKey = inlineAttachments
    .map((attachment) => `${attachment.attachmentId}:${attachment.contentId}`)
    .join("|")
  const renderedHtml = useMemo(
    () => message.bodyHtml ? sanitizeMailHtml(message.bodyHtml, { inlineImageUrls, loadExternalImages: true }) : "",
    [inlineImageUrls, message.bodyHtml],
  )
  const applyFrameTheme = useCallback((frame: HTMLIFrameElement) => {
    const document = frame.contentDocument
    if (!document) return
    const frameStyle = window.getComputedStyle(frame)
    applyMailDocumentTheme(document, {
      backgroundColor: frameStyle.backgroundColor,
      textColor: frameStyle.color,
    })
  }, [])
  useEffect(() => () => frameObserver.current?.disconnect(), [])
  useEffect(() => {
    const frame = frameRef.current
    if (!frame?.contentDocument) return
    applyFrameTheme(frame)
    const animationFrame = window.requestAnimationFrame(() => applyFrameTheme(frame))
    return () => window.cancelAnimationFrame(animationFrame)
  }, [applyFrameTheme, resolvedTheme, themeFamily])
  useEffect(() => {
    setInlineImageUrls({})
    if (!online || !inlineAttachments.length) return
    let active = true
    const objectUrls: string[] = []
    void Promise.all(inlineAttachments.map(async (attachment) => {
      const url = await onLoadInlineAttachment(message.id, attachment.attachmentId)
      objectUrls.push(url)
      return [attachment.contentId!, url] as const
    })).then((entries) => {
      if (active) setInlineImageUrls(Object.fromEntries(entries))
      else for (const url of objectUrls) URL.revokeObjectURL(url)
    }).catch((error) => {
      for (const url of objectUrls) URL.revokeObjectURL(url)
      if (active) toast.error(getApiErrorMessage(error), { id: `mail-inline-images-${message.id}` })
    })
    return () => {
      active = false
      for (const url of objectUrls) URL.revokeObjectURL(url)
    }
  }, [inlineAttachmentKey, message.id, onLoadInlineAttachment, online])

  if (!message.hasFullBody) return <p className="mt-4 text-sm text-content-secondary">Connect to load this message.</p>
  if (message.bodyHtml) {
    return (
      <div className="mt-4">
        <iframe
          className="block h-px w-full overflow-hidden border-0 bg-surface-canvas text-content-primary dark:bg-surface-navigation"
          onLoad={(event) => {
            frameObserver.current?.disconnect()
            const frame = event.currentTarget
            const document = frame.contentDocument
            if (!document) return
            applyFrameTheme(frame)
            const resize = () => {
              frame.style.height = "1px"
              const height = `${Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1)}px`
              if (frame.style.height !== height) frame.style.height = height
            }
            resize()
            window.requestAnimationFrame(resize)
            frameObserver.current = new ResizeObserver(resize)
            frameObserver.current.observe(document.body)
          }}
          referrerPolicy="no-referrer"
          ref={frameRef}
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          scrolling="no"
          srcDoc={renderedHtml}
          title={`Message from ${message.from?.name || message.from?.address || "sender"}`}
        />
      </div>
    )
  }
  return <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-content-primary">{message.bodyText || message.snippet}</div>
}
