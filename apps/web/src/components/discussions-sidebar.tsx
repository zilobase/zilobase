"use client"

import {
  BellIcon,
  FilterIcon,
  PanelRightCloseIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { PageCommentThread } from "@/components/page-comments"
import { usePageThreads } from "@notelab/features/pages"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

const THREADS_PAGE_SIZE = 8

export function DiscussionsSidebarPanel({
  open,
  pageId,
  onClose,
}: {
  open: boolean
  pageId?: string | null
  onClose: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
          className="text-muted-foreground"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <FilterIcon className="size-4" />
        </Button>
        <Button
          aria-label="Notifications"
          className="text-muted-foreground"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <BellIcon className="size-4" />
        </Button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm"
        data-discussions-scroll-shell
      >
        <DiscussionsThreads open={open} pageId={pageId} />
      </div>
    </div>
  )
}

function DiscussionsThreads({
  open,
  pageId,
}: {
  open: boolean
  pageId?: string | null
}) {
  const scrollShellRef = useRef<HTMLDivElement | null>(null)
  const [visiblePastCount, setVisiblePastCount] = useState(THREADS_PAGE_SIZE)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const { data: threadsData, isLoading } = usePageThreads(
    pageId,
    Boolean(pageId && open),
  )

  const threadItems = threadsData?.threads ?? []

  const activeUnresolved = threadItems.find((t) => !t.thread?.resolvedAt)
  const showActiveDiscussion = Boolean(
    activeUnresolved && activeUnresolved.comments.length > 0,
  )
  const past = threadItems.filter(
    (t) =>
      t.thread &&
      t.comments.length > 0 &&
      t.thread.id !== activeUnresolved?.thread?.id,
  )

  const pastWithGroupLabels = useMemo(() => {
    return past.map((item, index) => {
      const dateStr =
        item.thread?.lastActivityAt ||
        item.thread?.createdAt ||
        new Date().toISOString()
      const label = getDateLabel(dateStr)
      const prevItem = index > 0 ? past[index - 1] : null
      const prevLabel = prevItem
        ? getDateLabel(
            prevItem.thread?.lastActivityAt ||
              prevItem.thread?.createdAt ||
              new Date().toISOString(),
          )
        : null
      const showLabel = label !== prevLabel
      return { item, label, showLabel }
    })
  }, [past])

  const visiblePast = pastWithGroupLabels.slice(0, visiblePastCount)
  const hasMorePast = visiblePastCount < pastWithGroupLabels.length

  useEffect(() => {
    setVisiblePastCount(THREADS_PAGE_SIZE)
    setIsLoadingMore(false)
  }, [pageId, open])

  const loadMorePastThreads = useCallback(() => {
    if (!hasMorePast || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)

    window.setTimeout(() => {
      setVisiblePastCount((current) =>
        Math.min(current + THREADS_PAGE_SIZE, pastWithGroupLabels.length),
      )
      setIsLoadingMore(false)
    }, 180)
  }, [hasMorePast, isLoadingMore, pastWithGroupLabels.length])

  useEffect(() => {
    if (!open) {
      return
    }

    const scrollShell = scrollShellRef.current?.closest(
      "[data-discussions-scroll-shell]",
    )

    if (!scrollShell) {
      return
    }

    const handleScroll = () => {
      if (!hasMorePast || isLoadingMore) {
        return
      }

      const remaining =
        scrollShell.scrollHeight -
        scrollShell.scrollTop -
        scrollShell.clientHeight

      if (remaining <= 120) {
        loadMorePastThreads()
      }
    }

    scrollShell.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      scrollShell.removeEventListener("scroll", handleScroll)
    }
  }, [hasMorePast, isLoadingMore, loadMorePastThreads, open])

  if (!pageId) {
    return (
      <div className="px-3 py-8 text-center text-muted-foreground">
        Open a page to view its discussions.
      </div>
    )
  }

  if (open && isLoading && threadItems.length === 0) {
    return (
      <div className="flex items-center justify-center px-3 py-10 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    )
  }

  return (
    <div ref={scrollShellRef}>
      {showActiveDiscussion ? (
        <div className="-mx-3">
          <div className="px-3 py-3 hover:bg-sidebar hover:text-sidebar-foreground">
            <PageCommentThread
              collapseLongThreads
              pageId={pageId}
            />
          </div>
        </div>
      ) : null}

      {visiblePast.length > 0 ? (
        <div className="-mx-3">
          <div className="divide-y divide-border">
            {visiblePast.map(({ item, label, showLabel }) => (
              <div
                className="px-3 py-3 hover:bg-sidebar hover:text-sidebar-foreground"
                key={item.thread!.id}
              >
                {showLabel ? (
                  <div className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                ) : null}
                <PageCommentThread
                  collapseLongThreads
                  threadId={item.thread!.id}
                  pageId={pageId}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {open && isLoadingMore ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Spinner className="size-4" />
        </div>
      ) : null}
    </div>
  )
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "Older"
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  })
}