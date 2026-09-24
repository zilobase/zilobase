import { mailApiBasePath, type MailDraftResponse } from "@zilobase/features/mail";
import { apiFetch, getApiRequestHeaders, toApiUrl } from "@/platform/network/api";
import { desktopNetworkFetch } from "@/platform/network";
import { draftSeed, type MailComposeSeed } from "./mail-compose";

export async function loadComposeAttachments(
  seed: MailComposeSeed,
  workspaceId?: string | null,
): Promise<MailComposeSeed> {
  const attachments = [...(seed.attachments ?? [])];
  let total = attachments.reduce((sum, item) => sum + (item.contentBase64.length * 3) / 4, 0);
  for (const reference of seed.attachmentReferences ?? []) {
    if (total + reference.size > 20 * 1024 * 1024)
      throw new Error("Attachments must total 20 MB or less.");
    const response = await desktopNetworkFetch(
      toApiUrl(
        `${mailApiBasePath(workspaceId)}/messages/${encodeURIComponent(reference.messageId)}/attachments/${encodeURIComponent(reference.attachmentId)}`,
      ),
      {
        credentials: "include",
        headers: getApiRequestHeaders(),
      },
    );
    if (!response.ok)
      throw new Error("The attachment could not be loaded. Try opening the message again.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    total += bytes.length;
    if (total > 20 * 1024 * 1024) throw new Error("Attachments must total 20 MB or less.");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    attachments.push({
      filename: reference.filename,
      mimeType: reference.mimeType,
      contentBase64: btoa(binary),
    });
  }
  return { ...seed, attachments, attachmentReferences: undefined };
}

export async function loadDraftForThread(threadId: string, workspaceId?: string | null) {
  const base = mailApiBasePath(workspaceId);
  const page = await apiFetch<{ drafts: MailDraftResponse[] }>(`${base}/drafts`);
  const draft = page.drafts.find((item) => item.message.threadId === threadId);
  if (draft)
    return loadComposeAttachments(
      draftSeed(draft.message, draft.draftId, draft.version),
      workspaceId,
    );
  throw new Error("This draft no longer exists in Gmail. Refresh the mailbox.");
}
