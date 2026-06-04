"use client"

import Chatbot from "@/components/ai-elements/chatbot"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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
          "fixed inset-y-0 right-0 z-40 flex w-[min(100vw,26rem)] flex-col border-l border-sidebar-border bg-background text-foreground shadow-xl transition-transform duration-200 ease-linear md:relative md:inset-auto md:z-20 md:my-2 md:mr-2 md:h-[calc(100svh-1rem)] md:w-[24rem] md:shrink-0 md:rounded-lg md:border md:shadow-sm",
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
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          data-ai-scroll-shell
        >
          <Chatbot isSidebar />
        </div>
      </aside>
    </>
  )
}
