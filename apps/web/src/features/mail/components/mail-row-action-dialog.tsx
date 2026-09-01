import type { MailHoverActionKind, MailLabelRecord, MailThreadSummary } from "@zilobase/features/mail"

import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog"
import { mailHoverActionCatalog } from "./mail-hover-actions-panel"

const commandKinds: MailHoverActionKind[] = ["reply", "star", "read_unread", "archive", "bin", "spam", "any_label", "remind", "unsubscribe"]

export function MailRowActionDialog({ labels, mode, onClose, onSelect, thread }: {
  labels: MailLabelRecord[]
  mode: "command" | "label" | null
  onClose: () => void
  onSelect: (selection: { kind: MailHoverActionKind; labelId?: string }) => void
  thread: MailThreadSummary | null
}) {
  return (
    <Dialog open={Boolean(mode && thread)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{mode === "label" ? "Apply a label" : "Mail commands"}</DialogTitle>
        <DialogDescription className="truncate">{thread?.subject ?? "Choose an action"}</DialogDescription>
        <div className="grid max-h-80 gap-1 overflow-y-auto">
          {mode === "label" ? null : commandKinds.map((kind) => {
            const meta = mailHoverActionCatalog[kind]
            const Icon = meta.icon
            return <Button className="h-auto justify-start gap-2 py-2 text-left" key={kind} onClick={() => onSelect({ kind })} type="button" variant="ghost"><Icon className="size-4" /><span><span className="block text-sm">{meta.label}</span><span className="block text-xs font-normal text-content-secondary">{meta.description}</span></span></Button>
          })}
          {mode === "label" ? <MailLabelChoices labels={labels} onSelect={onSelect} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MailLabelChoices({ labels, onSelect }: { labels: MailLabelRecord[]; onSelect: (selection: { kind: MailHoverActionKind; labelId?: string }) => void }) {
  const userLabels = labels.filter((label) => label.type === "user")
  return userLabels.length ? userLabels.map((label) => <Button className="justify-start" key={label.id} onClick={() => onSelect({ kind: "specific_label", labelId: label.id })} type="button" variant="ghost">{label.name}</Button>) : <div className="py-5 text-center text-sm text-content-secondary">No Gmail labels</div>
}
