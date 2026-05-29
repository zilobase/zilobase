import type {
  GmailAttachmentSummary,
  GmailMessage,
  GmailMessagePart,
  GmailMessageSummary,
} from "./types.js";

export function summarizeGmailMessage(
  message: GmailMessage,
): GmailMessageSummary {
  return {
    attachments: getGmailAttachments(message),
    bcc: getGmailHeader(message, "bcc"),
    bodyHtml: getGmailMessageHtml(message),
    bodyText: getGmailMessageText(message),
    cc: getGmailHeader(message, "cc"),
    date: getGmailHeader(message, "date"),
    from: getGmailHeader(message, "from"),
    historyId: message.historyId,
    id: message.id,
    internalDate: message.internalDate,
    labelIds: message.labelIds,
    sizeEstimate: message.sizeEstimate,
    snippet: message.snippet,
    subject: getGmailHeader(message, "subject"),
    threadId: message.threadId,
    to: getGmailHeader(message, "to"),
  };
}

export function getGmailHeader(message: GmailMessage, name: string) {
  const normalizedName = name.toLowerCase();
  return message.payload?.headers?.find(
    (header) => header.name.toLowerCase() === normalizedName,
  )?.value;
}

export function getGmailMessageText(message: GmailMessage) {
  return getGmailPartText(message.payload);
}

export function getGmailMessageHtml(message: GmailMessage) {
  return getGmailPartHtml(message.payload);
}

export function getGmailAttachments(message: GmailMessage) {
  const attachments: GmailAttachmentSummary[] = [];
  collectGmailAttachments(message.payload, attachments);
  return attachments.length ? attachments : undefined;
}

function getGmailPartText(part?: GmailMessagePart): string | undefined {
  if (!part) {
    return undefined;
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeGmailBodyData(part.body.data);
  }

  const plainChild = part.parts
    ?.map((child) => getGmailPartText(child))
    .find((text): text is string => Boolean(text?.trim()));

  if (plainChild) {
    return plainChild;
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return htmlToText(decodeGmailBodyData(part.body.data));
  }

  return undefined;
}

function getGmailPartHtml(part?: GmailMessagePart): string | undefined {
  if (!part) {
    return undefined;
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeGmailBodyData(part.body.data);
  }

  return part.parts
    ?.map((child) => getGmailPartHtml(child))
    .find((html): html is string => Boolean(html?.trim()));
}

function collectGmailAttachments(
  part: GmailMessagePart | undefined,
  attachments: GmailAttachmentSummary[],
) {
  if (!part) {
    return;
  }

  const hasAttachment =
    Boolean(part.body?.attachmentId) ||
    Boolean(part.filename?.trim()) ||
    Boolean(part.mimeType && !part.mimeType.startsWith("multipart/"));

  if (hasAttachment && part.body?.attachmentId) {
    attachments.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      partId: part.partId,
      size: part.body.size,
    });
  }

  for (const child of part.parts ?? []) {
    collectGmailAttachments(child, attachments);
  }
}

export function decodeGmailBodyData(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  if (typeof atob !== "function") {
    throw new Error("Base64 decoding is not available.");
  }

  return decodeURIComponent(
    Array.from(atob(padded), (char) =>
      `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
    ).join(""),
  );
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
