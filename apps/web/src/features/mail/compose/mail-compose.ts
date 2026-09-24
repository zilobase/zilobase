import type {
  MailAddress,
  MailMessageRecord,
  MailComposeAttachment,
  MailAttachmentMetadata,
} from "@zilobase/features/mail";

export type MailComposeSeed = {
  draftId?: string;
  draftVersion?: number;
  clientOperationId?: string;
  attachments?: MailComposeAttachment[];
  attachmentReferences?: MailAttachmentMetadata[];
  bcc?: MailAddress[];
  bodyHtml?: string;
  bodyText?: string;
  cc?: MailAddress[];
  inReplyTo?: string;
  needsSave?: boolean;
  references?: string[];
  subject?: string;
  threadId?: string;
  to?: MailAddress[];
};

export function parseComposerAddresses(value: string): MailAddress[] {
  return dedupe(
    splitComposerAddresses(value)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = /^(.*?)\s*<([^<>]+)>$/.exec(entry);
        return {
          address: (match?.[2] ?? entry).trim().toLowerCase(),
          name:
            match?.[1]
              ?.trim()
              .replace(/^"|"$/g, "")
              .replace(/\\(["\\])/g, "$1") || null,
        };
      }),
  );
}

export function formatComposerAddresses(addresses: MailAddress[]) {
  return addresses
    .map((item) => (item.name ? `${JSON.stringify(item.name)} <${item.address}>` : item.address))
    .join(", ");
}

export function replySeed(
  message: MailMessageRecord,
  ownEmail: string,
  replyAll = false,
): MailComposeSeed {
  const own = ownEmail.toLowerCase();
  const sender = message.replyTo ?? message.from;
  const to =
    message.from?.address.toLowerCase() === own
      ? dedupe(message.to.filter((address) => address.address.toLowerCase() !== own))
      : sender
        ? [sender]
        : [];
  const excluded = new Set([own, ...to.map((address) => address.address.toLowerCase())]);
  const cc = replyAll
    ? dedupe(
        [...message.to, ...message.cc].filter(
          (address) => !excluded.has(address.address.toLowerCase()),
        ),
      )
    : [];
  const references = [...message.references, message.messageIdHeader].filter(Boolean) as string[];
  return {
    cc,
    inReplyTo: message.messageIdHeader ?? undefined,
    references: [...new Set(references)].slice(-100),
    subject: replySubject(message.subject),
    threadId: message.threadId,
    to,
  };
}

function forwardedBody(message: MailMessageRecord) {
  return message.bodyText || (message.bodyHtml ? "" : message.snippet);
}

function forwardedSender(message: MailMessageRecord) {
  return message.from?.name || message.from?.address || "Unknown sender";
}

export function forwardSeed(message: MailMessageRecord): MailComposeSeed {
  const sender = forwardedSender(message);
  return {
    bodyHtml: message.bodyHtml ?? undefined,
    attachmentReferences: (message.attachments ?? []).filter((attachment) => !attachment.inline),
    bodyText: `\n\n---------- Forwarded message ----------\nFrom: ${sender}\nDate: ${message.date ?? new Date(message.internalDate).toLocaleString()}\nSubject: ${message.subject}\nTo: ${formatComposerAddresses(message.to)}\n\n${forwardedBody(message)}`,
    subject: /^(fwd?|fw):/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`,
  };
}

function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function dedupe(addresses: MailAddress[]) {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = address.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function draftSeed(
  message: MailMessageRecord,
  draftId: string,
  draftVersion?: number,
): MailComposeSeed {
  const operation = /^<zilobase\.([A-Za-z0-9_-]{8,128})@/.exec(message.messageIdHeader ?? "")?.[1];
  return {
    draftId,
    draftVersion,
    clientOperationId: operation,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    bodyText: message.bodyText ?? "",
    bodyHtml: message.bodyHtml ?? undefined,
    threadId: message.threadId,
    inReplyTo: message.inReplyTo ?? undefined,
    references: message.references,
    attachmentReferences: message.attachments,
  };
}

function splitComposerAddresses(value: string) {
  const entries: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (character === '"' && !escaped) quoted = !quoted;
    if (character === "," && !quoted) {
      entries.push(current);
      current = "";
    } else current += character;
    escaped = character === "\\" && !escaped;
  }
  if (current) entries.push(current);
  return entries;
}
