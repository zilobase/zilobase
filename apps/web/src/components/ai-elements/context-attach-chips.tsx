import { DatabaseIcon, XIcon } from "lucide-react"

import { WorkspaceIconDisplay, WorkspacePageIcon } from "@/lib/workspace-icon"
import type { ContextAttachment } from "@notelab/workspace-context"

function AttachmentIcon({ attachment }: { attachment: ContextAttachment }) {
  if (attachment.emoji) {
    return <WorkspaceIconDisplay size="sm" value={attachment.emoji} />
  }

  if (attachment.type === "database") {
    return <DatabaseIcon className="size-3.5 shrink-0" />
  }

  return (
    <WorkspacePageIcon
      workspace={{
        content: null,
        metadata: { emoji: attachment.emoji },
      }}
    />
  )
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ContextAttachment
  onRemove: () => void
}) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border bg-background px-2 text-foreground text-xs">
      <AttachmentIcon attachment={attachment} />
      <span className="truncate">{attachment.title}</span>
      <button
        aria-label={`Remove ${attachment.title}`}
        className="-mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

export function ContextAttachChips({
  attachments,
  onRemove,
  primaryAttachment = null,
  onRemovePrimary,
}: {
  attachments: ContextAttachment[]
  onRemove: (attachment: ContextAttachment) => void
  primaryAttachment?: ContextAttachment | null
  onRemovePrimary?: () => void
}) {
  if (!primaryAttachment && attachments.length === 0) {
    return null
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 p-2">
      {primaryAttachment ? (
        <AttachmentChip
          attachment={primaryAttachment}
          onRemove={() => onRemovePrimary?.()}
        />
      ) : null}
      {attachments.map((attachment) => (
        <AttachmentChip
          attachment={attachment}
          key={`${attachment.type}:${attachment.id}`}
          onRemove={() => onRemove(attachment)}
        />
      ))}
    </div>
  )
}