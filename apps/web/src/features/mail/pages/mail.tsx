import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { invoke } from "@tauri-apps/api/core"
import { useLiveQuery } from "dexie-react-hooks"
import { useSession } from "@zilobase/features/auth"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  mailSystemFolderIds,
  mailSystemPropertyCatalog,
  type MailConnection,
  type MailFilterExpression,
  type MailGroupConfig,
  type MailHoverAction,
  type MailLabelRecord,
  type MailLabelWriteRequest,
  type MailMessageRecord,
  type MailModifyRequest,
  type MailQueryGroup,
  type MailSendResponse,
  type MailThreadSummary,
  type MailPersistedView,
  type MailPropertyDefinition,
  type MailThreadPropertyValue,
  type MailUnsubscribeResponse,
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

import { sanitizeMailHtml } from "../model/mail-html"
import { applyMailDocumentTheme } from "../model/mail-document-theme"
import { MailComposer } from "../components/mail-composer"
import { MailViewSettingsMenu } from "../components/mail-view-settings-menu"
import { cloneMailFilter, MailFilterEditor, mailFiltersEqual, MailFilterToolbar } from "../components/mail-filter-editor"
import { isMutableMailGroup, MailGroupEditor } from "../components/mail-group-editor"
import { formatMailPropertyValue, MailPropertiesPanel, MailThreadPropertyBar } from "../components/mail-properties-panel"
import { mailHoverActionCatalog, MailHoverActionIcon, MailHoverActionsPanel } from "../components/mail-hover-actions-panel"
import { MailRowActionDialog } from "../components/mail-row-action-dialog"
import { MailDatabaseSyncPanel } from "../components/mail-database-sync-panel"
import { forwardSeed, replySeed, type MailComposeSeed } from "../model/mail-compose"
import { useMailRealtime } from "../model/mail-realtime"
import { useMailController } from "../model/mail-sync-controller"
import { mailApiBasePath } from "../model/mail-api-path"
import { useMailViews } from "../model/use-mail-views"
import { useIndexedMailView } from "../model/use-indexed-mail-view"
import { useMailGroups } from "../model/use-mail-groups"
import { useMailProperties, useMailThreadProperties } from "../model/use-mail-properties"
import { useMailReminders } from "../model/use-mail-reminders"

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
  const mailBasePath = mailApiBasePath(activeWorkspaceId)
  const connectionQuery = useQuery({
    enabled: Boolean(activeWorkspaceId),
    queryKey: ["mail", "connection", activeWorkspaceId],
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
        workspaceId={activeWorkspaceId}
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
  const [indexedSearch, setIndexedSearch] = useState("")
  const [selection, setSelection] = useState<string | null>(null)
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const [presentation, setPresentation] = useState<EmbeddedItemsOpenAs>("sidepanel")
  const [rowActionDialog, setRowActionDialog] = useState<{ mode: "command" | "label"; thread: MailThreadSummary } | null>(null)
  const [composerSeed, setComposerSeed] = useState<MailComposeSeed | null>(() => compose ? {} : null)
  const persistedViewsQuery = useMailViews({
    bindingId: connection.bindingId,
    enabled: true,
    workspaceId: connection.workspaceId,
  })
  const persistedViews = persistedViewsQuery.data?.views ?? []
  const inboxView = persistedViews.find((persistedView) => persistedView.protected) ?? null
  const activePersistedView = persistedViews.find((persistedView) => persistedView.id === view) ?? null
  const activeSystemFolder = mailSystemFolderIds.includes(view as (typeof mailSystemFolderIds)[number])
    ? view as (typeof mailSystemFolderIds)[number]
    : null
  const mailPropertiesQuery = useMailProperties({
    bindingId: connection.bindingId,
    enabled: true,
    workspaceId: connection.workspaceId,
  })
  const customProperties = mailPropertiesQuery.data?.properties ?? []
  const propertyMembers = mailPropertiesQuery.data?.members ?? []
  const mailReminders = useMailReminders({ bindingId: connection.bindingId, enabled: true, workspaceId: connection.workspaceId })
  const [draftFilter, setDraftFilter] = useState<MailFilterExpression | null>(null)
  useEffect(() => {
    setDraftFilter(activePersistedView ? cloneMailFilter(activePersistedView.config.filter) : null)
  }, [activePersistedView?.id, activePersistedView?.updatedAt])
  const effectiveFilter = draftFilter ?? activePersistedView?.config.filter ?? null
  const filterDirty = Boolean(
    activePersistedView &&
    effectiveFilter &&
    !mailFiltersEqual(effectiveFilter, activePersistedView.config.filter),
  )
  const indexProgress = persistedViewsQuery.data?.index
  const indexProgressKey = indexProgress
    ? `${indexProgress.status}:${indexProgress.indexedThreadCount}`
    : "none"
  const refetchPersistedViews = persistedViewsQuery.refetch
  const providerView = providerViewForOrganizationRoute(activePersistedView, activeSystemFolder)
  useEffect(() => {
    const timer = window.setTimeout(() => setIndexedSearch(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])
  const indexedMailQuery = useIndexedMailView({
    bindingId: connection.bindingId,
    enabled: Boolean(activePersistedView || activeSystemFolder),
    filter: activePersistedView && effectiveFilter ? effectiveFilter : undefined,
    routeId: view,
    search: indexedSearch,
    workspaceId: connection.workspaceId,
  })
  const mailGroupsQuery = useMailGroups({
    bindingId: connection.bindingId,
    enabled: Boolean(activePersistedView?.config.group),
    filter: activePersistedView && effectiveFilter ? effectiveFilter : undefined,
    routeId: view,
    search: indexedSearch,
    workspaceId: connection.workspaceId,
  })
  const indexedItems = indexedMailQuery.data?.pages.flatMap((page) => page.threads) ?? []
  const indexedThreads = indexedMailQuery.data?.pages.flatMap((page) =>
    page.threads.map((indexed) => indexed.thread)) ?? []
  const customValuesByThread = useMemo(() => new Map(indexedItems.map((indexed) => [indexed.thread.id, indexed.customValues])), [indexedItems])
  const visibleThreads = indexedThreads
  useEffect(() => {
    if (!persistedViewsQuery.isSuccess || !inboxView) return
    if (activePersistedView || activeSystemFolder) return
    void navigate({
      replace: true,
      search: { compose, view: inboxView.id },
      to: "/mail",
    })
  }, [activePersistedView, activeSystemFolder, compose, inboxView, navigate, persistedViewsQuery.isSuccess])
  useEffect(() => {
    if (
      !indexProgress ||
      indexProgress.status === "ready" ||
      indexProgress.status === "error"
    ) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void apiFetch(`${mailApiBasePath(connection.workspaceId)}/index/advance`, {
        method: "POST",
      }).catch(() => undefined).finally(() => {
        if (!cancelled) void refetchPersistedViews()
      })
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [connection.workspaceId, indexProgressKey, refetchPersistedViews])
  const controller = useMailController({
    connection,
    filter: activePersistedView?.config.filter ?? null,
    query: "",
    userId,
    view: providerView,
  })
  useMailRealtime({
    bindingId: connection.bindingId ?? connection.connectionId!,
    connectionId: connection.connectionId!,
    enabled: controller.online && Boolean(controller.database),
    onSynchronize: controller.refresh,
    workspaceId: connection.workspaceId!,
  })
  useEffect(() => {
    if (!controller.error) return
    toast.error(getApiErrorMessage(controller.error), { id: "mail-background-error" })
  }, [controller.error])
  useEffect(() => {
    if (!indexedMailQuery.error) return
    toast.error(getApiErrorMessage(indexedMailQuery.error), { id: "mail-index-query-error" })
  }, [indexedMailQuery.error])
  const displayedThreads = visibleThreads
  const selectedThread = displayedThreads.find((thread) => thread.id === selection) ?? null
  const selectedMessages = useLiveQuery(
    () => controller.database && selection
      ? controller.database.messages.where("threadId").equals(selection).sortBy("internalDate")
      : [],
    [controller.database, selection],
    [],
  )
  const selectedPropertiesQuery = useMailThreadProperties({
    bindingId: connection.bindingId,
    enabled: true,
    threadId: selection,
    workspaceId: connection.workspaceId,
  })
  const selectedIndex = selectedThread
    ? displayedThreads.findIndex((thread) => thread.id === selectedThread.id)
    : -1
  const previousId = selectedIndex > 0 ? displayedThreads[selectedIndex - 1]?.id ?? null : null
  const nextId = selectedIndex >= 0 ? displayedThreads[selectedIndex + 1]?.id ?? null : null
  const ActiveViewIcon = activePersistedView
    ? persistedViewIcon(activePersistedView)
    : activeSystemFolder
      ? organizationFolderDetails[activeSystemFolder].icon
      : InboxIcon
  const activeViewLabel = activePersistedView?.name ?? (activeSystemFolder
    ? organizationFolderDetails[activeSystemFolder].label
    : "Inbox")
  const idlePrefetchIds = useMemo(() => displayedThreads.slice(0, 6).map((thread) => thread.id), [displayedThreads])
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
  useEffect(() => setCollapsedGroups(new Set()), [activePersistedView?.config.group?.propertyId, view])

  useEffect(() => {
    if (!compose) return
    setComposerSeed({})
    void navigate({ replace: true, search: { compose: undefined, view }, to: "/mail" })
  }, [compose, navigate, view])

  const groupedThreads = useMemo(
    () => groupMailThreads(
      displayedThreads,
      activePersistedView?.config.group ?? null,
      controller.labels,
      mailGroupsQuery.data?.groups ?? [],
      customProperties,
      customValuesByThread,
    ),
    [activePersistedView?.config.group, controller.labels, customProperties, customValuesByThread, displayedThreads, mailGroupsQuery.data?.groups],
  )
  const runBatch = (modification: MailModifyRequest) => controller
    .batchModifyThreads([...batchSelection], modification)
    .then(() => setBatchSelection(new Set()))
  const saveFilters = async () => {
    if (!activePersistedView || !effectiveFilter) return
    try {
      await persistedViewsQuery.updateView({
        value: { config: { ...activePersistedView.config, filter: effectiveFilter } },
        viewId: activePersistedView.id,
      })
      toast.success("Filters saved")
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }
  const saveFiltersAsNewView = async () => {
    if (!activePersistedView || !effectiveFilter) return
    try {
      const { view: created } = await persistedViewsQuery.createView({
        config: { ...activePersistedView.config, filter: effectiveFilter },
        icon: activePersistedView.icon,
        name: `${activePersistedView.name} filtered`,
      })
      await navigate({ search: { compose, view: created.id }, to: "/mail" })
      toast.success("View created")
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }
  const saveGroup = async (group: MailGroupConfig | null) => {
    if (!activePersistedView) return
    try {
      await persistedViewsQuery.updateView({
        value: { config: { ...activePersistedView.config, group } },
        viewId: activePersistedView.id,
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }
  const saveViewConfig = async (config: MailPersistedView["config"]) => {
    if (!activePersistedView) return
    try {
      await persistedViewsQuery.updateView({ value: { config }, viewId: activePersistedView.id })
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }
  const moveThreadToGroup = async (threadId: string, groupKey: string) => {
    const propertyId = activePersistedView?.config.group?.propertyId
    if (!propertyId || !isMutableMailGroup(propertyId)) return
    const enabled = groupKey === "true"
    const modification = propertyId === "starred"
      ? enabled ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] }
      : propertyId === "unread"
        ? enabled ? { addLabelIds: ["UNREAD"] } : { removeLabelIds: ["UNREAD"] }
        : propertyId === "important" || propertyId === "priority"
          ? enabled ? { addLabelIds: ["IMPORTANT"] } : { removeLabelIds: ["IMPORTANT"] }
          : propertyId === "labels" && groupKey !== "empty"
            ? { addLabelIds: [groupKey] }
            : null
    if (modification) return controller.modifyThread(threadId, modification)
    const customProperty = customProperties.find((property) => property.id === propertyId)
    if (!customProperty || groupKey === "empty") return
    const currentValue = customValuesByThread.get(threadId)?.[propertyId]
    const value: MailThreadPropertyValue["value"] = customProperty.type === "checkbox"
      ? groupKey === "true"
      : customProperty.type === "number"
        ? Number(groupKey)
        : customProperty.type === "multi_select" || customProperty.type === "person"
          ? [...new Set([...(Array.isArray(currentValue) ? currentValue.filter((item): item is string => typeof item === "string") : []), groupKey])]
          : groupKey
    await mailPropertiesQuery.setThreadValue({ propertyId, threadId, value })
  }
  const runHoverAction = async (thread: MailThreadSummary, action: MailHoverAction) => {
    if (action.kind === "star") return controller.modifyThread(thread.id, thread.starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] })
    if (action.kind === "archive") return controller.modifyThread(thread.id, thread.labelIds.includes("INBOX") ? { removeLabelIds: ["INBOX"] } : { addLabelIds: ["INBOX"] })
    if (action.kind === "bin") return controller.actOnThread(thread.id, thread.labelIds.includes("TRASH") ? "restore" : "trash")
    if (action.kind === "read_unread") return controller.modifyThread(thread.id, thread.unread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })
    if (action.kind === "spam") return controller.modifyThread(thread.id, { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] })
    if (action.kind === "specific_label" && action.labelId) {
      await controller.modifyThread(thread.id, {
        addLabelIds: [action.labelId],
        removeLabelIds: action.effect === "archive" ? ["INBOX"] : undefined,
      })
      if (action.effect === "bin") await controller.actOnThread(thread.id, "trash")
      return
    }
    if (action.kind === "command" || action.kind === "any_label") {
      setRowActionDialog({ mode: action.kind === "command" ? "command" : "label", thread })
      return
    }
    if (action.kind === "reply") {
      await controller.openThread(thread.id)
      const messages = controller.database ? await controller.database.messages.where("threadId").equals(thread.id).sortBy("internalDate") : []
      const latest = messages.at(-1)
      if (!latest) throw new Error("This thread must finish loading before you can reply.")
      setComposerSeed(replySeed(latest, connection.email!))
      return
    }
    if (action.kind === "remind") {
      const defaultDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
      const selected = window.prompt("Remind me at (YYYY-MM-DDTHH:mm)", defaultDate)?.trim()
      if (!selected) return
      const remindAt = new Date(selected)
      if (!Number.isFinite(remindAt.getTime())) throw new Error("Enter a valid reminder date and time.")
      await mailReminders.schedule({ remindAt: remindAt.toISOString(), threadId: thread.id })
      await controller.refresh()
      toast.success("Reminder scheduled")
      return
    }
    if (action.kind === "unsubscribe") {
      const result = await apiFetch<MailUnsubscribeResponse>(`${mailApiBasePath(connection.workspaceId)}/threads/${encodeURIComponent(thread.id)}/unsubscribe`, { body: "{}", method: "POST" })
      if (result.executed) { toast.success("Unsubscribed"); return }
      if (!result.fallback || !window.confirm(`Open the sender's ${result.fallback.kind === "mailto" ? "email" : "website"} unsubscribe flow?`)) return
      if (result.fallback.kind === "mailto") window.location.href = result.fallback.url
      else window.open(result.fallback.url, "_blank", "noopener,noreferrer")
    }
  }
  const visibleCustomProperties = activePersistedView
    ? orderedVisibleCustomProperties(activePersistedView, customProperties)
    : customProperties
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
    propertyBar: (
      <MailThreadPropertyBar
        disabled={mailPropertiesQuery.mutating || selectedPropertiesQuery.setting}
        members={propertyMembers}
        onChange={(propertyId, value) => selection && void mailPropertiesQuery.setThreadValue({ propertyId, threadId: selection, value })}
        properties={customProperties}
        values={selectedPropertiesQuery.data?.values ?? []}
      />
    ),
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
                          <MailViewSettingsMenu
                            databaseEditor={activePersistedView ? (
                              <MailDatabaseSyncPanel
                                config={activePersistedView.config}
                                onChange={(config) => persistedViewsQuery.updateView({ value: { config }, viewId: activePersistedView.id }).then(() => undefined)}
                                properties={customProperties}
                                saving={persistedViewsQuery.savingView}
                                viewId={activePersistedView.id}
                                viewName={activePersistedView.name}
                                workspaceId={connection.workspaceId!}
                              />
                            ) : undefined}
                            filterCount={effectiveFilter ? countMailFilterConditions(effectiveFilter) : 0}
                            filterDirty={filterDirty}
                            filterEditor={activePersistedView && effectiveFilter ? (
                              <MailFilterEditor expression={effectiveFilter} labels={controller.labels} members={propertyMembers} onChange={setDraftFilter} properties={customProperties} />
                            ) : undefined}
                            groupEditor={activePersistedView ? (
                              <MailGroupEditor customProperties={customProperties} group={activePersistedView.config.group} onChange={(group) => void saveGroup(group)} saving={persistedViewsQuery.savingView} />
                            ) : undefined}
                            hoverActionsEditor={activePersistedView ? (
                              <MailHoverActionsPanel
                                actions={activePersistedView.config.hoverActions}
                                labels={controller.labels}
                                onChange={(hoverActions) => void saveViewConfig({ ...activePersistedView.config, hoverActions })}
                                saving={persistedViewsQuery.savingView}
                              />
                            ) : undefined}
                            propertiesEditor={activePersistedView ? (
                              <MailPropertiesPanel
                                config={activePersistedView.config}
                                members={propertyMembers}
                                mutating={mailPropertiesQuery.mutating || persistedViewsQuery.savingView}
                                onConfigChange={(config) => void saveViewConfig(config)}
                                onCreate={mailPropertiesQuery.createProperty}
                                onDelete={mailPropertiesQuery.deleteProperty}
                                onUpdate={mailPropertiesQuery.updateProperty}
                                properties={customProperties}
                              />
                            ) : undefined}
                            visiblePropertyCount={activePersistedView ? new Set([...mailSystemPropertyCatalog.map((property) => property.id), ...customProperties.map((property) => property.id)].filter((id) => !activePersistedView.config.hiddenPropertyIds.includes(id))).size : 0}
                          />
                        </div>
                      </div>

                      {activePersistedView && effectiveFilter ? (
                        <MailFilterToolbar
                          dirty={filterDirty}
                          expression={effectiveFilter}
                          labels={controller.labels}
                          members={propertyMembers}
                          onChange={setDraftFilter}
                          onReset={() => setDraftFilter(cloneMailFilter(activePersistedView.config.filter))}
                          onSave={() => void saveFilters()}
                          onSaveAsNew={() => void saveFiltersAsNewView()}
                          properties={customProperties}
                          saving={persistedViewsQuery.savingView}
                        />
                      ) : null}

                      {indexProgress && indexProgress.status !== "ready" ? (
                        <div aria-live="polite" className="mt-3 rounded-md border border-stroke-default bg-surface-raised px-3 py-2 text-xs text-content-secondary" role="status">
                          {indexProgress.status === "error"
                            ? "Mail indexing paused. It will retry automatically."
                            : `Indexing full mailbox… ${indexProgress.indexedThreadCount}${indexProgress.resultSizeEstimate ? ` of about ${indexProgress.resultSizeEstimate}` : ""} threads`}
                        </div>
                      ) : null}

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

                      {indexedMailQuery.isLoading ? <MailboxLoading /> : groupedThreads.length ? (
                        <div>
                          {groupedThreads.map(({ count, key, label, mutable, threads }) => (
                            <section
                              aria-labelledby={`mail-group-${key}`}
                              className="pt-3"
                              key={key}
                              onDragOver={(event) => {
                                if (mutable) event.preventDefault()
                              }}
                              onDrop={(event) => {
                                if (!mutable) return
                                event.preventDefault()
                                const threadId = event.dataTransfer.getData("application/x-zilobase-mail-thread")
                                if (threadId) void moveThreadToGroup(threadId, key)
                              }}
                            >
                              <button
                                aria-expanded={!collapsedGroups.has(key)}
                                className="flex w-full items-center gap-1.5 px-2 pb-1.5 text-left text-xs font-semibold text-content-secondary"
                                id={`mail-group-${key}`}
                                onClick={() => setCollapsedGroups((current) => {
                                  const next = new Set(current)
                                  if (next.has(key)) next.delete(key)
                                  else next.add(key)
                                  return next
                                })}
                                type="button"
                              >
                                {collapsedGroups.has(key) ? <ChevronDown className="size-3 -rotate-90" /> : <ChevronDown className="size-3" />}
                                <span>{label}</span>
                                <span className="font-normal">{count}</span>
                              </button>
                              {!collapsedGroups.has(key) ? <div className="border-t border-stroke-default">
                                {threads.map((thread) => (
                                  <MailThreadRow
                                    key={thread.id}
                                    mutating={controller.mutating}
                                    batchSelected={batchSelection.has(thread.id)}
                                    onAction={(action) => controller.actOnThread(thread.id, action)}
                                    onHoverAction={(action) => runHoverAction(thread, action)}
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
                                    groupDraggable={mutable}
                                    hoverActions={activePersistedView?.config.hoverActions}
                                    labels={controller.labels}
                                    customProperties={visibleCustomProperties}
                                    customValues={customValuesByThread.get(thread.id) ?? {}}
                                    propertyMembers={propertyMembers}
                                    selected={selection === thread.id}
                                    thread={thread}
                                  />
                                ))}
                              </div> : null}
                            </section>
                          ))}
                          {indexedMailQuery.hasNextPage ? (
                            <div className="flex justify-center pt-5">
                              <Button
                                disabled={!controller.online || indexedMailQuery.isFetchingNextPage}
                                onClick={() => void indexedMailQuery.fetchNextPage()}
                                type="button"
                                variant="outline"
                              >
                                {indexedMailQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div>
                          <MailEmptyState offline={!controller.online} query={query} />
                          {indexedMailQuery.hasNextPage ? (
                            <div className="flex justify-center pt-5">
                              <Button
                                disabled={!controller.online || indexedMailQuery.isFetchingNextPage}
                                onClick={() => void indexedMailQuery.fetchNextPage()}
                                type="button"
                                variant="outline"
                              >
                                {indexedMailQuery.isFetchingNextPage ? "Searching…" : "Continue searching"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
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
      <MailRowActionDialog
        labels={controller.labels}
        mode={rowActionDialog?.mode ?? null}
        onClose={() => setRowActionDialog(null)}
        onSelect={({ kind, labelId }) => {
          const thread = rowActionDialog?.thread
          if (!thread) return
          if (kind === "any_label") {
            setRowActionDialog({ mode: "label", thread })
            return
          }
          setRowActionDialog(null)
          void runHoverAction(thread, { hidden: false, id: `command-${kind}`, kind, labelId }).catch(showMailError)
        }}
        thread={rowActionDialog?.thread ?? null}
      />
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

function MailThreadRow({ batchSelected, customProperties = [], customValues = {}, groupDraggable = false, hoverActions, labels = [], mutating, onAction, onBatchToggle, onHoverAction, onModify, onOpen, onPrefetch, online, propertyMembers = [], selected, thread }: {
  batchSelected: boolean
  customProperties?: MailPropertyDefinition[]
  customValues?: Record<string, MailThreadPropertyValue["value"]>
  groupDraggable?: boolean
  hoverActions?: MailHoverAction[]
  labels?: MailLabelRecord[]
  mutating: boolean
  onAction: (action: "restore" | "trash") => Promise<void>
  onBatchToggle: (checked: boolean) => void
  onHoverAction?: (action: MailHoverAction) => Promise<void>
  onModify: (modification: MailModifyRequest) => Promise<void>
  onOpen: () => void
  onPrefetch: () => void
  online: boolean
  propertyMembers?: Parameters<typeof formatMailPropertyValue>[2]
  selected: boolean
  thread: MailThreadSummary
}) {
  const participant = thread.participants[0]
  return (
    <div
      className={`group/mail-row flex h-9 w-full items-center hover:bg-action-neutral-hover ${selected ? "bg-action-neutral-hover text-action-on-neutral" : ""}`}
      data-selected={selected ? "true" : undefined}
      draggable={groupDraggable}
      onDragStart={(event) => {
        if (!groupDraggable) return
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("application/x-zilobase-mail-thread", thread.id)
      }}
    >
      <Checkbox aria-label={`Select ${thread.subject}`} checked={batchSelected} className="ml-2 shrink-0" onCheckedChange={(checked) => onBatchToggle(checked === true)} />
      <button className="grid min-w-0 flex-1 grid-cols-[minmax(8rem,0.8fr)_minmax(12rem,2fr)_minmax(0,auto)_auto] items-center gap-3 px-2 text-left text-sm" onClick={onOpen} onFocus={onPrefetch} onPointerEnter={onPrefetch} type="button">
        <span className={`truncate ${thread.unread ? "font-semibold text-content-primary" : "text-content-secondary"}`}>
          {participant?.name || participant?.address || "Unknown sender"}
          {thread.messageCount > 1 ? ` (${thread.messageCount})` : ""}
        </span>
        <span className="min-w-0 truncate">
          <span className={thread.unread ? "font-semibold text-content-primary" : "text-content-primary"}>{thread.subject}</span>
          <span className="text-content-secondary"> — {thread.snippet}</span>
        </span>
        {customProperties.length ? (
          <span className="hidden min-w-0 items-center gap-1 xl:flex">
            {customProperties.slice(0, 2).map((property) => {
              const label = formatMailPropertyValue(property, customValues[property.id], propertyMembers)
              return label ? <span className="max-w-28 truncate rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-content-secondary" key={property.id}>{label}</span> : null
            })}
          </span>
        ) : null}
        <span className="flex items-center gap-2 text-xs text-content-secondary group-hover/mail-row:hidden">
          {thread.attachmentCount ? <Paperclip className="size-3.5" /> : null}
          {thread.starred ? <StarIcon className="size-3.5 text-feedback-warning-text" weight="fill" /> : null}
          {formatThreadDate(thread.internalDate)}
        </span>
      </button>
      <div className="hidden shrink-0 items-center pr-1 group-hover/mail-row:flex">
        {hoverActions && onHoverAction ? hoverActions.filter((action) => !action.hidden).map((action) => (
          <MailActionButton
            disabled={!online || mutating}
            icon={<MailHoverActionIcon action={action} />}
            key={action.id}
            label={hoverActionLabel(action, labels, thread)}
            onClick={() => onHoverAction(action)}
          />
        )) : <>
          <MailActionButton disabled={!online || mutating} icon={<StarIcon weight={thread.starred ? "fill" : "regular"} />} label={thread.starred ? "Unstar thread" : "Star thread"} onClick={() => onModify(thread.starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] })} />
          <MailActionButton disabled={!online || mutating} icon={<MailIcon />} label={thread.unread ? "Mark thread read" : "Mark thread unread"} onClick={() => onModify(thread.unread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })} />
          <MailActionButton disabled={!online || mutating} icon={thread.labelIds.includes("TRASH") ? <ArchiveIcon /> : <TrashIcon />} label={thread.labelIds.includes("TRASH") ? "Restore thread" : "Move thread to trash"} onClick={() => onAction(thread.labelIds.includes("TRASH") ? "restore" : "trash")} />
        </>}
      </div>
    </div>
  )
}

function hoverActionLabel(action: MailHoverAction, labels: MailLabelRecord[], thread: MailThreadSummary) {
  if (action.kind === "specific_label") return `Apply ${labels.find((label) => label.id === action.labelId)?.name ?? "label"}`
  if (action.kind === "star") return thread.starred ? "Unstar thread" : "Star thread"
  if (action.kind === "read_unread") return thread.unread ? "Mark thread read" : "Mark thread unread"
  if (action.kind === "bin") return thread.labelIds.includes("TRASH") ? "Restore thread" : "Move thread to bin"
  return mailHoverActionCatalog[action.kind].label
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
  propertyBar?: ReactNode
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

function ConversationBody({ labels, messages, mutating, onActOnMessage, onCompose, onDownload, onLoadInlineAttachment, onModifyMessage, online, ownEmail, propertyBar, thread }: ConversationProps) {
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
      <Button disabled={!workspaceId || loading || pending || connection?.providerConfigured === false} onClick={() => void connect()} type="button">
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

function countMailFilterConditions(filter: MailFilterExpression): number {
  return filter.filters.reduce(
    (count, node) => count + (node.type === "condition" ? 1 : countMailFilterConditions(node)),
    0,
  )
}

function groupMailThreads(
  threads: MailThreadSummary[],
  group: MailGroupConfig | null,
  labels: MailLabelRecord[],
  serverGroups: MailQueryGroup[],
  customProperties: MailPropertyDefinition[],
  customValuesByThread: Map<string, Record<string, MailThreadPropertyValue["value"]>>,
) {
  if (!group) return messageGroups
    .map((label) => ({
      count: threads.filter((thread) => dateGroup(thread.internalDate) === label).length,
      key: label.toLowerCase(),
      label,
      mutable: false,
      threads: threads.filter((thread) => dateGroup(thread.internalDate) === label),
    }))
    .filter((entry) => entry.threads.length > 0)

  const buckets = new Map<string, MailThreadSummary[]>()
  for (const thread of threads) {
    for (const key of clientGroupKeys(thread, group.propertyId, customValuesByThread.get(thread.id))) {
      buckets.set(key, [...buckets.get(key) ?? [], thread])
    }
  }
  const descriptors = serverGroups.length
    ? serverGroups
    : [...buckets.keys()].map((key) => ({
      count: buckets.get(key)?.length ?? 0,
      cursor: "",
      key,
      label: clientGroupLabel(key, group.propertyId, labels, customProperties),
      mutable: isMutableMailGroup(group.propertyId),
    }))
  return descriptors
    .filter((descriptor) => !group.hideEmptyGroups || descriptor.count > 0)
    .map((descriptor) => ({
      ...descriptor,
      label: clientGroupLabel(descriptor.key, group.propertyId, labels, customProperties, descriptor.label),
      threads: group.direction === "ascending"
        ? [...buckets.get(descriptor.key) ?? []].reverse()
        : buckets.get(descriptor.key) ?? [],
    }))
}

function clientGroupKeys(thread: MailThreadSummary, propertyId: string, customValues?: Record<string, MailThreadPropertyValue["value"]>): string[] {
  if (propertyId === "date" || propertyId === "received_date") return [dateGroup(thread.internalDate).toLowerCase()]
  if (propertyId === "starred") return [String(thread.starred)]
  if (propertyId === "unread") return [String(thread.unread)]
  if (propertyId === "important" || propertyId === "priority") return [String(thread.labelIds.includes("IMPORTANT"))]
  if (propertyId === "labels") return thread.labelIds.length ? thread.labelIds : ["empty"]
  const address = thread.participants[0]?.address ?? ""
  if (propertyId === "from") return [address.toLowerCase() || "empty"]
  if (propertyId === "email_domain") return [address.split("@")[1]?.toLowerCase() || "empty"]
  const customValue = customValues?.[propertyId]
  if (Array.isArray(customValue)) {
    const keys = customValue.map((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : "").filter(Boolean)
    return keys.length ? keys : ["empty"]
  }
  return customValue === null || customValue === undefined || customValue === "" ? ["empty"] : [String(customValue)]
}

function clientGroupLabel(key: string, propertyId: string, labels: MailLabelRecord[], customProperties: MailPropertyDefinition[], fallback?: string) {
  if (propertyId === "labels") return labels.find((label) => label.id === key)?.name ?? (key === "empty" ? "No label" : fallback ?? key)
  if (propertyId === "starred") return key === "true" ? "Starred" : "Not starred"
  if (propertyId === "unread") return key === "true" ? "Unread" : "Read"
  if (propertyId === "important" || propertyId === "priority") return key === "true" ? "Important" : "Not important"
  const customProperty = customProperties.find((property) => property.id === propertyId)
  if (customProperty) return customProperty.options.find((option) => option.id === key)?.name ?? fallback ?? (key === "empty" ? `No ${customProperty.name}` : key)
  return fallback ?? (key === "empty" ? "Empty" : key)
}

function orderedVisibleCustomProperties(view: MailPersistedView, properties: MailPropertyDefinition[]) {
  const byId = new Map(properties.map((property) => [property.id, property]))
  const ordered = view.config.propertyOrder.map((id) => byId.get(id)).filter((property): property is MailPropertyDefinition => Boolean(property))
  return [...ordered, ...properties.filter((property) => !view.config.propertyOrder.includes(property.id))]
    .filter((property) => !view.config.hiddenPropertyIds.includes(property.id))
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
