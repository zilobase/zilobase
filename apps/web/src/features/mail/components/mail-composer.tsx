import { useEffect, useMemo, useRef, useState } from "react"
import {
  mailApiBasePath,
  type MailComposeAttachment,
  type MailComposeRequest,
  type MailDraftResponse,
  type MailSendResponse,
} from "@zilobase/features/mail"
import { toast } from "sonner"

import { apiFetch, getApiErrorMessage } from "@/features/desktop/network/api"
import { FloatingWidget } from "@/shared/components/floating-widget"
import { Loader2Icon, Paperclip, SendIcon, TrashIcon, XIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"

import {
  formatComposerAddresses,
  parseComposerAddresses,
  type MailComposeSeed,
} from "../model/mail-compose"

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export function MailComposer({ onClose, onSent, online, seed, workspaceId }: {
  onClose: () => void
  onSent: (response: MailSendResponse) => Promise<void> | void
  online: boolean
  seed: MailComposeSeed
  workspaceId?: string | null
}) {
  const mailBasePath = mailApiBasePath(workspaceId)
  const [to, setTo] = useState(() => formatComposerAddresses(seed.to ?? []))
  const [cc, setCc] = useState(() => formatComposerAddresses(seed.cc ?? []))
  const [bcc, setBcc] = useState(() => formatComposerAddresses(seed.bcc ?? []))
  const [subject, setSubject] = useState(seed.subject ?? "")
  const [bodyText, setBodyText] = useState(seed.bodyText ?? "")
  const [attachments, setAttachments] = useState<MailComposeAttachment[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [showCopies, setShowCopies] = useState(Boolean(seed.cc?.length || seed.bcc?.length))
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const operationId = useRef(crypto.randomUUID())
  const lastSaved = useRef("")
  const draftIdRef = useRef<string | null>(null)
  const savePromise = useRef<Promise<string | null> | null>(null)

  const compose = useMemo<MailComposeRequest>(() => ({
    attachments,
    bcc: parseComposerAddresses(bcc),
    bodyText,
    cc: parseComposerAddresses(cc),
    clientOperationId: operationId.current,
    ...(draftId ? { draftId } : {}),
    ...(seed.inReplyTo ? { inReplyTo: seed.inReplyTo } : {}),
    ...(seed.references ? { references: seed.references } : {}),
    subject,
    ...(seed.threadId ? { threadId: seed.threadId } : {}),
    to: parseComposerAddresses(to),
  }), [attachments, bcc, bodyText, cc, draftId, seed.inReplyTo, seed.references, seed.threadId, subject, to])
  const serialized = JSON.stringify({ ...compose, draftId: undefined })
  const hasContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject || bodyText || attachments.length)

  const saveDraft = async () => {
    if (!online || !hasContent || serialized === lastSaved.current) return draftIdRef.current
    if (savePromise.current) await savePromise.current
    if (serialized === lastSaved.current) return draftIdRef.current
    const currentDraftId = draftIdRef.current
    const request = { ...compose, ...(currentDraftId ? { draftId: currentDraftId } : {}) }
    const pending = apiFetch<MailDraftResponse>(currentDraftId ? `${mailBasePath}/drafts/${encodeURIComponent(currentDraftId)}` : `${mailBasePath}/drafts`, {
      body: JSON.stringify(request),
      method: currentDraftId ? "PUT" : "POST",
    }).then((response) => {
      draftIdRef.current = response.draftId
      setDraftId(response.draftId)
      lastSaved.current = serialized
      return response.draftId
    })
    savePromise.current = pending
    setSaving(true)
    try {
      return await pending
    } finally {
      if (savePromise.current === pending) savePromise.current = null
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!online || !hasContent || serialized === lastSaved.current || sending) return
    const timer = window.setTimeout(() => void saveDraft().catch((error) => toast.error(getApiErrorMessage(error))), 1_200)
    return () => window.clearTimeout(timer)
  }, [hasContent, online, serialized, sending])

  const send = async () => {
    if (!online) return
    setSending(true)
    try {
      const currentDraftId = await saveDraft()
      const response = await apiFetch<MailSendResponse>(currentDraftId
        ? `${mailBasePath}/drafts/${encodeURIComponent(currentDraftId)}/send`
        : `${mailBasePath}/send`, {
        body: JSON.stringify({ ...compose, ...(currentDraftId ? { draftId: currentDraftId } : {}) }),
        method: "POST",
      })
      toast.success(response.reused ? "Message was already sent" : "Message sent")
      await onSent(response)
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const discard = async () => {
    if (draftIdRef.current && online) {
      try {
        await apiFetch(`${mailBasePath}/drafts/${encodeURIComponent(draftIdRef.current)}`, { method: "DELETE" })
      } catch (error) {
        toast.error(getApiErrorMessage(error))
        return
      }
    }
    onClose()
  }

  const attach = async (files: FileList | null) => {
    if (!files?.length) return
    const total = attachments.reduce((sum, attachment) => sum + base64ByteLength(attachment.contentBase64), 0)
      + [...files].reduce((sum, file) => sum + file.size, 0)
    if (total > MAX_ATTACHMENT_BYTES) {
      toast.error("Attachments must total 20 MB or less.")
      return
    }
    const loaded = await Promise.all([...files].map(async (file) => ({
      contentBase64: arrayBufferToBase64(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
    })))
    setAttachments((current) => [...current, ...loaded])
  }

  return (
    <FloatingWidget aria-label="Mail composer" className="z-[60]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          aria-label="Close mail composer"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">New message</h2>
        <span className="truncate text-content-secondary text-xs">
          {online ? saving ? "Saving draft…" : draftId ? "Draft saved" : "Drafts save automatically" : "Offline"}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Label className="w-8" htmlFor="mail-compose-to">To</Label>
            <Input autoFocus disabled={!online || sending} id="mail-compose-to" onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" value={to} />
            <Button disabled={!online || sending} onClick={() => setShowCopies((value) => !value)} size="sm" type="button" variant="ghost">Cc/Bcc</Button>
          </div>
          {showCopies ? <>
            <div className="flex items-center gap-2"><Label className="w-8" htmlFor="mail-compose-cc">Cc</Label><Input disabled={!online || sending} id="mail-compose-cc" onChange={(event) => setCc(event.target.value)} value={cc} /></div>
            <div className="flex items-center gap-2"><Label className="w-8" htmlFor="mail-compose-bcc">Bcc</Label><Input disabled={!online || sending} id="mail-compose-bcc" onChange={(event) => setBcc(event.target.value)} value={bcc} /></div>
          </> : null}
          <Input aria-label="Subject" disabled={!online || sending} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" value={subject} />
          <Textarea aria-label="Message body" className="min-h-64 flex-1 resize-none" disabled={!online || sending} onChange={(event) => setBodyText(event.target.value)} placeholder="Write a message…" value={bodyText} />
          {attachments.length ? <div className="flex flex-wrap gap-2">{attachments.map((attachment, index) => (
            <Button disabled={sending} key={`${attachment.filename}-${index}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} size="sm" type="button" variant="outline">
              <Paperclip /> {attachment.filename} ×
            </Button>
          ))}</div> : null}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stroke-default px-4 py-3">
        <Button disabled={sending || (Boolean(draftId) && !online)} onClick={() => void discard()} type="button" variant="ghost"><TrashIcon /> Discard</Button>
        <div className="flex items-center gap-2">
          <Label className="cursor-pointer"><input className="sr-only" disabled={!online || sending} multiple onChange={(event) => void attach(event.target.files)} type="file" /><span className="inline-flex h-8 items-center gap-2 rounded-md px-3 hover:bg-action-neutral-hover"><Paperclip /> Attach</span></Label>
          <Button disabled={!online || sending} onClick={() => void send()} type="button">{sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send</Button>
        </div>
      </footer>
    </FloatingWidget>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ByteLength(value: string) {
  return (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0)
}
