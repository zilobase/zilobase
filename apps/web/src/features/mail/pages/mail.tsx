import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useSession } from "@zilobase/features/auth"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  mailConnectionQueryOptions,
  mailApiBasePath,
  mailSystemFolderIds,
  mailSystemPropertyCatalog,
  type MailAddress,
  type MailConnection,
  type MailFilterExpression,
  type MailGroupConfig,
  type MailHoverAction,
  type MailModifyRequest,
  type MailSendResponse,
  type MailThreadSummary,
  type MailPersistedView,
  type MailThreadPropertyValue,
  type MailUnsubscribeResponse,
} from "@zilobase/features/mail"
import {
  useIndexedMailView,
  useMailGroups,
  useMailProperties,
  useMailReminders,
  useMailThreadProperties,
  useMailViews,
} from "@zilobase/features/mail/react"
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages"
import { toast } from "sonner"

import { apiFetch, getApiErrorMessage } from "@/features/desktop/network/api"
import {
  BanIcon,
  FilePenLineIcon,
  InboxIcon,
  MailIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
} from "@/shared/components/icons"
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog"
import {
  MainPaneHeaderLeadingControl,
  PagePaneHeader,
} from "@/features/pages/components"
import {
  PageSidePaneHeaderCell,
  PageSidePaneLayout,
  PageSidePaneShell,
} from "@/features/pages/context"

import { MailLabelMenu, showMailError } from "../components/mail-actions"
import { MailComposer } from "../components/mail-composer"
import {
  ConversationBody,
  ConversationToolbar,
  ConversationViewer,
  type ConversationProps,
} from "../components/mail-conversation-viewer"
import {
  MailboxLoading,
  MailCenteredState,
  MailConnectionState,
} from "../components/mail-connection-state"
import { MailViewSettingsMenu } from "../components/mail-view-settings-menu"
import { cloneMailFilter, MailFilterEditor, mailFiltersEqual, MailFilterToolbar } from "../components/mail-filter-editor"
import { MailGroupEditor } from "../components/mail-group-editor"
import { MailPropertiesPanel, MailThreadPropertyBar } from "../components/mail-properties-panel"
import { MailHoverActionsPanel } from "../components/mail-hover-actions-panel"
import { MailRowActionDialog } from "../components/mail-row-action-dialog"
import { MailDatabaseSyncPanel } from "../components/mail-database-sync-panel"
import { MailboxThreadList } from "../components/mailbox-thread-list"
import { MailboxTopbar } from "../components/mailbox-topbar"
import { replySeed, type MailComposeSeed } from "../model/mail-compose"
import { useMailRealtime } from "../model/mail-realtime"
import { useMailController } from "../model/mail-sync-controller"
import {
  countMailFilterConditions,
  groupMailThreads,
  isMutableMailGroup,
  orderedVisibleCustomProperties,
  providerViewForOrganizationRoute,
} from "../model/mail-view-model"

const organizationFolderDetails = {
  all_mail: { icon: MailIcon, label: "All Mail" },
  bin: { icon: Trash2Icon, label: "Bin" },
  drafts: { icon: FilePenLineIcon, label: "Drafts" },
  sent: { icon: SendIcon, label: "Sent" },
  spam: { icon: BanIcon, label: "Spam" },
} as const

export default function MailPage() {
  const activeWorkspaceId = useActiveWorkspaceId()
  const connectionQuery = useQuery(
    mailConnectionQueryOptions(apiFetch, activeWorkspaceId),
  )

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
  return <MailboxController connection={connection} userId={session.user.id} />
}

function MailboxController({ connection, userId }: { connection: MailConnection; userId: string }) {
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
  const filterSenders = useMemo<MailAddress[]>(() => {
    const unique = new Map<string, MailAddress>()
    for (const sender of indexedMailQuery.data?.pages.flatMap((page) => page.threads.flatMap((thread) => thread.from)) ?? []) {
      const address = sender.address.trim().toLowerCase()
      if (address && !unique.has(address)) unique.set(address, sender)
    }
    return [...unique.values()]
  }, [indexedMailQuery.data?.pages])
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
                      <MailboxTopbar
                        activeViewIcon={ActiveViewIcon}
                        activeViewLabel={activeViewLabel}
                        batchCount={batchSelection.size}
                        filterToolbar={activePersistedView && effectiveFilter ? (
                          <MailFilterToolbar
                            dirty={filterDirty}
                            expression={effectiveFilter}
                            hideImplicitInbox={activePersistedView.templateId === "inbox"}
                            labels={controller.labels}
                            members={propertyMembers}
                            onChange={setDraftFilter}
                            onReset={() => setDraftFilter(cloneMailFilter(activePersistedView.config.filter))}
                            onSave={() => void saveFilters()}
                            onSaveAsNew={() => void saveFiltersAsNewView()}
                            properties={customProperties}
                            saving={persistedViewsQuery.savingView}
                            senders={filterSenders}
                          />
                        ) : undefined}
                        indexProgress={indexProgress}
                        labelMenu={(
                          <MailLabelMenu
                            labels={controller.labels}
                            mutating={controller.mutating}
                            onCreate={controller.createLabel}
                            onDelete={controller.deleteLabel}
                            onUpdate={controller.updateLabel}
                            online={controller.online}
                          />
                        )}
                        mutating={controller.mutating}
                        onBatchModify={runBatch}
                        onClearBatch={() => setBatchSelection(new Set())}
                        onCompose={() => setComposerSeed({})}
                        onQueryChange={setQuery}
                        onRefresh={() => void controller.refresh()}
                        online={controller.online}
                        query={query}
                        syncing={controller.syncing}
                        viewSettings={(
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
                            filterCount={effectiveFilter ? countMailFilterConditions(effectiveFilter, activePersistedView?.templateId === "inbox") : 0}
                            filterDirty={filterDirty}
                            filterEditor={activePersistedView && effectiveFilter ? (
                              <MailFilterEditor expression={effectiveFilter} hideImplicitInbox={activePersistedView.templateId === "inbox"} labels={controller.labels} members={propertyMembers} onChange={setDraftFilter} properties={customProperties} senders={filterSenders} />
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
                        )}
                      />
                      <MailboxThreadList
                        batchSelection={batchSelection}
                        collapsedGroups={collapsedGroups}
                        customProperties={visibleCustomProperties}
                        customValuesByThread={customValuesByThread}
                        fetchingNextPage={indexedMailQuery.isFetchingNextPage}
                        groupedThreads={groupedThreads}
                        hasNextPage={indexedMailQuery.hasNextPage}
                        hoverActions={activePersistedView?.config.hoverActions}
                        labels={controller.labels}
                        loading={indexedMailQuery.isLoading}
                        mutating={controller.mutating}
                        onActOnThread={controller.actOnThread}
                        onBatchSelectionChange={setBatchSelection}
                        onCollapsedGroupsChange={setCollapsedGroups}
                        onHoverAction={runHoverAction}
                        onLoadMore={() => void indexedMailQuery.fetchNextPage()}
                        onModifyThread={controller.modifyThread}
                        onMoveThreadToGroup={moveThreadToGroup}
                        onOpenThread={setSelection}
                        onPrefetchThread={(threadId) => void controller.prefetchThread(threadId)}
                        online={controller.online}
                        propertyMembers={propertyMembers}
                        query={query}
                        selection={selection}
                      />
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

function persistedViewIcon(view: MailPersistedView) {
  if (view.templateId === "inbox") return InboxIcon
  if (view.templateId === "starred") return StarIcon
  return MailIcon
}
