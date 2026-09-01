import { Reorder } from "motion/react"
import type { ComponentType } from "react"
import type { MailHoverAction, MailHoverActionKind, MailLabelRecord } from "@zilobase/features/mail"

import {
  ArchiveIcon,
  BanIcon,
  Bell,
  Bookmark,
  Code,
  CornerDownLeftIcon,
  EyeOffIcon,
  GripVerticalIcon,
  HeartIcon,
  MailIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { DropDrawerItem, DropDrawerSeparator, DropDrawerSub, DropDrawerSubContent, DropDrawerSubTrigger } from "@/shared/ui/dropdrawer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

type ActionMeta = { description: string; icon: ComponentType<{ className?: string; weight?: "fill" | "regular" }>; label: string }

export const mailHoverActionCatalog: Record<MailHoverActionKind, ActionMeta> = {
  any_label: { description: "Open the label picker", icon: TagIcon, label: "Any label" },
  archive: { description: "Move to archive or unarchive", icon: ArchiveIcon, label: "Archive" },
  bin: { description: "Move to bin or restore", icon: TrashIcon, label: "Bin" },
  command: { description: "Open command palette", icon: Code, label: "Command" },
  read_unread: { description: "Mark as read or unread", icon: MailIcon, label: "Read/unread" },
  remind: { description: "Hide from Inbox until date", icon: Bell, label: "Remind" },
  reply: { description: "Reply to sender", icon: CornerDownLeftIcon, label: "Reply" },
  spam: { description: "Report a thread as spam", icon: TriangleAlertIcon, label: "Mark as spam" },
  specific_label: { description: "Apply a specific label", icon: TagIcon, label: "Apply specific label" },
  star: { description: "Star or unstar", icon: StarIcon, label: "Starred" },
  unsubscribe: { description: "Unsubscribe from sender", icon: BanIcon, label: "Unsubscribe" },
}

export function MailHoverActionIcon({ action, className }: { action: MailHoverAction; className?: string }) {
  if (action.kind === "specific_label") {
    const Icon = action.icon === "bookmark" ? Bookmark : action.icon === "star" ? StarIcon : action.icon === "heart" ? HeartIcon : TagIcon
    return <Icon className={className} />
  }
  const Icon = mailHoverActionCatalog[action.kind].icon
  return <Icon className={className} />
}

export function MailHoverActionsPanel({ actions, labels, onChange, saving }: { actions: MailHoverAction[]; labels: MailLabelRecord[]; onChange: (actions: MailHoverAction[]) => void; saving: boolean }) {
  const visible = actions.filter((action) => !action.hidden)
  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <div className="mb-3 rounded-lg border border-stroke-default bg-surface-subtle p-2">
        <div className="mb-2 text-xs font-medium text-content-secondary">Preview</div>
        <div className="flex min-h-9 items-center justify-end gap-0.5 rounded-md bg-surface-raised px-1">
          {visible.length ? visible.map((action) => <span className="flex size-7 items-center justify-center text-content-secondary" key={action.id} title={actionName(action, labels)}><MailHoverActionIcon action={action} className="size-4" /></span>) : <span className="px-2 text-xs text-content-secondary">No visible actions</span>}
        </div>
      </div>
      <div className="px-2 pb-1 text-xs font-medium text-content-secondary">Visible actions</div>
      <Reorder.Group axis="y" className="space-y-0.5" onReorder={onChange} values={actions}>
        {actions.map((action) => {
          const meta = mailHoverActionCatalog[action.kind]
          return (
            <Reorder.Item key={action.id} value={action}>
              <DropDrawerSub title={meta.label}>
                <DropDrawerSubTrigger className="w-full">
                  <GripVerticalIcon className="size-4 cursor-grab text-content-secondary" />
                  <MailHoverActionIcon action={action} className="size-4" />
                  <span className={`min-w-0 flex-1 truncate ${action.hidden ? "text-content-secondary" : ""}`}>{actionName(action, labels)}</span>
                  {action.hidden ? <EyeOffIcon className="size-4" /> : null}
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-80">
                  <MailHoverActionEditor action={action} labels={labels} onChange={(next) => onChange(actions.map((item) => item.id === action.id ? next : item))} onRemove={() => onChange(actions.filter((item) => item.id !== action.id))} saving={saving} />
                </DropDrawerSubContent>
              </DropDrawerSub>
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
      <DropDrawerSeparator />
      <DropDrawerSub title="Add hover action">
        <DropDrawerSubTrigger className="w-full">Add hover action</DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-80">
          {(Object.entries(mailHoverActionCatalog) as Array<[MailHoverActionKind, ActionMeta]>).map(([kind, meta]) => {
            const Icon = meta.icon
            return <DropDrawerItem disabled={saving} key={kind} onSelect={() => onChange([...actions, createAction(kind)])}><Icon className="size-4" /><span><span className="block">{meta.label}</span><span className="block text-xs text-content-secondary">{meta.description}</span></span></DropDrawerItem>
          })}
        </DropDrawerSubContent>
      </DropDrawerSub>
    </div>
  )
}

function MailHoverActionEditor({ action, labels, onChange, onRemove, saving }: { action: MailHoverAction; labels: MailLabelRecord[]; onChange: (action: MailHoverAction) => void; onRemove: () => void; saving: boolean }) {
  return (
    <div className="space-y-2 p-2">
      <div><div className="text-sm font-medium text-content-primary">{mailHoverActionCatalog[action.kind].label}</div><div className="text-xs text-content-secondary">{mailHoverActionCatalog[action.kind].description}</div></div>
      {action.kind === "specific_label" ? <>
        <label className="block text-xs text-content-secondary">Apply label<Select disabled={saving} onValueChange={(labelId) => onChange({ ...action, labelId })} value={action.labelId ?? "none"}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose a label</SelectItem>{labels.filter((label) => label.type === "user").map((label) => <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>)}</SelectContent></Select></label>
        <label className="block text-xs text-content-secondary">Icon<Select disabled={saving} onValueChange={(icon) => onChange({ ...action, icon: icon as MailHoverAction["icon"] })} value={action.icon ?? "tag"}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{["star", "bookmark", "heart", "tag"].map((icon) => <SelectItem key={icon} value={icon}>{icon[0]!.toUpperCase() + icon.slice(1)}</SelectItem>)}</SelectContent></Select></label>
        <label className="block text-xs text-content-secondary">When label is applied<Select disabled={saving} onValueChange={(effect) => onChange({ ...action, effect: effect as MailHoverAction["effect"] })} value={action.effect ?? "none"}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="archive">Archive</SelectItem><SelectItem value="bin">Bin</SelectItem><SelectItem value="none">No effect</SelectItem></SelectContent></Select></label>
      </> : null}
      <Button className="w-full justify-start" disabled={saving} onClick={() => onChange({ ...action, hidden: !action.hidden })} size="sm" type="button" variant="ghost"><EyeOffIcon />{action.hidden ? "Show hover action" : "Hide hover action"}</Button>
      <Button className="w-full justify-start" disabled={saving} onClick={onRemove} size="sm" type="button" variant="destructive"><TrashIcon />Delete hover action</Button>
    </div>
  )
}

function createAction(kind: MailHoverActionKind): MailHoverAction {
  return { effect: kind === "specific_label" ? "none" : undefined, hidden: false, icon: kind === "specific_label" ? "tag" : undefined, id: crypto.randomUUID(), kind }
}

function actionName(action: MailHoverAction, labels: MailLabelRecord[]) {
  if (action.kind !== "specific_label") return mailHoverActionCatalog[action.kind].label
  return labels.find((label) => label.id === action.labelId)?.name ?? "Apply label"
}
