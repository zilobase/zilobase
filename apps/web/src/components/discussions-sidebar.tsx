"use client"

import {
  FilterIcon,
  MessageSquarePlusIcon,
  PanelRightCloseIcon,
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

type DiscussionFilter = "all" | "inline" | "page"
type DiscussionStatus = "open" | "resolved"

export function DiscussionsSidebarPanel({
  inlineComposeRequest,
  open,
  pageId,
  onClose,
  onRequestOpen,
}: {
  inlineComposeRequest?: number
  open: boolean
  pageId?: string | null
  onClose: () => void
  onRequestOpen: (threadId?: string) => void
}) {
  const controller = usePageCommentController(pageId)
  const snapshot = usePageCommentsSnapshot(pageId)
  const [filter, setFilter] = useState<DiscussionFilter>("all")
  const [status, setStatus] = useState<DiscussionStatus>("open")
  const [composePage, setComposePage] = useState(false)
  const [composeInline, setComposeInline] = useState(false)

  useEffect(() => {
    if (!open) {
      setComposeInline(false)
      setComposePage(false)
    }
  }, [open])

  useEffect(() => {
    if (inlineComposeRequest) {
      setStatus("open")
      setComposeInline(true)
      setComposePage(false)
      onRequestOpen()
    }
  }, [inlineComposeRequest, onRequestOpen])

  useEffect(() => {
    if (!snapshot.activeThreadId) return
    const activeThread = snapshot.threads.find(
      (thread) => thread.id === snapshot.activeThreadId,
    )
    if (!activeThread) return

    setStatus(activeThread.resolvedAt ? "resolved" : "open")
    setFilter((current) => matchesFilter(activeThread, current) ? current : "all")
    setComposeInline(false)
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
          <PanelRightCloseIcon />
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
              setComposeInline(false)
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
            {(["all", "inline", "page"] as const).map((value) => (
              <DropdownMenuItem key={value} onClick={() => setFilter(value)}>
                {filter === value ? "✓ " : ""}{filterLabel(value)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Tabs
        className="shrink-0 gap-0 border-b px-3 py-2"
        onValueChange={(value) => {
          const nextStatus = value as DiscussionStatus
          setStatus(nextStatus)
          if (nextStatus === "resolved") {
            setComposeInline(false)
            setComposePage(false)
          }
        }}
        value={status}
      >
        <TabsList className="w-full">
          <TabsTrigger className="flex-1" value="open">
            Open
            <span className="text-xs text-muted-foreground">{openCount}</span>
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="resolved">
            Resolved
            <span className="text-xs text-muted-foreground">{resolvedCount}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {!pageId ? (
          <EmptyState>Open a page to view its discussions.</EmptyState>
        ) : !controller ? (
          <EmptyState>Connecting to discussions…</EmptyState>
        ) : (
          <div className="space-y-3">
            {status === "open" && composeInline ? (
              <ComposerCard title="Comment on selection" onCancel={() => setComposeInline(false)}>
                <PageCommentThread
                  newThreadKind="inline"
                  onThreadCreated={() => setComposeInline(false)}
                  pageId={pageId}
                  placeholder="Add a comment…"
                />
              </ComposerCard>
            ) : null}
            {status === "open" && composePage ? (
              <ComposerCard title="New page discussion" onCancel={() => setComposePage(false)}>
                <PageCommentThread
                  onThreadCreated={() => setComposePage(false)}
                  pageId={pageId}
                  placeholder="Start a discussion…"
                />
              </ComposerCard>
            ) : null}

            {visibleThreads.map((thread) => (
              <article
                className={`rounded-lg border p-3 transition-colors ${
                  snapshot.activeThreadId === thread.id ? "border-primary/50 bg-primary/5" : ""
                }`}
                key={thread.id}
                onClick={() => controller.activateThread(thread.id, { openSidebar: false })}
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <span>{thread.kind === "inline" ? "Inline comment" : "Page discussion"}</span>
                  {thread.kind === "inline" && !thread.anchorAttached ? <span>Original text removed</span> : null}
                </div>
                {thread.quote ? (
                  <blockquote className="mb-3 line-clamp-3 border-l-2 pl-2 text-xs text-muted-foreground">
                    {thread.quote}
                  </blockquote>
                ) : null}
                <PageCommentThread collapseLongThreads pageId={pageId} threadId={thread.id} />
              </article>
            ))}

            {!composeInline && !composePage && visibleThreads.length === 0 ? (
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
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">Cancel</Button>
      </div>
      {children}
    </section>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-8 text-center text-muted-foreground">{children}</div>
}

function matchesFilter(thread: CommentThreadSnapshot, filter: DiscussionFilter) {
  if (filter === "inline" || filter === "page") return thread.kind === filter
  return true
}

function matchesStatus(thread: CommentThreadSnapshot, status: DiscussionStatus) {
  return status === "resolved" ? Boolean(thread.resolvedAt) : !thread.resolvedAt
}

function filterLabel(filter: DiscussionFilter) {
  return filter === "all" ? "All discussions" : filter[0].toUpperCase() + filter.slice(1)
}
