import type { ReactNode } from "react"
import type { MailLabelRecord, MailLabelWriteRequest, MailThreadSummary } from "@zilobase/features/mail"
import { toast } from "sonner"

import { getApiErrorMessage } from "@/features/desktop/network/api"
import { TagIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

export function MailLabelMenu({ labels, modificationTarget, mutating, onCreate, onDelete, onToggle, onUpdate, online }: {
  labels: MailLabelRecord[]
  modificationTarget?: Pick<MailThreadSummary, "labelIds">
  mutating: boolean
  onCreate?: (input: MailLabelWriteRequest) => Promise<MailLabelRecord>
  onDelete?: (labelId: string) => Promise<void>
  onToggle?: (labelId: string, active: boolean) => Promise<void>
  onUpdate?: (label: MailLabelRecord, input: MailLabelWriteRequest) => Promise<MailLabelRecord>
  online: boolean
}) {
  const userLabels = labels.filter((label) => label.type === "user")
  const run = (operation: Promise<unknown>) => void operation.catch(showMailError)
  const create = () => {
    const name = window.prompt("New Gmail label name")?.trim()
    if (name && onCreate) run(onCreate({ labelListVisibility: "labelShow", messageListVisibility: "show", name }))
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={modificationTarget ? "Apply labels" : "Manage Gmail labels"} disabled={!online || mutating} size="icon-lg" title={modificationTarget ? "Labels" : "Manage labels"} type="button" variant="ghost"><TagIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {modificationTarget && onToggle ? <>
          <DropdownMenuLabel>Apply labels</DropdownMenuLabel>
          {userLabels.length ? userLabels.map((label) => (
            <DropdownMenuCheckboxItem
              checked={modificationTarget.labelIds.includes(label.id)}
              key={label.id}
              onCheckedChange={() => run(onToggle(label.id, modificationTarget.labelIds.includes(label.id)))}
            >
              {label.name}
            </DropdownMenuCheckboxItem>
          )) : <DropdownMenuItem disabled>No custom labels</DropdownMenuItem>}
          <DropdownMenuSeparator />
        </> : null}
        {onCreate ? <DropdownMenuItem onClick={create}>Create label…</DropdownMenuItem> : null}
        {onUpdate || onDelete ? userLabels.map((label) => (
          <DropdownMenuSub key={label.id}>
            <DropdownMenuSubTrigger>{label.name}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {onUpdate ? <>
                <DropdownMenuItem onClick={() => {
                  const name = window.prompt("Rename Gmail label", label.name)?.trim()
                  if (name) run(onUpdate(label, { name }))
                }}>Rename…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => run(onUpdate(label, { labelListVisibility: label.labelListVisibility === "labelHide" ? "labelShow" : "labelHide" }))}>{label.labelListVisibility === "labelHide" ? "Show in label list" : "Hide from label list"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => run(onUpdate(label, { messageListVisibility: label.messageListVisibility === "hide" ? "show" : "hide" }))}>{label.messageListVisibility === "hide" ? "Show in message list" : "Hide from message list"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const backgroundColor = window.prompt("Gmail label background color (#RRGGBB)", label.color?.backgroundColor ?? "")?.trim()
                  if (!backgroundColor) return
                  const textColor = window.prompt("Gmail label text color (#RRGGBB)", label.color?.textColor ?? "")?.trim()
                  if (textColor) run(onUpdate(label, { color: { backgroundColor, textColor } }))
                }}>Recolor…</DropdownMenuItem>
              </> : null}
              {onDelete ? <DropdownMenuItem variant="destructive" onClick={() => {
                if (window.confirm(`Delete Gmail label “${label.name}”?`)) run(onDelete(label.id))
              }}>Delete label</DropdownMenuItem> : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MailActionButton({ disabled, icon, label, onClick }: {
  disabled: boolean
  icon: ReactNode
  label: string
  onClick: () => Promise<void>
}) {
  return <Button aria-label={label} disabled={disabled} onClick={() => void onClick().catch(showMailError)} size="icon" title={label} type="button" variant="ghost">{icon}</Button>
}

export function showMailError(error: unknown) {
  toast.error(getApiErrorMessage(error))
}
