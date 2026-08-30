import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { toast } from "sonner"

import {
  ArchiveIcon,
  CheckIcon,
  FilterIcon,
  Paperclip,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SlidersHorizontalIcon,
  StarIcon,
  Trash2Icon,
} from "@/shared/components/icons"
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
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"
import { mailViewIcons, mailViewLabels } from "@/features/sidebar"
import type { MailView } from "@zilobase/features/user-settings"

import { starterMailMessages, type MailMessage } from "../model/mail-data"

const messageGroups = ["Today", "Yesterday", "Earlier"] as const

export default function MailPage() {
  const { compose, view } = useSearch({ from: "/app/mail" })
  const navigate = useNavigate()
  const [messages, setMessages] = useState(starterMailMessages)
  const [query, setQuery] = useState("")
  const [attachmentsOnly, setAttachmentsOnly] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
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

  return (
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
                          onOpen={() => updateMessage(message.id, (current) => ({ ...current, unread: false }))}
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
      <ComposeDialog
        onOpenChange={setComposeOpen}
        onSend={(message) => {
          setMessages((current) => [message, ...current])
          setComposeOpen(false)
          toast.success("Message sent.")
        }}
        open={composeOpen}
      />
    </main>
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
