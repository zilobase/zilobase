import type {
  MailHoverAction,
  MailLabelRecord,
  MailModifyRequest,
  MailPropertyDefinition,
  MailThreadPropertyValue,
  MailThreadSummary,
} from "@zilobase/features/mail"

import { ArchiveIcon, MailIcon, Paperclip, StarIcon, TrashIcon } from "@/shared/components/icons"
import { Checkbox } from "@/shared/ui/checkbox"

import { MailActionButton } from "./mail-actions"
import { mailHoverActionCatalog, MailHoverActionIcon } from "./mail-hover-actions-panel"
import { formatMailPropertyValue } from "./mail-properties-panel"
import { formatThreadDate } from "../model/mail-view-model"

export function MailThreadRow({ batchSelected, customProperties = [], customValues = {}, groupDraggable = false, hoverActions, labels = [], mutating, onAction, onBatchToggle, onHoverAction, onModify, onOpen, onPrefetch, online, propertyMembers = [], selected, thread }: {
  batchSelected: boolean
  customProperties?: MailPropertyDefinition[]
  customValues?: Record<string, MailThreadPropertyValue["value"]>
  groupDraggable?: boolean
  hoverActions?: MailHoverAction[]
  labels?: MailLabelRecord[]
  mutating: boolean
  onAction: (action: "restore" | "trash") => Promise<void>
  onBatchToggle: (checked: boolean) => void
  onHoverAction?: (action: MailHoverAction) => Promise<void>
  onModify: (modification: MailModifyRequest) => Promise<void>
  onOpen: () => void
  onPrefetch: () => void
  online: boolean
  propertyMembers?: Parameters<typeof formatMailPropertyValue>[2]
  selected: boolean
  thread: MailThreadSummary
}) {
  const participant = thread.participants[0]
  return (
    <div
      className={`group/mail-row flex h-9 w-full items-center hover:bg-action-neutral-hover ${selected ? "bg-action-neutral-hover text-action-on-neutral" : ""}`}
      data-selected={selected ? "true" : undefined}
      draggable={groupDraggable}
      onDragStart={(event) => {
        if (!groupDraggable) return
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("application/x-zilobase-mail-thread", thread.id)
      }}
    >
      <Checkbox aria-label={`Select ${thread.subject}`} checked={batchSelected} className="ml-2 shrink-0" onCheckedChange={(checked) => onBatchToggle(checked === true)} />
      <button className="grid min-w-0 flex-1 grid-cols-[minmax(8rem,0.8fr)_minmax(12rem,2fr)_minmax(0,auto)_auto] items-center gap-3 px-2 text-left text-sm" onClick={onOpen} onFocus={onPrefetch} onPointerEnter={onPrefetch} type="button">
        <span className={`truncate ${thread.unread ? "font-semibold text-content-primary" : "text-content-secondary"}`}>
          {participant?.name || participant?.address || "Unknown sender"}
          {thread.messageCount > 1 ? ` (${thread.messageCount})` : ""}
        </span>
        <span className="min-w-0 truncate">
          <span className={thread.unread ? "font-semibold text-content-primary" : "text-content-primary"}>{thread.subject}</span>
          <span className="text-content-secondary"> — {thread.snippet}</span>
        </span>
        {customProperties.length ? (
          <span className="hidden min-w-0 items-center gap-1 xl:flex">
            {customProperties.slice(0, 2).map((property) => {
              const label = formatMailPropertyValue(property, customValues[property.id], propertyMembers)
              return label ? <span className="max-w-28 truncate rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-content-secondary" key={property.id}>{label}</span> : null
            })}
          </span>
        ) : null}
        <span className="flex items-center gap-2 text-xs text-content-secondary group-hover/mail-row:hidden">
          {thread.attachmentCount ? <Paperclip className="size-3.5" /> : null}
          {thread.starred ? <StarIcon className="size-3.5 text-feedback-warning-text" weight="fill" /> : null}
          {formatThreadDate(thread.internalDate)}
        </span>
      </button>
      <div className="hidden shrink-0 items-center pr-1 group-hover/mail-row:flex">
        {hoverActions && onHoverAction ? hoverActions.filter((action) => !action.hidden).map((action) => (
          <MailActionButton
            disabled={!online || mutating}
            icon={<MailHoverActionIcon action={action} />}
            key={action.id}
            label={hoverActionLabel(action, labels, thread)}
            onClick={() => onHoverAction(action)}
          />
        )) : <>
          <MailActionButton disabled={!online || mutating} icon={<StarIcon weight={thread.starred ? "fill" : "regular"} />} label={thread.starred ? "Unstar thread" : "Star thread"} onClick={() => onModify(thread.starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] })} />
          <MailActionButton disabled={!online || mutating} icon={<MailIcon />} label={thread.unread ? "Mark thread read" : "Mark thread unread"} onClick={() => onModify(thread.unread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })} />
          <MailActionButton disabled={!online || mutating} icon={thread.labelIds.includes("TRASH") ? <ArchiveIcon /> : <TrashIcon />} label={thread.labelIds.includes("TRASH") ? "Restore thread" : "Move thread to trash"} onClick={() => onAction(thread.labelIds.includes("TRASH") ? "restore" : "trash")} />
        </>}
      </div>
    </div>
  )
}

function hoverActionLabel(action: MailHoverAction, labels: MailLabelRecord[], thread: MailThreadSummary) {
  if (action.kind === "specific_label") return `Apply ${labels.find((label) => label.id === action.labelId)?.name ?? "label"}`
  if (action.kind === "star") return thread.starred ? "Unstar thread" : "Star thread"
  if (action.kind === "read_unread") return thread.unread ? "Mark thread read" : "Mark thread unread"
  if (action.kind === "bin") return thread.labelIds.includes("TRASH") ? "Restore thread" : "Move thread to bin"
  return mailHoverActionCatalog[action.kind].label
}
