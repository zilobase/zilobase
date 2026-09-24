import { mailApiBasePath, type MailDraftResponse } from "@zilobase/features/mail";
import { apiFetch, getApiRequestHeaders, toApiUrl } from "@/platform/network/api";
import { desktopNetworkFetch } from "@/platform/network";
import { draftSeed, type MailComposeSeed } from "./mail-compose";

function withPlainTextBody(seed: MailComposeSeed) {
  if (seed.sourceHtml) {
    const document = new DOMParser().parseFromString(seed.sourceHtml, "text/html");
    document.querySelectorAll("script,style,noscript").forEach((element) => element.remove());
    document.querySelectorAll("br,p,div,li,tr").forEach((element) => element.append("\n"));
    seed = {
      ...seed,
      bodyText: (seed.bodyText ?? "") + (document.body.textContent ?? ""),
      sourceHtml: undefined,
    };
  }
  return seed;
}

export async function loadComposeAttachments(
  seed: MailComposeSeed,
  workspaceId?: string | null,
): Promise<MailComposeSeed> {
  seed = withPlainTextBody(seed);
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
  let pageToken: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await apiFetch<{
      drafts?: Array<{ id?: string; message?: { threadId?: string } }>;
      nextPageToken?: string;
    }>(`${base}/drafts${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    const match = page.drafts?.find((draft) => draft.message?.threadId === threadId);
    if (match?.id) {
      const draft = await apiFetch<MailDraftResponse>(
        `${base}/drafts/${encodeURIComponent(match.id)}`,
      );
      return loadComposeAttachments(draftSeed(draft.message, draft.draftId), workspaceId);
    }
    pageToken = page.nextPageToken;
    if (pageToken && seen.has(pageToken))
      throw new Error("Gmail returned a repeated draft cursor.");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  throw new Error("This draft no longer exists in Gmail. Refresh the mailbox.");
}
