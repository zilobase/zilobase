"use client"

import { AiChatHistoryList } from "@/components/ai-elements/ai-chat-history-list"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAiChatThreadActions } from "@/hooks/use-ai-chat-thread-actions"
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state"
import {
  HistoryIcon,
  PanelRightCloseIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react"
import { lazy, Suspense, useCallback, useState } from "react"

const Chatbot = lazy(() => import("@/components/ai-elements/chatbot"))

type ChatSidebarView = "chat" | "history"

export function ChatSidebarTrigger({
  adjacentSidebarOpen = false,
  onOpen,
}: {
  adjacentSidebarOpen?: boolean
  onOpen: () => void
}) {
  return (
    <Button
      aria-label="Open chat sidebar"
      className={cn(
        "fixed bottom-4 z-40 h-10 rounded-full border-sidebar-border bg-sidebar px-3 text-sidebar-foreground shadow-lg ring-1 ring-foreground/10 transition-[right,background-color,color,transform] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        adjacentSidebarOpen
          ? "right-[calc(var(--right-sidebar-adjacent-panel-width,var(--right-sidebar-panel-width))+1rem)] max-md:right-4"
          : "right-4",
      )}
      onClick={onOpen}
      type="button"
      variant="outline"
    >
      <SparklesIcon className="size-4" />
      <span>AI</span>
    </Button>
  )
}

export function ChatSidebarPanel({
  databaseId,
  onClose,
  open = true,
  pageId,
}: {
  databaseId?: string | null
  onClose: () => void
  open?: boolean
  pageId?: string | null
}) {
  const { activeThreadId, isBootstrapping, setActiveThreadId } =
    useAiChatThreadState()
  const { createThread, handleCreateThread } = useAiChatThreadActions({
    activeThreadId,
    onSelectThread: setActiveThreadId,
  })
  const [view, setView] = useState<ChatSidebarView>("chat")

  const handleNewChat = useCallback(async () => {
    setView("chat")
    await handleCreateThread()
  }, [handleCreateThread])

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId)
      setView("chat")
    },
    [setActiveThreadId],
  )

  const handleHistoryToggle = useCallback(() => {
    setView((current) => (current === "history" ? "chat" : "history"))
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          aria-label="Close chat sidebar"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PanelRightCloseIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-sm">
            {view === "history" ? "Chat history" : "Chat sidebar"}
          </h2>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            aria-label="New chat"
            disabled={createThread.isPending}
            onClick={() => void handleNewChat()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            aria-label="Chat history"
            aria-pressed={view === "history"}
            onClick={handleHistoryToggle}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <HistoryIcon className="size-4" />
          </Button>
        </div>
      </header>
      {view === "history" ? (
        <AiChatHistoryList
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
        />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          data-ai-scroll-shell
        >
          {!open || isBootstrapping || !activeThreadId ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Loading chat...
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Loading chat...
                </div>
              }
            >
              <Chatbot
                databaseId={databaseId}
                isSidebar
                threadId={activeThreadId}
                pageId={pageId}
              />
            </Suspense>
          )}
        </div>
      )}
    </div>
  )
}
