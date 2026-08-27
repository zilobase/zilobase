"use client"

import {
  ChevronsRightIcon,
  FilterIcon,
  MessageSquarePlusIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { PageCommentThread } from "@/components/page-comments"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePageCommentController, usePageCommentsSnapshot } from "@/contexts/page-comments-registry"
import type { CommentThreadSnapshot } from "@/comments/yjs-comments"

type DiscussionFilter = "all" | "block" | "page"
type DiscussionStatus = "open" | "resolved"

export function DiscussionsSidebarPanel({
  open,
  pageId,
  onClose,
}: {
  open: boolean
  pageId?: string | null
  onClose: () => void
}) {
  const controller = usePageCommentController(pageId)
  const snapshot = usePageCommentsSnapshot(pageId)
  const [filter, setFilter] = useState<DiscussionFilter>("all")
  const [status, setStatus] = useState<DiscussionStatus>("open")
  const [composePage, setComposePage] = useState(false)

  useEffect(() => {
    if (!open) {
      setComposePage(false)
    }
  }, [open])

  useEffect(() => {
    if (!snapshot.activeThreadId) return
    const activeThread = snapshot.threads.find(
      (thread) => thread.id === snapshot.activeThreadId,
    )
    if (!activeThread) return

    setStatus(activeThread.resolvedAt ? "resolved" : "open")
    setFilter((current) => matchesFilter(activeThread, current) ? current : "all")
    setComposePage(false)
  }, [snapshot.activeThreadId, snapshot.threads])

  const visibleThreads = useMemo(
    () => snapshot.threads.filter(
      (thread) => matchesStatus(thread, status) && matchesFilter(thread, filter),
    ),
    [filter, snapshot.threads, status],
  )
  const openCount = snapshot.threads.filter((thread) => !thread.resolvedAt).length
  const resolvedCount = snapshot.threads.length - openCount
  const hasOpenPageDiscussion = snapshot.threads.some(
    (thread) => thread.kind === "page" && !thread.resolvedAt,
  )

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
          <ChevronsRightIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-sm">Discussions</h2>
          <p className="text-[11px] text-muted-foreground">{openCount} open</p>
        </div>
        {controller?.canEdit && !hasOpenPageDiscussion ? (
          <Button
            aria-label="New page discussion"
            className="text-muted-foreground"
            onClick={() => {
              setStatus("open")
              setComposePage(true)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MessageSquarePlusIcon className="size-4" />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Filter discussions"
              className="text-muted-foreground"
              size="icon-sm"
              type="button"
              variant={filter === "all" ? "ghost" : "secondary"}
            >
              <FilterIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(["all", "block", "page"] as const).map((value) => (
              <DropdownMenuItem key={value} onClick={() => setFilter(value)}>
                {filter === value ? "✓ " : ""}{filterLabel(value)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Tabs
        className="shrink-0 gap-0 border-b px-3"
        onValueChange={(value) => {
          const nextStatus = value as DiscussionStatus
          setStatus(nextStatus)
          if (nextStatus === "resolved") {
            setComposePage(false)
          }
        }}
        value={status}
      >
        <TabsList className="w-full justify-start gap-5" variant="underline">
          <TabsTrigger
            className="h-10 flex-none rounded-none px-1 text-xs font-medium"
            value="open"
          >
            Open
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {openCount}
            </span>
          </TabsTrigger>
          <TabsTrigger
            className="h-10 flex-none rounded-none px-1 text-xs font-medium"
            value="resolved"
          >
            Resolved
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {resolvedCount}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 text-sm">
        {!pageId ? (
          <EmptyState>Open a page to view its discussions.</EmptyState>
        ) : !controller ? (
          <EmptyState>Connecting to discussions…</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {status === "open" && composePage ? (
              <ComposerCard title="New page discussion" onCancel={() => setComposePage(false)}>
                <PageCommentThread
                  compact
                  onThreadCreated={() => setComposePage(false)}
                  pageId={pageId}
                  placeholder="Start a discussion…"
                />
              </ComposerCard>
            ) : null}

            {visibleThreads.map((thread) => (
              <article
                className={`cursor-pointer rounded-xl border border-border bg-background px-3 py-3 transition-[border-color,background-color,box-shadow] hover:border-border hover:bg-accent ${
                  snapshot.activeThreadId === thread.id
                    ? "border-border bg-subtle-surface ring-1 ring-border"
                    : ""
                }`}
                key={thread.id}
                onClick={() => controller.activateThread(thread.id, { openSidebar: false })}
              >
                <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <span>
                    {thread.kind === "block"
                      ? "Block comment"
                      : thread.kind === "inline"
                        ? "Inline comment"
                        : "Page discussion"}
                  </span>
                  {thread.kind !== "page" && !thread.anchorAttached ? (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 normal-case tracking-normal">
                      Original text removed
                    </span>
                  ) : null}
                </div>
                {thread.quote ? (
                  <blockquote className="mb-3 line-clamp-3 rounded-md border-l-2 border-border bg-subtle-surface px-2.5 py-2 text-[12px] leading-5 text-muted-foreground">
                    {thread.quote}
                  </blockquote>
                ) : null}
                <PageCommentThread
                  collapseLongThreads
                  compact
                  pageId={pageId}
                  threadId={thread.id}
                />
              </article>
            ))}

            {!composePage && visibleThreads.length === 0 ? (
              <EmptyState>No discussions match this filter.</EmptyState>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function ComposerCard({
  children,
  onCancel,
  title,
}: {
  children: React.ReactNode
  onCancel: () => void
  title: string
}) {
  return (
    <section className="rounded-xl border border-border bg-subtle-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium">{title}</h3>
        <Button onClick={onCancel} size="xs" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
      {children}
    </section>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
      {children}
    </div>
  )
}

function matchesFilter(thread: CommentThreadSnapshot, filter: DiscussionFilter) {
  if (filter !== "all") return thread.kind === filter
  return true
}

function matchesStatus(thread: CommentThreadSnapshot, status: DiscussionStatus) {
  return status === "resolved" ? Boolean(thread.resolvedAt) : !thread.resolvedAt
}

function filterLabel(filter: DiscussionFilter) {
  return filter === "all" ? "All discussions" : filter[0].toUpperCase() + filter.slice(1)
}
