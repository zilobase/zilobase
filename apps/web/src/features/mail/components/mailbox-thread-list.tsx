import type {
  MailHoverAction,
  MailLabelRecord,
  MailModifyRequest,
  MailPropertyDefinition,
  MailThreadPropertyValue,
  MailThreadSummary,
} from "@zilobase/features/mail"

import { ChevronDown } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"

import { MailEmptyState, MailboxLoading } from "./mail-connection-state"
import { formatMailPropertyValue } from "./mail-properties-panel"
import { MailThreadRow } from "./mail-thread-row"
import type { MailThreadGroup } from "../model/mail-view-model"

export function MailboxThreadList({
  batchSelection,
  collapsedGroups,
  customProperties,
  customValuesByThread,
  fetchingNextPage,
  groupedThreads,
  hasNextPage,
  hoverActions,
  labels,
  loading,
  mutating,
  onActOnThread,
  onBatchSelectionChange,
  onCollapsedGroupsChange,
  onHoverAction,
  onLoadMore,
  onModifyThread,
  onMoveThreadToGroup,
  onOpenThread,
  onPrefetchThread,
  online,
  propertyMembers,
  query,
  selection,
}: {
  batchSelection: Set<string>
  collapsedGroups: Set<string>
  customProperties: MailPropertyDefinition[]
  customValuesByThread: Map<string, Record<string, MailThreadPropertyValue["value"]>>
  fetchingNextPage: boolean
  groupedThreads: MailThreadGroup[]
  hasNextPage: boolean
  hoverActions?: MailHoverAction[]
  labels: MailLabelRecord[]
  loading: boolean
  mutating: boolean
  onActOnThread: (threadId: string, action: "restore" | "trash") => Promise<void>
  onBatchSelectionChange: (selection: Set<string>) => void
  onCollapsedGroupsChange: (groups: Set<string>) => void
  onHoverAction: (thread: MailThreadSummary, action: MailHoverAction) => Promise<void>
  onLoadMore: () => void
  onModifyThread: (threadId: string, modification: MailModifyRequest) => Promise<void>
  onMoveThreadToGroup: (threadId: string, groupKey: string) => Promise<void> | undefined
  onOpenThread: (threadId: string) => void
  onPrefetchThread: (threadId: string) => void
  online: boolean
  propertyMembers: Parameters<typeof formatMailPropertyValue>[2]
  query: string
  selection: string | null
}) {
  if (loading) return <MailboxLoading />
  if (!groupedThreads.length) {
    return (
      <div>
        <MailEmptyState offline={!online} query={query} />
        {hasNextPage ? <LoadMoreButton disabled={!online || fetchingNextPage} label={fetchingNextPage ? "Searching…" : "Continue searching"} onClick={onLoadMore} /> : null}
      </div>
    )
  }

  return (
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
            if (threadId) void onMoveThreadToGroup(threadId, key)
          }}
        >
          <button
            aria-expanded={!collapsedGroups.has(key)}
            className="flex w-full items-center gap-1.5 px-2 pb-1.5 text-left text-xs font-semibold text-content-secondary"
            id={`mail-group-${key}`}
            onClick={() => {
              const next = new Set(collapsedGroups)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              onCollapsedGroupsChange(next)
            }}
            type="button"
          >
            {collapsedGroups.has(key) ? <ChevronDown className="size-3 -rotate-90" /> : <ChevronDown className="size-3" />}
            <span>{label}</span>
            <span className="font-normal">{count}</span>
          </button>
          {!collapsedGroups.has(key) ? <div className="border-t border-stroke-default">
            {threads.map((thread) => (
              <MailThreadRow
                batchSelected={batchSelection.has(thread.id)}
                customProperties={customProperties}
                customValues={customValuesByThread.get(thread.id) ?? {}}
                groupDraggable={mutable}
                hoverActions={hoverActions}
                key={thread.id}
                labels={labels}
                mutating={mutating}
                onAction={(action) => onActOnThread(thread.id, action)}
                onBatchToggle={(checked) => {
                  const next = new Set(batchSelection)
                  if (checked) next.add(thread.id)
                  else next.delete(thread.id)
                  onBatchSelectionChange(next)
                }}
                onHoverAction={(action) => onHoverAction(thread, action)}
                onModify={(modification) => onModifyThread(thread.id, modification)}
                onOpen={() => onOpenThread(thread.id)}
                onPrefetch={() => onPrefetchThread(thread.id)}
                online={online}
                propertyMembers={propertyMembers}
                selected={selection === thread.id}
                thread={thread}
              />
            ))}
          </div> : null}
        </section>
      ))}
      {hasNextPage ? <LoadMoreButton disabled={!online || fetchingNextPage} label={fetchingNextPage ? "Loading…" : "Load more"} onClick={onLoadMore} /> : null}
    </div>
  )
}

function LoadMoreButton({ disabled, label, onClick }: { disabled: boolean; label: string; onClick: () => void }) {
  return (
    <div className="flex justify-center pt-5">
      <Button disabled={disabled} onClick={onClick} type="button" variant="outline">{label}</Button>
    </div>
  )
}
