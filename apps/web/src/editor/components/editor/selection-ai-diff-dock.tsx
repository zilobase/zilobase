import { CheckIcon, Loader2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SelectionAiDiffDock({
  isStreaming,
  onAccept,
  onDecline,
}: {
  isStreaming: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="selection-ai-diff-dock">
      <div className="selection-ai-diff-dock-inner">
        <Button
          className="h-8 rounded-xl px-3 text-sm"
          disabled={isStreaming}
          onClick={onAccept}
          type="button"
          variant="ghost"
        >
          {isStreaming ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CheckIcon className="size-4" />
          )}
          Accept
        </Button>
        <div className="h-6 w-px bg-border" />
        <Button
          className="h-8 rounded-xl px-3 text-sm"
          onClick={onDecline}
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
          Decline
        </Button>
      </div>
    </div>
  )
}
