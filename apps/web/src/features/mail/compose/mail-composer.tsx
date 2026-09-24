import { useEffect, useMemo, useRef, useState } from "react";
import {
  mailApiBasePath,
  type MailComposeAttachment,
  type MailComposeRequest,
  type MailDraftResponse,
  type MailSendResponse,
} from "@zilobase/features/mail";
import { toast } from "sonner";

import { ApiError, apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { FloatingWidget } from "@/shared/components/floating-widget";
import { Loader2Icon, Paperclip, SendIcon, TrashIcon, XIcon } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import {
  formatComposerAddresses,
  parseComposerAddresses,
  type MailComposeSeed,
} from "./mail-compose";

import { createDraftSession } from "./draft-session";
import { deleteMailComposeRecovery, saveMailComposeRecovery } from "./mail-compose-recovery";
import { MailRichEditor, mailTextToHtml } from "./mail-rich-editor";
import type { MailDatabase } from "../storage/mail-database";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function MailComposer({
  database,
  onClose,
  onSent,
  onDraftChanged,
  online,
  seed,
  workspaceId,
}: {
  database: MailDatabase;
  onClose: () => void;
  onDraftChanged?: () => Promise<void> | void;
  onSent: (response: MailSendResponse) => Promise<void> | void;
  online: boolean;
  seed: MailComposeSeed;
  workspaceId?: string | null;
}) {
  const mailBasePath = mailApiBasePath(workspaceId);
  const [to, setTo] = useState(() => formatComposerAddresses(seed.to ?? []));
  const [cc, setCc] = useState(() => formatComposerAddresses(seed.cc ?? []));
  const [bcc, setBcc] = useState(() => formatComposerAddresses(seed.bcc ?? []));
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [bodyText, setBodyText] = useState(seed.bodyText ?? "");
  const [bodyHtml, setBodyHtml] = useState(seed.bodyHtml ?? mailTextToHtml(seed.bodyText ?? ""));
  const [attachments, setAttachments] = useState<MailComposeAttachment[]>(seed.attachments ?? []);
  const [draftId, setDraftId] = useState<string | null>(seed.draftId ?? null);
  const [draftVersion, setDraftVersion] = useState<number | undefined>(seed.draftVersion);
  const [showCopies, setShowCopies] = useState(Boolean(seed.cc?.length || seed.bcc?.length));
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const attachmentLoad = useRef(false);
  const [sending, setSending] = useState(false);
  const operationId = useRef(seed.clientOperationId ?? crypto.randomUUID());
  const session = useRef<ReturnType<typeof createDraftSession> | null>(null);
  if (!session.current)
    session.current = createDraftSession(seed.draftId ?? null, async (id, request) => {
      const response = await apiFetch<MailDraftResponse>(
        id ? `${mailBasePath}/drafts/${encodeURIComponent(id)}` : `${mailBasePath}/drafts`,
        {
          body: JSON.stringify({ ...request, ...(id ? { draftId: id } : {}) }),
          method: id ? "PUT" : "POST",
        },
      );
      setDraftId(response.draftId);
      setDraftVersion(response.version);
      await deleteMailComposeRecovery(database, operationId.current);
      void Promise.resolve(onDraftChanged?.()).catch(() => {});
      return response.draftId;
    });
  const busy = useRef(false);
  const sendAttempt = useRef<{ compose: MailComposeRequest; draftId: string | null } | null>(null);
  const lastSaved = useRef("");

  const compose = useMemo<MailComposeRequest>(
    () => ({
      attachments,
      bcc: parseComposerAddresses(bcc),
      bodyHtml,
      bodyText,
      cc: parseComposerAddresses(cc),
      clientOperationId: operationId.current,
      ...(draftId ? { draftId } : {}),
      ...(draftVersion ? { draftVersion } : {}),
      ...(seed.inReplyTo ? { inReplyTo: seed.inReplyTo } : {}),
      ...(seed.references ? { references: seed.references } : {}),
      subject,
      ...(seed.threadId ? { threadId: seed.threadId } : {}),
      to: parseComposerAddresses(to),
    }),
    [
      attachments,
      bcc,
      bodyHtml,
      bodyText,
      cc,
      draftId,
      draftVersion,
      seed.inReplyTo,
      seed.references,
      seed.threadId,
      subject,
      to,
    ],
  );
  const serialized = JSON.stringify({ ...compose, draftId: undefined });
  const hasContent = Boolean(
    to.trim() || cc.trim() || bcc.trim() || subject || bodyText || attachments.length,
  );

  useEffect(() => {
    if (!hasContent || sendAttempt.current) return;
    const timer = window.setTimeout(() => {
      void saveMailComposeRecovery(database, operationId.current, {
        ...compose,
        draftId: draftId ?? undefined,
        draftVersion,
      }).catch(() => {});
    }, 300);
    return () => window.clearTimeout(timer);
  }, [compose, database, draftId, draftVersion, hasContent]);

  const saveDraft = async () => {
    if (!online || (!hasContent && !draftId) || sendAttempt.current) return draftId;
    setSaving(true);
    try {
      const id = await session.current!.save(compose);
      lastSaved.current = serialized;
      return id;
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    if (busy.current || attachmentLoad.current) return;
    busy.current = true;
    setSending(true);
    try {
      if (!online && hasContent)
        await saveMailComposeRecovery(database, operationId.current, compose);
      await saveDraft();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  useEffect(() => {
    if (
      !online ||
      !hasContent ||
      serialized === lastSaved.current ||
      sending ||
      sendAttempt.current
    )
      return;
    const timer = window.setTimeout(
      () => void saveDraft().catch((error) => toast.error(getApiErrorMessage(error))),
      1_200,
    );
    return () => window.clearTimeout(timer);
  }, [hasContent, online, serialized, sending]);

  const rejectSend = (error: unknown) => {
    if (error instanceof ApiError && [400, 403, 413, 422].includes(error.status)) {
      sendAttempt.current = null;
      operationId.current = crypto.randomUUID();
    }
    toast.error(getApiErrorMessage(error));
  };

  const send = async () => {
    if (!online || busy.current || attachmentLoad.current) return;
    busy.current = true;
    setSending(true);
    try {
      if (!sendAttempt.current) sendAttempt.current = { compose, draftId: await saveDraft() };
      const { compose: sendCompose, draftId: currentDraftId } = sendAttempt.current;
      const response = await apiFetch<MailSendResponse>(
        currentDraftId
          ? `${mailBasePath}/drafts/${encodeURIComponent(currentDraftId)}/send`
          : `${mailBasePath}/send`,
        {
          body: JSON.stringify({
            ...sendCompose,
            ...(currentDraftId ? { draftId: currentDraftId } : {}),
          }),
          method: "POST",
        },
      );
      toast.success(response.reused ? "Message was already sent" : "Message sent");
      await deleteMailComposeRecovery(database, operationId.current);
      onClose();
      void Promise.resolve(onSent(response)).catch(() =>
        toast.error("Message sent. Refresh the mailbox to update it."),
      );
    } catch (error) {
      rejectSend(error);
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const discard = async () => {
    if (busy.current || attachmentLoad.current || (!online && Boolean(draftId))) return;
    busy.current = true;
    setSending(true);
    try {
      if (online)
        await session.current!.discard(async (id) => {
          await apiFetch(`${mailBasePath}/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
        });
      await deleteMailComposeRecovery(database, operationId.current);
      void Promise.resolve(onDraftChanged?.()).catch(() => {});
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length || attachmentLoad.current || busy.current) return;
    const total =
      attachments.reduce((sum, attachment) => sum + base64ByteLength(attachment.contentBase64), 0) +
      [...files].reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENT_BYTES) {
      toast.error("Attachments must total 20 MB or less.");
      return;
    }
    attachmentLoad.current = true;
    setAttaching(true);
    try {
      const loaded = await Promise.all(
        [...files].map(async (file) => ({
          contentBase64: arrayBufferToBase64(await file.arrayBuffer()),
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
        })),
      );
      setAttachments((current) => [...current, ...loaded]);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      attachmentLoad.current = false;
      setAttaching(false);
    }
  };

  return (
    <FloatingWidget aria-label="Mail composer" className="z-[60]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          aria-label="Close mail composer"
          onClick={() => void close()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">New message</h2>
        <span className="truncate text-content-secondary text-xs">
          {online
            ? saving
              ? "Saving draft…"
              : draftId
                ? "Draft saved"
                : "Drafts save automatically"
            : "Offline"}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-2">
          <Label className="w-8" htmlFor="mail-compose-to">
            To
          </Label>
          <Input
            autoFocus
            disabled={sending || Boolean(sendAttempt.current)}
            id="mail-compose-to"
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
            value={to}
          />
          <Button
            disabled={sending || Boolean(sendAttempt.current)}
            onClick={() => setShowCopies((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cc/Bcc
          </Button>
        </div>
        {showCopies ? (
          <>
            <div className="flex items-center gap-2">
              <Label className="w-8" htmlFor="mail-compose-cc">
                Cc
              </Label>
              <Input
                disabled={sending || Boolean(sendAttempt.current)}
                id="mail-compose-cc"
                onChange={(event) => setCc(event.target.value)}
                value={cc}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-8" htmlFor="mail-compose-bcc">
                Bcc
              </Label>
              <Input
                disabled={sending || Boolean(sendAttempt.current)}
                id="mail-compose-bcc"
                onChange={(event) => setBcc(event.target.value)}
                value={bcc}
              />
            </div>
          </>
        ) : null}
        <Input
          aria-label="Subject"
          disabled={sending || Boolean(sendAttempt.current)}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject"
          value={subject}
        />
        <MailRichEditor
          disabled={sending || Boolean(sendAttempt.current)}
          initialHtml={bodyHtml}
          onChange={(value) => {
            setBodyHtml(value.html);
            setBodyText(value.text);
          }}
        />
        {attachments.length ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <Button
                disabled={sending || Boolean(sendAttempt.current)}
                key={`${attachment.filename}-${index}`}
                onClick={() =>
                  setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Paperclip /> {attachment.filename} ×
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stroke-default px-4 py-3">
        <Button
          disabled={sending || (Boolean(draftId) && !online)}
          onClick={() => void discard()}
          type="button"
          variant="ghost"
        >
          <TrashIcon /> Discard
        </Button>
        <div className="flex items-center gap-2">
          <Label className="cursor-pointer">
            <input
              className="sr-only"
              disabled={sending || Boolean(sendAttempt.current)}
              multiple
              onChange={(event) => void attach(event.target.files)}
              type="file"
            />
            <span className="inline-flex h-8 items-center gap-2 rounded-md px-3 hover:bg-action-neutral-hover">
              <Paperclip /> Attach
            </span>
          </Label>
          <Button
            disabled={!online || sending || attaching}
            onClick={() => void send()}
            type="button"
          >
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send
          </Button>
        </div>
      </footer>
    </FloatingWidget>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ByteLength(value: string) {
  return (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
}
