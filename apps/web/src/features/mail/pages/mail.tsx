import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { invoke } from "@tauri-apps/api/core"
import { useLiveQuery } from "dexie-react-hooks"
import { useSession } from "@zilobase/features/auth"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  mailSystemFolderIds,
  type MailConnection,
  type MailLabelRecord,
  type MailLabelWriteRequest,
  type MailMessageRecord,
  type MailModifyRequest,
  type MailSendResponse,
  type MailThreadSummary,
  type MailPersistedView,
  type MailView,
} from "@zilobase/features/mail"
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages"
import { toast } from "sonner"
import { useTheme } from "next-themes"

import { apiFetch, getApiErrorMessage } from "@/features/desktop/network/api"
import { isDesktopApp } from "@/features/desktop/platform"
import {
  ArchiveIcon,
  BanIcon,
  ChevronDown,
  ChevronUp,
  ChevronsRightIcon,
  DownloadIcon,
  FilePenLineIcon,
  InboxIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  Paperclip,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WifiOffIcon,
  XIcon,
} from "@/shared/components/icons"
import { GoogleIcon } from "@/shared/components/google-icon"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { useThemeFamily } from "@/shared/providers/theme-family-provider"
import { isFeatureEnabled } from "@/shared/config/feature-flags"
import {
  EmbeddedItemPresentationDropdown,
  MainPaneHeaderLeadingControl,
  PagePaneHeader,
} from "@/features/pages/components"
import {
  PageSidePaneHeaderCell,
  PageSidePaneLayout,
  PageSidePaneShell,
} from "@/features/pages/context"
import { mailViewIcons, mailViewLabels } from "@/features/sidebar"

import { sanitizeMailHtml } from "../model/mail-html"
import { applyMailDocumentTheme } from "../model/mail-document-theme"
import { MailComposer } from "../components/mail-composer"
import { MailViewSettingsMenu } from "../components/mail-view-settings-menu"
import { forwardSeed, replySeed, type MailComposeSeed } from "../model/mail-compose"
import { useMailRealtime } from "../model/mail-realtime"
import { useMailController } from "../model/mail-sync-controller"
import { mailApiBasePath } from "../model/mail-api-path"
import { useMailViews } from "../model/use-mail-views"

const messageGroups = ["Today", "Yesterday", "Earlier"] as const
const organizationFolderDetails = {
  all_mail: { icon: MailIcon, label: "All Mail" },
  bin: { icon: Trash2Icon, label: "Bin" },
  drafts: { icon: FilePenLineIcon, label: "Drafts" },
  sent: { icon: SendIcon, label: "Sent" },
  spam: { icon: BanIcon, label: "Spam" },
} as const

export default function MailPage() {
  const activeWorkspaceId = useActiveWorkspaceId()
  const organizationEnabled = isFeatureEnabled("mailOrganization")
  const mailBasePath = mailApiBasePath(
    organizationEnabled ? activeWorkspaceId : null,
  )
  const connectionQuery = useQuery({
    enabled: !organizationEnabled || Boolean(activeWorkspaceId),
    queryKey: ["mail", "connection", organizationEnabled ? activeWorkspaceId : "legacy"],
    queryFn: ({ signal }) => apiFetch<MailConnection>(`${mailBasePath}/connection`, { signal }),
    staleTime: 15_000,
  })

  if (!connectionQuery.data || connectionQuery.data.status !== "connected") {
    return (
      <MailConnectionState
        connection={connectionQuery.data ?? null}
        error={connectionQuery.error}
        loading={connectionQuery.isLoading}
        onConnected={() => void connectionQuery.refetch()}
        workspaceId={organizationEnabled ? activeWorkspaceId : null}
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
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set())
  const [presentation, setPresentation] = useState<EmbeddedItemsOpenAs>("sidepanel")
  const [composerSeed, setComposerSeed] = useState<MailComposeSeed | null>(() => compose ? {} : null)
  const persistedViewsQuery = useMailViews({
    bindingId: connection.bindingId,
    enabled: isFeatureEnabled("mailOrganization"),
    workspaceId: connection.workspaceId,
  })
  const persistedViews = persistedViewsQuery.data?.views ?? []
  const inboxView = persistedViews.find((persistedView) => persistedView.protected) ?? null
  const activePersistedView = persistedViews.find((persistedView) => persistedView.id === view) ?? null
  const activeSystemFolder = mailSystemFolderIds.includes(view as (typeof mailSystemFolderIds)[number])
    ? view as (typeof mailSystemFolderIds)[number]
    : null
  const organizationEnabled = isFeatureEnabled("mailOrganization")
  const providerView = organizationEnabled
    ? providerViewForOrganizationRoute(activePersistedView, activeSystemFolder)
    : legacyProviderView(view)
  useEffect(() => {
    if (!organizationEnabled || !persistedViewsQuery.isSuccess || !inboxView) return
    if (activePersistedView || activeSystemFolder) return
    void navigate({
      replace: true,
      search: { compose, view: inboxView.id },
      to: "/mail",
    })
  }, [activePersistedView, activeSystemFolder, compose, inboxView, navigate, organizationEnabled, persistedViewsQuery.isSuccess])
  const controller = useMailController({
    connection,
    query,
    userId,
    view: providerView,
  })
  useMailRealtime({
    bindingId: connection.bindingId ?? connection.connectionId!,
    connectionId: connection.connectionId!,
    enabled: controller.online && Boolean(controller.database),
    onSynchronize: controller.refresh,
    workspaceId: connection.workspaceId ?? "legacy",
  })
  useEffect(() => {
    if (!controller.error) return
    toast.error(getApiErrorMessage(controller.error), { id: "mail-background-error" })
  }, [controller.error])
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
  const ActiveViewIcon = organizationEnabled
    ? activePersistedView
      ? persistedViewIcon(activePersistedView)
      : activeSystemFolder
        ? organizationFolderDetails[activeSystemFolder].icon
        : InboxIcon
    : mailViewIcons[providerView as keyof typeof mailViewIcons]
  const activeViewLabel = organizationEnabled
    ? activePersistedView?.name ?? (activeSystemFolder
      ? organizationFolderDetails[activeSystemFolder].label
      : "Inbox")
    : mailViewLabels[providerView as keyof typeof mailViewLabels]
  const idlePrefetchIds = useMemo(() => controller.threads.slice(0, 6).map((thread) => thread.id), [controller.threads])
  const idlePrefetchKey = idlePrefetchIds.join("|")

  useEffect(() => {
    if (!selection) return
    void controller.openThread(selection)
  }, [controller.openThread, selection])

  useEffect(() => {
    if (!selection || !controller.online) return
    const adjacentThreadIds = [previousId, nextId].filter((threadId): threadId is string => Boolean(threadId))
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const threadId of adjacentThreadIds) await controller.prefetchThread(threadId)
      })()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [controller.online, controller.prefetchThread, nextId, previousId, selection])

  useEffect(() => {
    if (!controller.database || !controller.online || controller.syncing || !idlePrefetchIds.length) return
    let cancelled = false
    const prefetch = async () => {
      let cursor = 0
      const worker = async () => {
        while (!cancelled && cursor < idlePrefetchIds.length) {
          const threadId = idlePrefetchIds[cursor++]
          if (threadId) await controller.prefetchThread(threadId)
        }
      }
      await Promise.all([worker(), worker()])
    }
    let idleHandle: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => void prefetch(), { timeout: 1_200 })
    } else {
      timer = globalThis.setTimeout(() => void prefetch(), 400)
    }
    return () => {
      cancelled = true
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle)
      if (timer !== null) globalThis.clearTimeout(timer)
    }
  }, [controller.database, controller.online, controller.prefetchThread, controller.syncing, idlePrefetchKey])

  useEffect(() => setBatchSelection(new Set()), [view])

  useEffect(() => {
    if (!compose) return
    setComposerSeed({})
    void navigate({ replace: true, search: { compose: undefined, view }, to: "/mail" })
  }, [compose, navigate, view])

  const groupedThreads = useMemo(() => messageGroups
    .map((group) => ({ group, threads: controller.threads.filter((thread) => dateGroup(thread.internalDate) === group) }))
    .filter((entry) => entry.threads.length > 0), [controller.threads])
  const runBatch = (modification: MailModifyRequest) => controller
    .batchModifyThreads([...batchSelection], modification)
    .then(() => setBatchSelection(new Set()))
  const sidePaneOpen = Boolean(selectedThread && presentation === "sidepanel")
  const viewerProps = selectedThread ? {
    labels: controller.labels,
    messages: selectedMessages ?? [],
    mode: presentation,
    mutating: controller.mutating,
    nextDisabled: !nextId,
    onActOnMessage: controller.actOnMessage,
    onActOnThread: controller.actOnThread,
    onClose: () => setSelection(null),
    onDownload: controller.downloadAttachment,
    onLoadInlineAttachment: controller.loadInlineAttachment,
    onModeChange: setPresentation,
    onCompose: setComposerSeed,
    onModifyMessage: controller.modifyMessage,
    onModifyThread: controller.modifyThread,
    onNext: () => nextId && setSelection(nextId),
    onPrevious: () => previousId && setSelection(previousId),
    online: controller.online,
    ownEmail: connection.email!,
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
                            {activeViewLabel}
                          </h1>
                          {!controller.online ? <WifiOffIcon className="size-4 text-content-secondary" aria-label="Offline" /> : null}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 max-sm:basis-full">
                          <Button disabled={!controller.online} onClick={() => setComposerSeed({})} size="sm" type="button">Compose</Button>
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
                          <MailLabelMenu
                            labels={controller.labels}
                            mutating={controller.mutating}
                            onCreate={controller.createLabel}
                            onDelete={controller.deleteLabel}
                            onUpdate={controller.updateLabel}
                            online={controller.online}
                          />
                          <MailViewSettingsMenu />
                        </div>
                      </div>

                      {batchSelection.size ? (
                        <div className="mt-3 flex items-center gap-1 rounded-md border border-stroke-default bg-surface-raised px-2 py-1">
                          <span className="mr-2 text-xs font-medium text-content-secondary">{batchSelection.size} selected</span>
                          <MailActionButton disabled={!controller.online || controller.mutating} icon={<MailIcon />} label="Mark selected read" onClick={() => runBatch({ removeLabelIds: ["UNREAD"] })} />
                          <MailActionButton disabled={!controller.online || controller.mutating} icon={<StarIcon />} label="Star selected" onClick={() => runBatch({ addLabelIds: ["STARRED"] })} />
                          <MailActionButton disabled={!controller.online || controller.mutating} icon={<ArchiveIcon />} label="Archive selected" onClick={() => runBatch({ removeLabelIds: ["INBOX"] })} />
                          <MailActionButton disabled={!controller.online || controller.mutating} icon={<TriangleAlertIcon />} label="Move selected to spam" onClick={() => runBatch({ addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] })} />
                          <Button className="ml-auto" onClick={() => setBatchSelection(new Set())} size="sm" type="button" variant="ghost">Clear</Button>
                        </div>
                      ) : null}

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
                                    mutating={controller.mutating}
                                    batchSelected={batchSelection.has(thread.id)}
                                    onAction={(action) => controller.actOnThread(thread.id, action)}
                                    onModify={(modification) => controller.modifyThread(thread.id, modification)}
                                    onBatchToggle={(checked) => setBatchSelection((current) => {
                                      const next = new Set(current)
                                      if (checked) next.add(thread.id)
                                      else next.delete(thread.id)
                                      return next
                                    })}
                                    onOpen={() => setSelection(thread.id)}
                                    onPrefetch={() => void controller.prefetchThread(thread.id)}
                                    online={controller.online}
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
              <PagePaneHeader
                className="min-w-0 flex-1"
                leadingControl={<MainPaneHeaderLeadingControl />}
                pathname="/mail"
                showActions={false}
              />
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
      {composerSeed ? (
        <MailComposer
          onClose={() => setComposerSeed(null)}
          onSent={async (_response: MailSendResponse) => { await controller.refresh() }}
          online={controller.online}
          seed={composerSeed}
          workspaceId={connection.workspaceId}
        />
      ) : null}
    </>
  )
}

function MailThreadRow({ batchSelected, mutating, onAction, onBatchToggle, onModify, onOpen, onPrefetch, online, selected, thread }: {
  batchSelected: boolean
  mutating: boolean
  onAction: (action: "restore" | "trash") => Promise<void>
  onBatchToggle: (checked: boolean) => void
  onModify: (modification: MailModifyRequest) => Promise<void>
  onOpen: () => void
  onPrefetch: () => void
  online: boolean
  selected: boolean
  thread: MailThreadSummary
}) {
  const participant = thread.participants[0]
  return (
    <div
      className={`group/mail-row flex h-9 w-full items-center hover:bg-action-neutral-hover ${selected ? "bg-action-neutral-hover text-action-on-neutral" : ""}`}
      data-selected={selected ? "true" : undefined}
    >
      <Checkbox aria-label={`Select ${thread.subject}`} checked={batchSelected} className="ml-2 shrink-0" onCheckedChange={(checked) => onBatchToggle(checked === true)} />
      <button className="grid min-w-0 flex-1 grid-cols-[minmax(8rem,0.8fr)_minmax(12rem,2fr)_auto] items-center gap-3 px-2 text-left text-sm" onClick={onOpen} onFocus={onPrefetch} onPointerEnter={onPrefetch} type="button">
        <span className={`truncate ${thread.unread ? "font-semibold text-content-primary" : "text-content-secondary"}`}>
          {participant?.name || participant?.address || "Unknown sender"}
          {thread.messageCount > 1 ? ` (${thread.messageCount})` : ""}
        </span>
        <span className="min-w-0 truncate">
          <span className={thread.unread ? "font-semibold text-content-primary" : "text-content-primary"}>{thread.subject}</span>
          <span className="text-content-secondary"> — {thread.snippet}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-content-secondary group-hover/mail-row:hidden">
          {thread.attachmentCount ? <Paperclip className="size-3.5" /> : null}
          {thread.starred ? <StarIcon className="size-3.5 text-feedback-warning-text" weight="fill" /> : null}
          {formatThreadDate(thread.internalDate)}
        </span>
      </button>
      <div className="hidden shrink-0 items-center pr-1 group-hover/mail-row:flex">
        <MailActionButton
          disabled={!online || mutating}
          icon={<StarIcon weight={thread.starred ? "fill" : "regular"} />}
          label={thread.starred ? "Unstar thread" : "Star thread"}
          onClick={() => onModify(thread.starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] })}
        />
        <MailActionButton
          disabled={!online || mutating}
          icon={<MailIcon />}
          label={thread.unread ? "Mark thread read" : "Mark thread unread"}
          onClick={() => onModify(thread.unread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })}
        />
        <MailActionButton
          disabled={!online || mutating}
          icon={thread.labelIds.includes("TRASH") ? <ArchiveIcon /> : <TrashIcon />}
          label={thread.labelIds.includes("TRASH") ? "Restore thread" : "Move thread to trash"}
          onClick={() => onAction(thread.labelIds.includes("TRASH") ? "restore" : "trash")}
        />
      </div>
    </div>
  )
}

type ConversationProps = {
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
  thread: MailThreadSummary
}

function ConversationViewer(props: ConversationProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-surface-canvas dark:bg-surface-navigation">
      <header className="sticky top-0 z-10 flex h-12 bg-surface-canvas dark:bg-surface-navigation"><ConversationToolbar {...props} /></header>
      <ConversationBody {...props} />
    </div>
  )
}

function ConversationToolbar({ labels, mode, mutating, nextDisabled, onActOnThread, onClose, onModifyThread, onModeChange, onNext, onPrevious, online, previousDisabled, thread }: ConversationProps) {
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

function ConversationBody({ labels, messages, mutating, onActOnMessage, onCompose, onDownload, onLoadInlineAttachment, onModifyMessage, online, ownEmail, thread }: ConversationProps) {
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

function MailLabelMenu({ labels, modificationTarget, mutating, onCreate, onDelete, onToggle, onUpdate, online }: {
  labels: MailLabelRecord[]
  modificationTarget?: Pick<MailThreadSummary, "labelIds">
  mutating: boolean
  onCreate?: (input: MailLabelWriteRequest) => Promise<MailLabelRecord>
  onDelete?: (labelId: string) => Promise<void>
  onToggle?: (labelId: string, active: boolean) => Promise<void>
  onUpdate?: (label: MailLabelRecord, input: MailLabelWriteRequest) => Promise<MailLabelRecord>
  online: boolean
}) {
  const userLabels = labels.filter((label) => label.type === "user")
  const run = (operation: Promise<unknown>) => void operation.catch(showMailError)
  const create = () => {
    const name = window.prompt("New Gmail label name")?.trim()
    if (name && onCreate) run(onCreate({ labelListVisibility: "labelShow", messageListVisibility: "show", name }))
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={modificationTarget ? "Apply labels" : "Manage Gmail labels"} disabled={!online || mutating} size="icon-lg" title={modificationTarget ? "Labels" : "Manage labels"} type="button" variant="ghost"><TagIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {modificationTarget && onToggle ? <>
          <DropdownMenuLabel>Apply labels</DropdownMenuLabel>
          {userLabels.length ? userLabels.map((label) => (
            <DropdownMenuCheckboxItem
              checked={modificationTarget.labelIds.includes(label.id)}
              key={label.id}
              onCheckedChange={() => run(onToggle(label.id, modificationTarget.labelIds.includes(label.id)))}
            >
              {label.name}
            </DropdownMenuCheckboxItem>
          )) : <DropdownMenuItem disabled>No custom labels</DropdownMenuItem>}
          <DropdownMenuSeparator />
        </> : null}
        {onCreate ? <DropdownMenuItem onClick={create}>Create label…</DropdownMenuItem> : null}
        {onUpdate || onDelete ? userLabels.map((label) => (
          <DropdownMenuSub key={label.id}>
            <DropdownMenuSubTrigger>{label.name}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {onUpdate ? <>
                <DropdownMenuItem onClick={() => {
                  const name = window.prompt("Rename Gmail label", label.name)?.trim()
                  if (name) run(onUpdate(label, { name }))
                }}>Rename…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => run(onUpdate(label, { labelListVisibility: label.labelListVisibility === "labelHide" ? "labelShow" : "labelHide" }))}>{label.labelListVisibility === "labelHide" ? "Show in label list" : "Hide from label list"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => run(onUpdate(label, { messageListVisibility: label.messageListVisibility === "hide" ? "show" : "hide" }))}>{label.messageListVisibility === "hide" ? "Show in message list" : "Hide from message list"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const backgroundColor = window.prompt("Gmail label background color (#RRGGBB)", label.color?.backgroundColor ?? "")?.trim()
                  if (!backgroundColor) return
                  const textColor = window.prompt("Gmail label text color (#RRGGBB)", label.color?.textColor ?? "")?.trim()
                  if (textColor) run(onUpdate(label, { color: { backgroundColor, textColor } }))
                }}>Recolor…</DropdownMenuItem>
              </> : null}
              {onDelete ? <DropdownMenuItem variant="destructive" onClick={() => {
                if (window.confirm(`Delete Gmail label “${label.name}”?`)) run(onDelete(label.id))
              }}>Delete label</DropdownMenuItem> : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MailActionButton({ disabled, icon, label, onClick }: {
  disabled: boolean
  icon: React.ReactNode
  label: string
  onClick: () => Promise<void>
}) {
  return <Button aria-label={label} disabled={disabled} onClick={() => void onClick().catch(showMailError)} size="icon" title={label} type="button" variant="ghost">{icon}</Button>
}

function showMailError(error: unknown) {
  toast.error(getApiErrorMessage(error))
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

function providerViewForOrganizationRoute(
  view: MailPersistedView | null,
  folder: (typeof mailSystemFolderIds)[number] | null,
): MailView {
  if (folder) return folder
  if (
    view?.templateId === "inbox" ||
    view?.templateId === "starred" ||
    view?.templateId === "unread"
  ) {
    return view.templateId
  }
  return "inbox"
}

function legacyProviderView(view: string): MailView {
  return ["archive", "drafts", "inbox", "sent", "spam", "starred", "trash", "unread"].includes(view)
    ? view as MailView
    : "inbox"
}

function persistedViewIcon(view: MailPersistedView) {
  if (view.templateId === "inbox") return InboxIcon
  if (view.templateId === "starred") return StarIcon
  return MailIcon
}

function MailConnectionState({ connection, error, loading, onConnected, workspaceId }: {
  connection: MailConnection | null
  error: unknown
  loading: boolean
  onConnected: () => void
  workspaceId: string | null | undefined
}) {
  const [pending, setPending] = useState(false)
  const [connectError, setConnectError] = useState<unknown>(null)
  const connect = async () => {
    setPending(true)
    setConnectError(null)
    try {
      const result = await apiFetch<{ authorizationUrl: string }>(`${mailApiBasePath(workspaceId)}/oauth/start`, {
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
      <Button disabled={(!workspaceId && isFeatureEnabled("mailOrganization")) || loading || pending || connection?.providerConfigured === false} onClick={() => void connect()} type="button">
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
      header={<PageSidePaneHeaderCell className="z-10" side="main" splitActive={false}><PagePaneHeader className="min-w-0 flex-1" leadingControl={<MainPaneHeaderLeadingControl />} pathname="/mail" showActions={false} /></PageSidePaneHeaderCell>}
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
