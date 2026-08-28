import { ChevronUpIcon, RotateCcwIcon } from "@/components/icons"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { canvasToolOptions } from "./constants"
import type { CanvasTool } from "./types"

export function BottomDock({
  activeTool,
  onSelectTool,
  onReset,
  open,
  toggleOpen,
}: {
  activeTool: CanvasTool | null
  onSelectTool: (tool: CanvasTool) => void
  onReset: () => void
  open: boolean
  toggleOpen: () => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto relative flex items-center gap-3">
        {open ? (
          <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-border bg-backdrop p-1.5 shadow-lg backdrop-blur">
            {canvasToolOptions.map((option) => {
              const Icon = option.icon

              return (
                <button
                  className={cn(
                    "flex min-w-24 items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    activeTool === option.tool &&
                      "bg-accent text-accent-foreground",
                  )}
                  key={option.tool}
                  onClick={() => onSelectTool(option.tool)}
                  type="button"
                >
                  <Icon className="size-3.5" />
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-backdrop p-1.5 shadow-lg backdrop-blur">
          <Button
            className={cn(
              "h-8 rounded-xl px-3 text-sm",
              open && "bg-accent text-accent-foreground",
            )}
            onClick={toggleOpen}
            type="button"
            variant="ghost"
          >
            {activeTool
              ? `${canvasToolOptions.find((option) => option.tool === activeTool)?.label ?? "Item"}`
              : "Items"}
            <ChevronUpIcon
              className={cn(
                "size-4 transition-transform",
                open ? "rotate-180" : "rotate-0",
              )}
            />
          </Button>
          <div className="h-6 w-px bg-border" />
          <Button
            className="h-8 w-8 rounded-xl"
            onClick={onReset}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RotateCcwIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
