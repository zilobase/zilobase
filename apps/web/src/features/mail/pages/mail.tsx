import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { toast } from "sonner"

import {
  ArchiveIcon,
  CheckIcon,
  ChevronDown,
  ChevronUp,
  ChevronsRightIcon,
  FilterIcon,
  Paperclip,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SlidersHorizontalIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "@/shared/components/icons"
import { EmbeddedItemPresentationDropdown } from "@/features/pages/components"
import { PageSidePaneLayout } from "@/features/pages/context"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"
import { mailViewIcons, mailViewLabels } from "@/features/sidebar"
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages"
import type { MailView } from "@zilobase/features/user-settings"

import { starterMailMessages, type MailMessage } from "../model/mail-data"

const messageGroups = ["Today", "Yesterday", "Earlier"] as const

type MailSelection = {
  id: string
  messageIds: string[]
}

export default function MailPage() {
  const { compose, view } = useSearch({ from: "/app/mail" })
  const navigate = useNavigate()
  const [messages, setMessages] = useState(starterMailMessages)
  const [query, setQuery] = useState("")
  const [attachmentsOnly, setAttachmentsOnly] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [messagePresentation, setMessagePresentation] = useState<EmbeddedItemsOpenAs>("sidepanel")
  const [selection, setSelection] = useState<MailSelection | null>(null)
  const ActiveViewIcon = mailViewIcons[view]

  useEffect(() => {
    if (!compose) return
    setComposeOpen(true)
    void navigate({
      replace: true,
      search: { compose: undefined, view },
      to: "/mail",
    })
  }, [compose, navigate, view])

  const visibleMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return messages.filter((message) => {
      if (!messageMatchesView(message, view)) return false
      if (attachmentsOnly && !message.attachment) return false
      if (!normalizedQuery) return true
      return [message.sender, message.recipient, message.subject, message.preview]
        .some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [attachmentsOnly, messages, query, view])

  const groupedMessages = messageGroups
    .map((group) => ({
      group,
      messages: visibleMessages.filter((message) => message.group === group),
    }))
    .filter((entry) => entry.messages.length > 0)

  const updateMessage = (id: string, update: (message: MailMessage) => MailMessage) => {
    setMessages((current) => current.map((message) => message.id === id ? update(message) : message))
  }

  const selectedMessage = selection
    ? messages.find((message) => message.id === selection.id) ?? null
    : null
  const selectedMessageIndex = selection
    ? selection.messageIds.indexOf(selection.id)
    : -1
  const previousMessageId = selection && selectedMessageIndex > 0
    ? selection.messageIds[selectedMessageIndex - 1] ?? null
    : null
  const nextMessageId = selection && selectedMessageIndex >= 0
    ? selection.messageIds[selectedMessageIndex + 1] ?? null
    : null

  const openMessage = (id: string) => {
    setSelection({
      id,
      messageIds: visibleMessages.map((message) => message.id),
    })
    updateMessage(id, (current) => ({ ...current, unread: false }))
  }

  const openAdjacentMessage = (id: string | null) => {
    if (!id) return
    setSelection((current) => current ? { ...current, id } : null)
    updateMessage(id, (current) => ({ ...current, unread: false }))
  }

  const closeMessage = () => setSelection(null)
  const messageViewer = selectedMessage ? (
    <MailMessageViewer
      message={selectedMessage}
      mode={messagePresentation}
      nextDisabled={!nextMessageId}
      onArchive={() => {
        updateMessage(selectedMessage.id, (current) => ({ ...current, folder: "archive", unread: false }))
        closeMessage()
        toast.success("Message archived.")
      }}
      onClose={closeMessage}
      onModeChange={setMessagePresentation}
      onNext={() => openAdjacentMessage(nextMessageId)}
      onPrevious={() => openAdjacentMessage(previousMessageId)}
      onStar={() => updateMessage(selectedMessage.id, (current) => ({ ...current, starred: !current.starred }))}
      onTrash={() => {
        updateMessage(selectedMessage.id, (current) => ({ ...current, folder: "trash", unread: false }))
        closeMessage()
        toast.success("Message moved to trash.")
      }}
      previousDisabled={!previousMessageId}
    />
  ) : null

  return (
    <>
      <PageSidePaneLayout
        className="bg-surface-canvas"
        main={(
          <main className="min-h-0 flex-1 overflow-y-auto bg-surface-canvas">
            <section className="animate-in fade-in-0 duration-300">
              <div className="px-4 pb-8 pt-5 sm:px-6 md:px-10 lg:px-12">
                <div className="mx-auto w-full max-w-[96rem]">
            <div className="flex min-w-0 items-center justify-between gap-3 max-sm:flex-wrap">
              <div className="flex shrink-0 items-center gap-2">
                <ActiveViewIcon className="size-5 shrink-0 text-action-link" />
                <h1 className="text-xl font-semibold leading-7 tracking-normal text-content-primary">
                  {mailViewLabels[view]}
                </h1>
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-1 max-sm:basis-full">
                <div className="relative min-w-0 flex-1 sm:max-w-64">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-content-secondary" />
                  <Input
                    aria-label="Search mail"
                    className="h-8 bg-transparent pl-8"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search mail"
                    value={query}
                  />
                </div>
                <Button
                  aria-label="Show messages with attachments"
                  className={cn(attachmentsOnly && "bg-action-neutral-hover text-action-on-neutral")}
                  onClick={() => setAttachmentsOnly((current) => !current)}
                  size="icon-lg"
                  title="Messages with attachments"
                  type="button"
                  variant="ghost"
                >
                  <FilterIcon />
                </Button>
                <Button aria-label="Refresh mail" onClick={() => toast.success("Mail is up to date.")} size="icon-lg" title="Refresh mail" type="button" variant="ghost">
                  <RefreshCwIcon />
                </Button>
                <Button aria-label="Mail display options" size="icon-lg" title="Display options" type="button" variant="ghost">
                  <SlidersHorizontalIcon />
                </Button>
              </div>
            </div>

            {groupedMessages.length ? (
              <div>
                {groupedMessages.map(({ group, messages: groupMessages }) => (
                  <section aria-labelledby={`mail-group-${group}`} className="pt-3" key={group}>
                    <h3 className="px-2 pb-1.5 text-xs font-semibold text-content-secondary" id={`mail-group-${group}`}>
                      {group}
                    </h3>
                    <div className="border-t border-stroke-default">
                      {groupMessages.map((message) => (
                        <MailRow
                          key={message.id}
                          message={message}
                          onArchive={(event) => {
                            event.stopPropagation()
                            updateMessage(message.id, (current) => ({ ...current, folder: "archive", unread: false }))
                            toast.success("Message archived.")
                          }}
                          onOpen={() => openMessage(message.id)}
                          onStar={(event) => {
                            event.stopPropagation()
                            updateMessage(message.id, (current) => ({ ...current, starred: !current.starred }))
                          }}
                          onTrash={(event) => {
                            event.stopPropagation()
                            updateMessage(message.id, (current) => ({ ...current, folder: "trash", unread: false }))
                            toast.success("Message moved to trash.")
                          }}
                          view={view}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <MailEmptyState query={query} view={view} />
            )}
                </div>
              </div>
            </section>
          </main>
        )}
        sidePane={messagePresentation === "sidepanel" ? messageViewer : null}
        sidePaneOpen={Boolean(selectedMessage && messagePresentation === "sidepanel")}
        sidePaneVisible={Boolean(selectedMessage && messagePresentation === "sidepanel")}
        standalone
        viewportHeightClass="h-full"
      />
      <MailMessageDialog
        onOpenChange={(open) => {
          if (!open) closeMessage()
        }}
        open={Boolean(selectedMessage && messagePresentation === "dialog")}
      >
        {messageViewer}
      </MailMessageDialog>
      <ComposeDialog
        onOpenChange={setComposeOpen}
        onSend={(message) => {
          setMessages((current) => [message, ...current])
          setComposeOpen(false)
          toast.success("Message sent.")
        }}
        open={composeOpen}
      />
    </>
  )
}

function MailMessageViewer({
  message,
  mode,
  nextDisabled,
  onArchive,
  onClose,
  onModeChange,
  onNext,
  onPrevious,
  onStar,
  onTrash,
  previousDisabled,
}: {
  message: MailMessage
  mode: EmbeddedItemsOpenAs
  nextDisabled: boolean
  onArchive: () => void
  onClose: () => void
  onModeChange: (mode: EmbeddedItemsOpenAs) => void
  onNext: () => void
  onPrevious: () => void
  onStar: () => void
  onTrash: () => void
  previousDisabled: boolean
}) {
  const CloseIcon = mode === "sidepanel" ? ChevronsRightIcon : XIcon

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas dark:bg-surface-navigation">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-stroke-default px-2">
        <Button aria-label="Close message" onClick={onClose} size="icon" title="Close" type="button" variant="ghost">
          <CloseIcon />
        </Button>
        <EmbeddedItemPresentationDropdown
          itemLabel="mail"
          mode={mode}
          onSelect={onModeChange}
        />
        <Separator className="mx-1 data-[orientation=vertical]:h-4" orientation="vertical" />
        <Button aria-label="Open previous message" disabled={previousDisabled} onClick={onPrevious} size="icon" title="Previous message" type="button" variant="ghost">
          <ChevronUp />
        </Button>
        <Button aria-label="Open next message" disabled={nextDisabled} onClick={onNext} size="icon" title="Next message" type="button" variant="ghost">
          <ChevronDown />
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            aria-label={message.starred ? "Remove star" : "Star message"}
            className={cn(message.starred && "text-feedback-warning-text")}
            onClick={onStar}
            size="icon"
            title={message.starred ? "Remove star" : "Star"}
            type="button"
            variant="ghost"
          >
            <StarIcon weight={message.starred ? "fill" : "regular"} />
          </Button>
          {message.folder !== "archive" && message.folder !== "drafts" ? (
            <Button aria-label="Archive message" onClick={onArchive} size="icon" title="Archive" type="button" variant="ghost">
              <ArchiveIcon />
            </Button>
          ) : null}
          {message.folder !== "trash" ? (
            <Button aria-label="Move message to trash" onClick={onTrash} size="icon" title="Move to trash" type="button" variant="ghost">
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-7">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-7 text-content-primary">
                {message.subject}
              </h2>
              <p className="mt-4 text-sm font-medium text-content-primary">
                {message.sender}
              </p>
              <p className="mt-0.5 text-xs text-content-secondary">
                {message.recipient ? `To ${message.recipient}` : "To you"}
              </p>
            </div>
            <time className="shrink-0 pt-1 text-xs tabular-nums text-content-secondary">
              {message.time}
            </time>
          </div>
          <div className="mt-6 border-t border-stroke-default pt-6 text-sm leading-6 text-content-primary">
            <p>{message.preview}</p>
          </div>
          {message.attachment ? (
            <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-stroke-default bg-surface-raised px-3 py-2 text-xs text-content-secondary">
              <Paperclip className="size-3.5" />
              Attachment
            </div>
          ) : null}
        </article>
      </div>
    </div>
  )
}

function MailMessageDialog({ children, onOpenChange, open }: {
  children: React.ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex h-[90dvh] max-h-[90dvh] min-h-0 w-full flex-col gap-0 overflow-hidden p-0 dark:bg-surface-navigation sm:h-[90vh] sm:max-h-[90vh] sm:max-w-4xl"
        data-mail-dialog-panel
        hideMobileDragHandle
        showCloseButton={false}
        unstyledContent
      >
        <DialogTitle className="sr-only">Mail message</DialogTitle>
        <DialogDescription className="sr-only">Mail message preview</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function MailRow({ message, onArchive, onOpen, onStar, onTrash, view }: {
  message: MailMessage
  onArchive: (event: MouseEvent<HTMLButtonElement>) => void
  onOpen: () => void
  onStar: (event: MouseEvent<HTMLButtonElement>) => void
  onTrash: (event: MouseEvent<HTMLButtonElement>) => void
  view: MailView
}) {
  const displayName = view === "sent" || view === "drafts"
    ? `To: ${message.recipient ?? "No recipient"}`
    : message.sender

  return (
    <article
      className={cn(
        "group/mail-row grid h-9 cursor-pointer grid-cols-[1rem_minmax(7rem,13rem)_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 outline-none transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action-focus-ring max-md:h-auto max-md:min-h-12 max-md:grid-cols-[1rem_minmax(0,1fr)_auto] max-md:py-1",
        message.unread && "bg-surface-raised",
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span aria-label={message.unread ? "Unread" : "Read"} className={cn("size-1.5 justify-self-center rounded-full", message.unread ? "bg-action-primary" : "bg-transparent")} />
      <div className="min-w-0">
        <span className={cn("truncate text-sm", message.unread ? "font-semibold text-content-primary" : "font-medium text-content-secondary")}>
          {displayName}
        </span>
      </div>
      <div className="min-w-0 max-md:col-start-2 max-md:row-start-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn("truncate text-sm text-content-primary", message.unread && "font-semibold")}>{message.subject}</span>
          {message.attachment ? <Paperclip aria-label="Has attachment" className="size-3.5 shrink-0 text-content-secondary" /> : null}
          <span className="min-w-0 flex-1 truncate text-sm text-content-secondary max-lg:hidden">— {message.preview}</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-0.5 max-md:col-start-3 max-md:row-span-2 max-md:row-start-1">
        <div className="hidden items-center group-hover/mail-row:flex group-focus-within/mail-row:flex">
          <MailRowAction active={message.starred} label={message.starred ? "Remove star" : "Star"} onClick={onStar}>
            <StarIcon weight={message.starred ? "fill" : "regular"} />
          </MailRowAction>
          {message.folder !== "archive" && message.folder !== "drafts" ? (
            <MailRowAction label="Archive" onClick={onArchive}><ArchiveIcon /></MailRowAction>
          ) : null}
          {message.folder !== "trash" ? (
            <MailRowAction label="Move to trash" onClick={onTrash}><Trash2Icon /></MailRowAction>
          ) : null}
        </div>
        <time className="ml-2 w-16 shrink-0 text-right text-xs tabular-nums text-content-secondary group-hover/mail-row:hidden group-focus-within/mail-row:hidden">
          {message.time}
        </time>
      </div>
    </article>
  )
}

function MailRowAction({ active = false, children, label, onClick }: {
  active?: boolean
  children: React.ReactNode
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      aria-label={label}
      className={cn("inline-flex size-7 items-center justify-center rounded-md text-content-secondary outline-none hover:bg-action-neutral-pressed hover:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring [&_svg]:size-3.5", active && "text-feedback-warning-text")}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function MailEmptyState({ query, view }: { query: string; view: MailView }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center border-t border-stroke-default px-6 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-action-neutral-hover text-content-secondary">
        {query ? <SearchIcon className="size-5" /> : <CheckIcon className="size-5" />}
      </span>
      <h3 className="mt-4 text-sm font-semibold text-content-primary">
        {query ? "No matching messages" : `${mailViewLabels[view]} is clear`}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-content-secondary">
        {query ? "Try a different sender, subject, or keyword." : "There’s nothing here right now. Enjoy the quiet."}
      </p>
    </div>
  )
}

function ComposeDialog({ onOpenChange, onSend, open }: {
  onOpenChange: (open: boolean) => void
  onSend: (message: MailMessage) => void
  open: boolean
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const recipient = String(form.get("recipient") ?? "").trim()
    const subject = String(form.get("subject") ?? "").trim()
    const body = String(form.get("body") ?? "").trim()
    if (!recipient) return
    onSend({
      folder: "sent",
      group: "Today",
      id: crypto.randomUUID(),
      preview: body || "No message body",
      recipient,
      sender: "You",
      starred: false,
      subject: subject || "(No subject)",
      time: "Now",
      unread: false,
    })
    event.currentTarget.reset()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Compose a focused email without leaving your workspace.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <Input aria-label="Recipient" name="recipient" placeholder="To" required type="email" />
          <Input aria-label="Subject" name="subject" placeholder="Subject" />
          <Textarea aria-label="Message" className="min-h-48" name="body" placeholder="Write your message…" />
          <DialogFooter>
            <Button type="submit"><SendIcon />Send</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function messageMatchesView(message: MailMessage, view: MailView) {
  if (view === "unread") return message.folder === "inbox" && message.unread
  if (view === "starred") return message.starred && message.folder !== "trash" && message.folder !== "spam"
  return message.folder === view
}
