import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { invoke } from "@tauri-apps/api/core"
import { useLiveQuery } from "dexie-react-hooks"
import { useSession } from "@zilobase/features/auth"
import type { MailConnection, MailMessageRecord, MailThreadSummary } from "@zilobase/features/mail"
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages"
import { toast } from "sonner"

import { apiFetch, getApiErrorMessage } from "@/features/desktop/network/api"
import { isDesktopApp } from "@/features/desktop/platform"
import {
  ChevronDown,
  ChevronUp,
  ChevronsRightIcon,
  DownloadIcon,
  Loader2Icon,
  Paperclip,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  WifiOffIcon,
  XIcon,
} from "@/shared/components/icons"
import { GoogleIcon } from "@/shared/components/google-icon"
import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { EmbeddedItemPresentationDropdown, PagePaneHeader } from "@/features/pages/components"
import {
  PageSidePaneHeaderCell,
  PageSidePaneLayout,
  PageSidePaneShell,
} from "@/features/pages/context"
import { mailViewIcons, mailViewLabels } from "@/features/sidebar"

import { sanitizeMailHtml } from "../model/mail-html"
import { useMailRealtime } from "../model/mail-realtime"
import { useMailController } from "../model/mail-sync-controller"

const messageGroups = ["Today", "Yesterday", "Earlier"] as const

export default function MailPage() {
  const connectionQuery = useQuery({
    queryKey: ["mail", "connection"],
    queryFn: ({ signal }) => apiFetch<MailConnection>("/mail/connection", { signal }),
    staleTime: 15_000,
  })

  if (!connectionQuery.data || connectionQuery.data.status !== "connected") {
    return (
      <MailConnectionState
        connection={connectionQuery.data ?? null}
        error={connectionQuery.error}
        loading={connectionQuery.isLoading}
        onConnected={() => void connectionQuery.refetch()}
      />
    )
  }
  return <ConnectedMailbox connection={connectionQuery.data} />
}

function ConnectedMailbox({ connection }: { connection: MailConnection }) {
  const { data: session } = useSession()
  if (!session?.user?.id) return <MailCenteredState><MailboxLoading /></MailCenteredState>
  return <MailboxContent connection={connection} userId={session.user.id} />
}

function MailboxContent({ connection, userId }: { connection: MailConnection; userId: string }) {
  const { compose, view } = useSearch({ from: "/app/mail" })
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [selection, setSelection] = useState<string | null>(null)
  const [presentation, setPresentation] = useState<EmbeddedItemsOpenAs>("sidepanel")
  const controller = useMailController({
    connection,
    query,
    userId,
    view,
  })
  useMailRealtime({
    connectionId: connection.connectionId!,
    enabled: controller.online && Boolean(controller.database),
    onSynchronize: controller.refresh,
  })
  const selectedThread = controller.threads.find((thread) => thread.id === selection) ?? null
  const selectedMessages = useLiveQuery(
    () => controller.database && selection
      ? controller.database.messages.where("threadId").equals(selection).sortBy("internalDate")
      : [],
    [controller.database, selection],
    [],
  )
  const selectedIndex = selectedThread
    ? controller.threads.findIndex((thread) => thread.id === selectedThread.id)
    : -1
  const previousId = selectedIndex > 0 ? controller.threads[selectedIndex - 1]?.id ?? null : null
  const nextId = selectedIndex >= 0 ? controller.threads[selectedIndex + 1]?.id ?? null : null
  const ActiveViewIcon = mailViewIcons[view]

  useEffect(() => {
    if (!selection) return
    void controller.openThread(selection)
  }, [controller.openThread, selection])

  useEffect(() => {
    if (!compose) return
    toast.info("Compose is available after Gmail drafts finish loading.")
    void navigate({ replace: true, search: { compose: undefined, view }, to: "/mail" })
  }, [compose, navigate, view])

  const groupedThreads = useMemo(() => messageGroups
    .map((group) => ({ group, threads: controller.threads.filter((thread) => dateGroup(thread.internalDate) === group) }))
    .filter((entry) => entry.threads.length > 0), [controller.threads])
  const sidePaneOpen = Boolean(selectedThread && presentation === "sidepanel")
  const viewerProps = selectedThread ? {
    messages: selectedMessages ?? [],
    mode: presentation,
    nextDisabled: !nextId,
    onClose: () => setSelection(null),
    onDownload: controller.downloadAttachment,
    onModeChange: setPresentation,
    onNext: () => nextId && setSelection(nextId),
    onPrevious: () => previousId && setSelection(previousId),
    online: controller.online,
    previousDisabled: !previousId,
    thread: selectedThread,
  } satisfies ConversationProps : null

  return (
    <>
      <PageSidePaneShell
        body={(
          <PageSidePaneLayout
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
                          {!controller.online ? <WifiOffIcon className="size-4 text-content-secondary" aria-label="Offline" /> : null}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 max-sm:basis-full">
                          <div className="relative min-w-0 flex-1 sm:max-w-72">
                            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-content-secondary" />
                            <Input
                              aria-label="Search mail"
                              className="h-8 bg-transparent pl-8"
                              onChange={(event) => setQuery(event.target.value)}
                              placeholder={controller.online ? "Search Gmail" : "Search downloaded mail"}
                              value={query}
                            />
                          </div>
                          <Button
                            aria-label="Refresh mail"
                            disabled={!controller.online || controller.syncing}
                            onClick={() => void controller.refresh()}
                            size="icon-lg"
                            title="Refresh mail"
                            type="button"
                            variant="ghost"
                          >
                            <RefreshCwIcon className={controller.syncing ? "animate-spin" : undefined} />
                          </Button>
                        </div>
                      </div>

                      {!controller.database ? <MailboxLoading /> : groupedThreads.length ? (
                        <div>
                          {groupedThreads.map(({ group, threads }) => (
                            <section aria-labelledby={`mail-group-${group}`} className="pt-3" key={group}>
                              <h3 className="px-2 pb-1.5 text-xs font-semibold text-content-secondary" id={`mail-group-${group}`}>
                                {group}
                              </h3>
                              <div className="border-t border-stroke-default">
                                {threads.map((thread) => (
                                  <MailThreadRow
                                    key={thread.id}
                                    onOpen={() => setSelection(thread.id)}
                                    selected={selection === thread.id}
                                    thread={thread}
                                  />
                                ))}
                              </div>
                            </section>
                          ))}
                          {controller.hasMore ? (
                            <div className="flex justify-center pt-5">
                              <Button disabled={!controller.online || controller.syncing} onClick={() => void controller.loadMore()} type="button" variant="outline">
                                {controller.syncing ? "Loading…" : "Load more"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : <MailEmptyState offline={!controller.online} query={query} />}
                      {controller.error ? (
                        <p className="mt-4 text-sm text-feedback-danger-text">{getApiErrorMessage(controller.error)}</p>
                      ) : null}
                    </div>
                  </div>
                </section>
              </main>
            )}
            sidePane={sidePaneOpen && viewerProps ? <ConversationBody {...viewerProps} /> : null}
            sidePaneOpen={sidePaneOpen}
            sidePaneVisible={sidePaneOpen}
          />
        )}
        className="h-full bg-surface-canvas"
        header={(
          <>
            <PageSidePaneHeaderCell className="z-10" side="main" splitActive={sidePaneOpen}>
              <PagePaneHeader className="min-w-0 flex-1" pathname="/mail" showActions={false} />
            </PageSidePaneHeaderCell>
            {sidePaneOpen && viewerProps ? (
              <PageSidePaneHeaderCell side="side" splitActive={sidePaneOpen}>
                <ConversationToolbar {...viewerProps} />
              </PageSidePaneHeaderCell>
            ) : null}
          </>
        )}
        open={sidePaneOpen}
        visible={sidePaneOpen}
      />
      <Dialog open={Boolean(selectedThread && presentation === "dialog")} onOpenChange={(open) => !open && setSelection(null)}>
        <DialogContent className="h-[min(52rem,90vh)] max-w-4xl gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{selectedThread?.subject ?? "Mail conversation"}</DialogTitle>
          {viewerProps ? <ConversationViewer {...viewerProps} /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function MailThreadRow({ onOpen, selected, thread }: {
  onOpen: () => void
  selected: boolean
  thread: MailThreadSummary
}) {
  const participant = thread.participants[0]
  return (
    <button
      className={`group/mail-row grid h-9 w-full grid-cols-[minmax(8rem,0.8fr)_minmax(12rem,2fr)_auto] items-center gap-3 px-2 text-left text-sm hover:bg-action-neutral-hover ${selected ? "bg-action-neutral-hover text-action-on-neutral" : ""}`}
      data-selected={selected ? "true" : undefined}
      onClick={onOpen}
      type="button"
    >
      <span className={`truncate ${thread.unread ? "font-semibold text-content-primary" : "text-content-secondary"}`}>
        {participant?.name || participant?.address || "Unknown sender"}
        {thread.messageCount > 1 ? ` (${thread.messageCount})` : ""}
      </span>
      <span className="min-w-0 truncate">
        <span className={thread.unread ? "font-semibold text-content-primary" : "text-content-primary"}>{thread.subject}</span>
        <span className="text-content-secondary"> — {thread.snippet}</span>
      </span>
      <span className="flex items-center gap-2 text-xs text-content-secondary">
        {thread.attachmentCount ? <Paperclip className="size-3.5" /> : null}
        {thread.starred ? <StarIcon className="size-3.5 text-feedback-warning-text" weight="fill" /> : null}
        {formatThreadDate(thread.internalDate)}
      </span>
    </button>
  )
}

type ConversationProps = {
  messages: MailMessageRecord[]
  mode: EmbeddedItemsOpenAs
  nextDisabled: boolean
  onClose: () => void
  onDownload: (messageId: string, attachmentId: string, filename: string) => Promise<void>
  onModeChange: (mode: EmbeddedItemsOpenAs) => void
  onNext: () => void
  onPrevious: () => void
  online: boolean
  previousDisabled: boolean
  thread: MailThreadSummary
}

function ConversationViewer(props: ConversationProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas dark:bg-surface-navigation">
      <header className="flex h-12 shrink-0"><ConversationToolbar {...props} /></header>
      <ConversationBody {...props} />
    </div>
  )
}

function ConversationToolbar({ mode, nextDisabled, onClose, onModeChange, onNext, onPrevious, previousDisabled }: ConversationProps) {
  const CloseIcon = mode === "sidepanel" ? ChevronsRightIcon : XIcon
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1 px-2">
      <Button aria-label="Close message" onClick={onClose} size="icon" title="Close" type="button" variant="ghost"><CloseIcon /></Button>
      <EmbeddedItemPresentationDropdown itemLabel="mail" mode={mode} onSelect={onModeChange} />
      <Separator className="mx-1 data-[orientation=vertical]:h-4" orientation="vertical" />
      <Button aria-label="Open previous message" disabled={previousDisabled} onClick={onPrevious} size="icon" title="Previous message" type="button" variant="ghost"><ChevronUp /></Button>
      <Button aria-label="Open next message" disabled={nextDisabled} onClick={onNext} size="icon" title="Next message" type="button" variant="ghost"><ChevronDown /></Button>
    </div>
  )
}

function ConversationBody({ messages, onDownload, online, thread }: ConversationProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-canvas dark:bg-surface-navigation">
      <article className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-7">
        <h2 className="text-xl font-semibold leading-7 text-content-primary">{thread.subject}</h2>
        {!messages.length ? <MailboxLoading /> : messages.map((message) => (
          <section className="mt-5 border-t border-stroke-default pt-5 first:border-0" key={message.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-content-primary">{message.from?.name || message.from?.address || "Unknown sender"}</p>
                <p className="text-xs text-content-secondary">to {message.to.map((address) => address.name || address.address).join(", ") || "me"}</p>
              </div>
              <time className="text-xs text-content-secondary">{formatMessageDate(message.internalDate)}</time>
            </div>
            <MailMessageBody message={message} />
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
          </section>
        ))}
      </article>
    </div>
  )
}

function MailMessageBody({ message }: { message: MailMessageRecord }) {
  if (!message.hasFullBody) return <p className="mt-4 text-sm text-content-secondary">Connect to load this message.</p>
  if (message.bodyHtml) {
    return (
      <iframe
        className="mt-4 min-h-64 w-full border-0"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={sanitizeMailHtml(message.bodyHtml)}
        title={`Message from ${message.from?.name || message.from?.address || "sender"}`}
      />
    )
  }
  return <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-content-primary">{message.bodyText || message.snippet}</div>
}

function MailConnectionState({ connection, error, loading, onConnected }: {
  connection: MailConnection | null
  error: unknown
  loading: boolean
  onConnected: () => void
}) {
  const [pending, setPending] = useState(false)
  const [connectError, setConnectError] = useState<unknown>(null)
  const connect = async () => {
    setPending(true)
    setConnectError(null)
    try {
      const result = await apiFetch<{ authorizationUrl: string }>("/mail/oauth/start", {
        body: JSON.stringify({ client: isDesktopApp() ? "desktop" : "web" }),
        method: "POST",
      })
      if (isDesktopApp()) {
        await invoke("open_mail_authorization_url", { authorizationUrl: result.authorizationUrl })
        toast.info("Finish connecting Gmail in your browser.")
        setPending(false)
      } else window.location.assign(result.authorizationUrl)
    } catch (connectionError) {
      setConnectError(connectionError)
      setPending(false)
    }
  }
  return (
    <MailCenteredState>
      <GoogleIcon className="size-7" />
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold text-content-primary">
          {connection?.status === "reconnect_required" ? "Reconnect Gmail" : "Connect your Gmail account"}
        </h1>
        <p className="max-w-sm text-sm leading-6 text-content-secondary">Read, organize, draft, and send Gmail from Zilobase. Gmail remains authoritative.</p>
      </div>
      <Button disabled={loading || pending || connection?.providerConfigured === false} onClick={() => void connect()} type="button">
        <GoogleIcon /> {pending ? "Opening Google…" : "Connect Google account"}
      </Button>
      {connection?.providerConfigured === false ? <p className="text-center text-xs text-feedback-danger-text">Gmail is not configured on this Zilobase server.</p> : null}
      {error || connectError ? (
        <div className="space-y-2 text-center">
          <p className="text-xs text-feedback-danger-text">{getApiErrorMessage(connectError ?? error)}</p>
          <Button onClick={onConnected} size="sm" type="button" variant="outline">Try again</Button>
        </div>
      ) : null}
    </MailCenteredState>
  )
}

function MailCenteredState({ children }: { children: React.ReactNode }) {
  return (
    <PageSidePaneShell
      body={<main className="grid min-h-0 flex-1 place-items-center bg-surface-canvas px-6"><section className="flex max-w-md flex-col items-center gap-5 py-12">{children}</section></main>}
      className="h-full bg-surface-canvas"
      header={<PageSidePaneHeaderCell className="z-10" side="main" splitActive={false}><PagePaneHeader className="min-w-0 flex-1" pathname="/mail" showActions={false} /></PageSidePaneHeaderCell>}
      open={false}
      visible={false}
    />
  )
}

function MailboxLoading() {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-content-secondary"><Loader2Icon className="size-4 animate-spin" /> Preparing your mailbox</div>
}

function MailEmptyState({ offline, query }: { offline: boolean; query: string }) {
  return <div className="py-16 text-center text-sm text-content-secondary">{query ? `No ${offline ? "downloaded " : ""}mail matches your search.` : "No mail in this folder."}</div>
}

function dateGroup(timestamp: number): (typeof messageGroups)[number] {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "Today"
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  return date.toDateString() === yesterday.toDateString() ? "Yesterday" : "Earlier"
}

function formatThreadDate(timestamp: number) {
  const date = new Date(timestamp)
  return dateGroup(timestamp) === "Today"
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" })
}

function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
