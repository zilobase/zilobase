"use client"

import { AiChatHistoryList } from "@/components/ai-elements/ai-chat-history-list"
import Chatbot from "@/components/ai-elements/chatbot"
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
import { useCallback, useState } from "react"

type ChatSidebarView = "chat" | "history"

export function ChatSidebar({
  onClose,
  onOpen,
  open,
}: {
  onClose: () => void
  onOpen: () => void
  open: boolean
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
    <>
      {!open ? (
        <Button
          aria-label="Open chat sidebar"
          className="fixed right-4 bottom-4 z-40 h-10 rounded-full border-sidebar-border bg-sidebar px-3 text-sidebar-foreground shadow-lg ring-1 ring-foreground/10 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onOpen}
          type="button"
          variant="outline"
        >
          <SparklesIcon className="size-4" />
          <span>AI</span>
        </Button>
      ) : null}
      <aside
        aria-label="Chat sidebar"
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[min(100vw,26rem)] flex-col border-l border-sidebar-border bg-background text-foreground transition-transform duration-200 ease-linear md:relative md:inset-auto md:z-20 md:h-svh md:w-[24rem] md:shrink-0",
          open ? "translate-x-0" : "translate-x-full md:hidden",
        )}
      >
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
            {isBootstrapping || !activeThreadId ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                Loading chat...
              </div>
            ) : (
              <Chatbot isSidebar key={activeThreadId} threadId={activeThreadId} />
            )}
          </div>
        )}
      </aside>
    </>
  )
}