import { DatabaseIcon, UserIcon, WandSparklesIcon, XIcon } from "@/shared/components/icons"

import { PageIconDisplay, PageIcon } from "@/features/pages/index"
import type { ContextAttachment } from "@zilobase/page-context"

function AttachmentIcon({ attachment }: { attachment: ContextAttachment }) {
  if (attachment.emoji) {
    return <PageIconDisplay size="sm" value={attachment.emoji} />
  }

  if (attachment.type === "database") {
    return <DatabaseIcon className="size-3.5 shrink-0" />
  }

  if (attachment.type === "person") {
    return <UserIcon className="size-3.5 shrink-0" />
  }

  if (attachment.mode === "skill") {
    return <WandSparklesIcon className="size-3.5 shrink-0" />
  }

  return (
    <PageIcon
      page={{
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
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-background px-2 text-foreground text-xs">
      <AttachmentIcon attachment={attachment} />
      <span className="truncate">
        {attachment.mode === "skill" ? `Skill: ${attachment.title}` : attachment.title}
      </span>
      <button
        aria-label={`Remove ${attachment.title}`}
        className="-mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-active"
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
