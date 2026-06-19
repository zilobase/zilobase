import { DatabaseIcon, FileTextIcon, XIcon } from "lucide-react"

import type { ContextAttachment } from "@notelab/workspace-context"

export function ContextAttachChips({
  attachments,
  onRemove,
}: {
  attachments: ContextAttachment[]
  onRemove: (attachment: ContextAttachment) => void
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-2 pb-2">
      {attachments.map((attachment) => (
        <span
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border bg-background px-2 text-muted-foreground text-xs"
          key={`${attachment.type}:${attachment.id}`}
        >
          {attachment.type === "database" ? (
            <DatabaseIcon className="size-3.5 shrink-0" />
          ) : (
            <FileTextIcon className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{attachment.title}</span>
          <button
            aria-label={`Remove ${attachment.title}`}
            className="-mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onRemove(attachment)}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}