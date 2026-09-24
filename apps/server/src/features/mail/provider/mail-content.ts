import type { GmailMessage, GmailPart } from "./gmail-gateway";

export function partHeader(part: GmailPart, name: string) {
  return part.headers?.find((header) => header.name?.toLowerCase() === name)?.value;
}

export function isMailBodyPart(part: GmailPart) {
  return (
    ["text/plain", "text/html"].includes(part.mimeType ?? "") &&
    !part.filename &&
    !partHeader(part, "content-disposition")?.toLowerCase().startsWith("attachment") &&
    !partHeader(part, "content-id")
  );
}

export function base64MailBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

export function decodeMailBytes(bytes: Uint8Array, charset = "utf-8") {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export function decodeMailBody(part: GmailPart) {
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(
    partHeader(part, "content-type") ?? "",
  )?.[1];
  return decodeMailBytes(base64MailBytes(part.body?.data ?? ""), charset);
}

export function decodeMailHeader(value: string) {
  return value
    .replace(/(\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (original, charset, encoding, data) => {
      try {
        const bytes =
          encoding.toLowerCase() === "b"
            ? base64MailBytes(data)
            : Uint8Array.from(
                data
                  .replace(/_/g, " ")
                  .replace(/=([0-9a-f]{2})/gi, (_: string, hex: string) =>
                    String.fromCharCode(parseInt(hex, 16)),
                  ),
                (character: string) => character.charCodeAt(0),
              );
        return decodeMailBytes(bytes, charset);
      } catch {
        return original;
      }
    });
}

/** Fetch only external body parts; ordinary attachment bytes remain uncached. */
export async function hydrateMailBody(
  message: GmailMessage,
  download: (messageId: string, attachmentId: string) => Promise<Response>,
) {
  let bytesRead = 0;
  const walk = async (part?: GmailPart): Promise<void> => {
    if (!part) return;
    if (isMailBodyPart(part) && part.body?.attachmentId && part.body.data === undefined) {
      if (!message.id) throw new Error("Gmail returned a body without a message ID.");
      const response = await download(message.id, part.body.attachmentId);
      if (!response.ok) throw new Error("Gmail body could not be loaded.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      bytesRead += bytes.length;
      if (bytesRead > 30 * 1024 * 1024) throw new Error("Gmail message body is too large.");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      part.body = { size: bytes.length, data: btoa(binary) };
    }
    for (const child of part.parts ?? []) await walk(child);
  };
  await walk(message.payload);
  return message;
}
