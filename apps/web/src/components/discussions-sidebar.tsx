"use client"

import {
  BellIcon,
  FilterIcon,
  MessageSquare,
  PanelRightCloseIcon,
} from "lucide-react"

import { WorkspaceCommentThread } from "@/components/workspace-comments"
import { useWorkspaceThreads } from "@notelab/features/workspaces"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useMemo } from "react"

export function DiscussionsSidebar({
  workspaceId,
  onClose,
  onOpen,
  open,
}: {
  workspaceId?: string | null
  onClose: () => void
  onOpen: () => void
  open: boolean
}) {
  return (
    <>
      {!open ? (
        <Button
          aria-label="Open discussions sidebar"
          className="fixed bottom-4 right-20 z-40 h-10 rounded-full border-sidebar-border bg-sidebar px-3 text-sidebar-foreground shadow-lg ring-1 ring-foreground/10 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onOpen}
          type="button"
          variant="outline"
        >
          <MessageSquare className="size-4" />
          <span>Discuss</span>
        </Button>
      ) : null}

      <aside
        aria-label="Discussions sidebar"
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[min(100vw,26rem)] flex-col border-l border-sidebar-border bg-background text-foreground transition-transform duration-200 ease-linear md:relative md:inset-auto md:z-20 md:h-svh md:w-[24rem] md:shrink-0",
          open ? "translate-x-0" : "translate-x-full md:hidden",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            aria-label="Close discussions sidebar"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelRightCloseIcon />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-medium text-sm">All discussions</h2>
          </div>
          <Button
            aria-label="Filter discussions"
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground"
          >
            <FilterIcon className="size-4" />
          </Button>
          <Button
            aria-label="Notifications"
            size="icon-sm"
            type="button"
            variant="ghost"
            className="text-muted-foreground"
          >
            <BellIcon className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm" data-discussions-scroll-shell>
          <DiscussionsThreads workspaceId={workspaceId} />
        </div>
      </aside>
    </>
  )
}

function DiscussionsThreads({ workspaceId }: { workspaceId?: string | null }) {
  const { data: threadsData } = useWorkspaceThreads(workspaceId)

  const threadItems = threadsData?.threads ?? []

  const activeUnresolved = threadItems.find((t) => !t.thread?.resolvedAt)
  const showActiveDiscussion = Boolean(
    activeUnresolved && activeUnresolved.comments.length > 0,
  )
  // Past threads: everything except the active unresolved slot, only if they have comments
  const past = threadItems.filter(
    (t) =>
      t.thread &&
      t.comments.length > 0 &&
      t.thread.id !== activeUnresolved?.thread?.id,
  )

  const pastWithGroupLabels = useMemo(() => {
    return past.map((item, index) => {
      const dateStr = item.thread?.lastActivityAt || item.thread?.createdAt || new Date().toISOString()
      const label = getDateLabel(dateStr)
      const prevItem = index > 0 ? past[index - 1] : null
      const prevLabel = prevItem ? getDateLabel(prevItem.thread?.lastActivityAt || prevItem.thread?.createdAt || new Date().toISOString()) : null
      const showLabel = label !== prevLabel
      return { item, label, showLabel }
    })
  }, [past])

  function getDateLabel(dateStr: string): string {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return "Older"
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    })
  }

  if (!workspaceId) {
    return (
      <div className="px-3 py-8 text-center text-muted-foreground">
        Open a page to view its discussions.
      </div>
    )
  }

  return (
    <>
      {/* Current / active discussion — only when it already has comments */}
      {showActiveDiscussion ? (
        <div className="-mx-3">
          <div className="px-3 py-3 hover:bg-sidebar hover:text-sidebar-foreground">
            <WorkspaceCommentThread
              collapseLongThreads
              workspaceId={workspaceId}
            />
          </div>
        </div>
      ) : null}

      {/* Past threads (resolved or previous discussions) */}
      {past.length > 0 ? (
        <div className="-mx-3">
          <div className="divide-y divide-border">
            {pastWithGroupLabels.map(({ item, label, showLabel }) => (
              <div key={item.thread!.id} className="px-3 py-3 hover:bg-sidebar hover:text-sidebar-foreground">
                {showLabel && (
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-2">
                    {label}
                  </div>
                )}
                <WorkspaceCommentThread
                  collapseLongThreads
                  threadId={item.thread!.id}
                  workspaceId={workspaceId}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}
