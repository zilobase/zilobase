"use client"

import { AiChatHistoryList } from "./elements/ai-chat-history-list"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { useAiChatThreadActions } from "../conversation/use-ai-chat-thread-actions"
import { useAiChatThreadState } from "../conversation/use-ai-chat-thread-state"
import {
  ChevronsRightIcon,
  HistoryIcon,
  SidebarSimpleIcon,
  PictureInPicture2Icon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "@/shared/components/icons"
import { lazy, Suspense, useCallback, useState } from "react"

const Chatbot = lazy(() => import("./elements/chatbot"))

type ChatSidebarView = "chat" | "history"
export type ChatPresentationMode = "floating" | "sidebar"

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
        "fixed bottom-4 z-40 h-10 rounded-md border-border bg-sidebar px-3 text-foreground shadow-lg ring-1 ring-border transition-[right,background-color,color,transform] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none motion-reduce:hover:translate-y-0",
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
  onPresentationModeChange,
  open = true,
  pageId,
  presentationMode = "sidebar",
}: {
  databaseId?: string | null
  onClose: () => void
  onPresentationModeChange?: (mode: ChatPresentationMode) => void
  open?: boolean
  pageId?: string | null
  presentationMode?: ChatPresentationMode
}) {
  const { activeThreadId, isBootstrapping, setActiveThreadId } =
    useAiChatThreadState({ enabled: open })
  const { handleStartNewChat } = useAiChatThreadActions({
    activeThreadId,
    enabled: open,
    onSelectThread: setActiveThreadId,
  })
  const [view, setView] = useState<ChatSidebarView>("chat")

  const handleNewChat = useCallback(() => {
    setView("chat")
    handleStartNewChat()
  }, [handleStartNewChat])

  const handleSelectThread = useCallback(
    (threadId: string | null) => {
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
          {presentationMode === "floating" ? <XIcon /> : <ChevronsRightIcon />}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-sm">
            {view === "history" ? "Chat history" : "Ask AI"}
          </h2>
        </div>
        <div className="flex items-center gap-0.5">
          {onPresentationModeChange ? (
            <Button
              aria-label={
                presentationMode === "sidebar"
                  ? "Switch to floating chat"
                  : "Dock chat in sidebar"
              }
              onClick={() =>
                onPresentationModeChange(
                  presentationMode === "sidebar" ? "floating" : "sidebar",
                )
              }
              size="icon-sm"
              title={
                presentationMode === "sidebar"
                  ? "Switch to floating chat"
                  : "Dock chat in sidebar"
              }
              type="button"
              variant="ghost"
            >
              {presentationMode === "sidebar" ? (
                <PictureInPicture2Icon className="size-4" />
              ) : (
                <SidebarSimpleIcon className="size-4" mirrored />
              )}
            </Button>
          ) : null}
          <Button
            aria-label="New chat"
            onClick={handleNewChat}
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
          {!open || isBootstrapping ? (
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
                key={activeThreadId ?? "new"}
                onThreadCreated={setActiveThreadId}
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
