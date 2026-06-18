"use client"

import { AiChatThreadsPanel } from "@/components/ai-elements/ai-chat-threads-panel"
import Chatbot from "@/components/ai-elements/chatbot"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state"
import { PanelRightCloseIcon, SparklesIcon } from "lucide-react"

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
        <header className="flex h-12 shrink-0 items-center gap-2 px-3">
          <Button
            aria-label="Close chat sidebar"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelRightCloseIcon />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate font-medium text-sm">Chat sidebar</h2>
          </div>
        </header>
        <div className="max-h-48 min-h-0 shrink-0 border-b">
          <AiChatThreadsPanel
            activeThreadId={activeThreadId}
            compact
            onSelectThread={setActiveThreadId}
          />
        </div>
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
      </aside>
    </>
  )
}
