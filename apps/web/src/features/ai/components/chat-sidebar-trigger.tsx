import { SparklesIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"

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
        "fixed bottom-4 z-40 h-10 rounded-md border-stroke-default bg-surface-navigation px-3 text-content-primary shadow-lg ring-1 ring-stroke-default transition-[right,background-color,color,transform] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-action-neutral-hover hover:text-action-on-neutral motion-reduce:transition-none motion-reduce:hover:translate-y-0",
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
