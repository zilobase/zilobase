import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SessionUser } from "@zilobase/features/auth";
import { Awareness } from "y-protocols/awareness";
import { ApiError, apiFetch } from "@/platform/network/api";
import { scheduleRealtimeAfterPagePaint } from "@/shared/lib/deferred-realtime";
import { getConnectivityState, subscribeConnectivity } from "@/platform/network/connectivity";
import { usePageEditorRegistry } from "../runtime/page-editor-registry";
import {
  applyTicketState,
  base64ToBytes,
  connectCollaborationDocument,
  type CollaborationTicket,
} from "./collaboration-connection";
import { collaborationColor } from "./color";
import { startPageConnection } from "./connection-session";
import {
  acquirePageDocument,
  markPageDocumentInitialized,
  pageCacheDeploymentKey,
  releasePageDocument,
  unblockCachedPage,
  verifyPageDocumentSaved,
} from "./page-document-cache";
import {
  createPageDocumentSession,
  emptyDocumentSession,
  type PageDocumentSession,
  type PageSessionServices,
} from "./page-document-session";

const noSubscription = () => () => {};
const getEmpty = () => emptyDocumentSession;
export function usePageCollaboration({
  enabled,
  localOnly = false,
  pageId,
  user,
}: {
  enabled: boolean;
  localOnly?: boolean;
  pageId: string;
  user: SessionUser | null | undefined;
}) {
  const { documentSessions } = usePageEditorRegistry();
  const [leaseState, setLeaseState] = useState<{
    key: string;
    session: PageDocumentSession;
  } | null>(null);
  const collaborationUser = useMemo(
    () =>
      user
        ? {
            avatar: user.image,
            color: collaborationColor(user.id),
            id: user.id,
            name: user.name || user.email,
          }
        : undefined,
    [user?.id, user?.image, user?.name, user?.email],
  );
  const key = user ? JSON.stringify([pageCacheDeploymentKey(), user.id, "page", pageId]) : null;
  useEffect(() => {
    if (!enabled || localOnly || !key || !collaborationUser) {
      setLeaseState(null);
      return;
    }
    const lease = documentSessions.acquire(key, () =>
      createPageDocumentSession({ user: collaborationUser, pageId }, services),
    );
    setLeaseState({ key, session: lease.session });
    return lease.release;
  }, [documentSessions, enabled, localOnly, key]);
  const session = enabled && !localOnly && leaseState?.key === key ? leaseState.session : null;
  useEffect(() => {
    if (collaborationUser) session?.updateUser(collaborationUser);
  }, [session, collaborationUser]);
  return useSyncExternalStore(
    session?.subscribe ?? noSubscription,
    session?.getSnapshot ?? getEmpty,
    getEmpty,
  );
}
function getTicket(pageId: string, signal?: AbortSignal, includeState = false) {
  return apiFetch<CollaborationTicket>(
    `/pages/${encodeURIComponent(pageId)}/collaboration-bootstrap`,
    {
      method: "POST",
      body: JSON.stringify({ includeState }),
      signal,
    },
  );
}
const services: PageSessionServices = {
  acquire: acquirePageDocument,
  release: releasePageDocument,
  initialize: markPageDocumentInitialized,
  unblock: unblockCachedPage,
  verify: async (entry, state) => {
    await verifyPageDocumentSaved(entry, base64ToBytes(state));
  },
  isAccessDenied: (reason) =>
    reason instanceof ApiError && (reason.status === 403 || reason.status === 404),
  awareness: (entry) => new Awareness(entry.document),
  getTicket,
  applyTicket: (entry, ticket) => applyTicketState(entry.document, ticket),
  online: () => getConnectivityState() === "online",
  subscribeConnectivity,
  schedule: scheduleRealtimeAfterPagePaint,
  connect: ({ entry, awareness, pageId, preparedTicket, user, publish }) =>
    startPageConnection({
      document: entry.document,
      awareness,
      pageId,
      preparedTicket,
      user,
      state: {
        provider: (provider) => publish({ provider }),
        status: (status) => publish({ status }),
        error: (error) => publish({ error }),
        synced: (synced) => publish({ synced }),
        unsyncedChanges: (unsyncedChanges) => publish({ unsyncedChanges }),
        users: (users) => publish({ users }),
      },
      services: {
        applyTicket: applyTicketState,
        connect: connectCollaborationDocument,
        getTicket,
        isAccessDenied: (reason) =>
          reason instanceof ApiError && (reason.status === 403 || reason.status === 404),
        schedule: scheduleRealtimeAfterPagePaint,
      },
    }),
};
