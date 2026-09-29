import { pageQueryOptions } from "@zilobase/features/pages";
import { sessionQueryKey, type SessionResponse } from "@zilobase/features/auth";

import { queryClient } from "@/app/query-client";
import { getConnectivityState } from "@/platform/network/connectivity";
import { apiFetch } from "@/platform/network/api";
import { applyTicketState, type CollaborationTicket } from "./collaboration-connection";
import {
  acquirePageDocument,
  markPageDocumentInitialized,
  releasePageDocument,
} from "./page-document-cache";

const pending = new Map<string, Promise<void>>();

export function prefetchPageForNavigation(pageId: string) {
  const userId = queryClient.getQueryData<SessionResponse>(sessionQueryKey)?.user?.id;
  if (!userId || getConnectivityState() !== "online") return;
  const key = `${userId}:${pageId}`;
  if (pending.has(key) || pending.size >= 2) return;
  const task = Promise.allSettled([
    queryClient.prefetchQuery(pageQueryOptions(apiFetch, pageId)),
    prefetchDocument(userId, pageId),
  ]).then(() => undefined);
  pending.set(key, task);
  void task.finally(() => pending.delete(key));
}

async function prefetchDocument(userId: string, pageId: string) {
  const entry = await acquirePageDocument(userId, pageId);
  try {
    if (entry.hasPersistedState) return;
    const ticket = await apiFetch<CollaborationTicket>(
      `/pages/${encodeURIComponent(pageId)}/collaboration-bootstrap`,
      { method: "POST", body: JSON.stringify({ includeState: true }) },
    );
    applyTicketState(entry.document, ticket);
    await entry.flush();
    if (entry.persistenceError) return;
    await markPageDocumentInitialized(entry);
  } finally {
    releasePageDocument(entry);
  }
}
