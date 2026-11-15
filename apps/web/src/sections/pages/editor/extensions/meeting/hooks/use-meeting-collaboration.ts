import { meetingCollaborationTicket } from "@zilobase/features/meetings";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { SessionUser } from "@zilobase/features/auth";
import * as Y from "yjs";
import { ApiError, apiFetch } from "@/platform/network/api";
import {
  collaborationColor,
  applyTicketState,
  connectCollaborationDocument,
} from "../../../collaboration/lib/collaboration-connection";
import {
  acquirePageDocument,
  releasePageDocument,
  flushCachedPage,
  pageCacheDeploymentKey,
  type PageDocumentEntry,
} from "../../../collaboration/lib/page-document-cache";

function getMeetingTicket(meetingId: string, signal?: AbortSignal) {
  return meetingCollaborationTicket(apiFetch, meetingId, signal);
}

type MeetingConnection = {
  key: string | null;
  document: Y.Doc | null;
  provider: HocuspocusProvider | null;
  status: "connecting" | "connected" | "disconnected" | "blocked";
  error: string | null;
  synced: boolean;
  unsyncedChanges: number;
  flushLocal?: () => Promise<void>;
};
const empty: MeetingConnection = {
  key: null,
  document: null,
  provider: null,
  status: "disconnected",
  error: null,
  synced: false,
  unsyncedChanges: 0,
};

export function useMeetingCollaboration(
  meetingId: string | null,
  user: SessionUser | null | undefined,
) {
  const [connection, setConnection] = useState<MeetingConnection>(empty);
  const [, setRevision] = useState(0);
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
    [user?.email, user?.id, user?.image, user?.name],
  );
  const userRef = useRef(collaborationUser);
  userRef.current = collaborationUser;
  const documentId = meetingId ? `meeting:${meetingId}` : null;
  const key =
    user && documentId ? JSON.stringify([pageCacheDeploymentKey(), user.id, documentId]) : null;

  useEffect(() => {
    if (!key || !meetingId || !documentId || !userRef.current) return;
    const controller = new AbortController();
    const accountId = userRef.current.id;
    let fallbackDocument: Y.Doc | null = null;
    let denied = false;
    let disposed = false;
    let entry: PageDocumentEntry | null = null;
    let activeProvider: HocuspocusProvider | null = null;
    const publish = (patch: Partial<MeetingConnection>) => {
      if (!disposed)
        setConnection((current) => ({ ...(current.key === key ? current : empty), key, ...patch }));
    };
    const handleDocumentUpdate = () => {
      if (!disposed) setRevision((current) => current + 1);
    };
    const cacheError = (error: Error) => publish({ error: error.message });
    const synced = ({ state }: { state: boolean }) => {
      if (!denied) publish({ synced: state });
    };
    publish({ status: "connecting", error: null });
    void (async () => {
      try {
        const acquisition = await acquirePageDocument(accountId, documentId).then(
          (entry) => ({ entry, error: null }),
          (error: unknown) => ({ entry: null, error }),
        );
        const acquired = acquisition.entry;
        if (disposed) {
          if (acquired) releasePageDocument(acquired);
          return;
        }
        entry = acquired;
        // Meeting editing was already available without IndexedDB. Preserve
        // that online fallback, but never acknowledge a durable local flush.
        const nextDocument = acquired?.document ?? (fallbackDocument = new Y.Doc());
        nextDocument.on("update", handleDocumentUpdate);
        acquired?.errorListeners.add(cacheError);
        const ticket = await getMeetingTicket(meetingId, controller.signal);
        if (disposed) return;
        applyTicketState(nextDocument, ticket);
        activeProvider = connectCollaborationDocument({
          autoConnect: false,
          document: nextDocument,
          pageId: meetingId,
          ticket,
          refreshTicket: () => getMeetingTicket(meetingId, controller.signal),
          onAuthenticationFailed: (reason) => {
            denied = true;
            publish({ status: "blocked", synced: false, error: reason });
          },
          onStatus: (status) => {
            if (!denied) publish({ status, ...(status === "connected" ? {} : { synced: false }) });
          },
          onUnsyncedChanges: (unsyncedChanges) => publish({ unsyncedChanges }),
        });
        if (acquired) acquired.transportOrigin = activeProvider;
        activeProvider.setAwarenessField("user", userRef.current!);
        activeProvider.on("synced", synced);
        publish({
          document: nextDocument,
          provider: activeProvider,
          flushLocal: acquired
            ? () => flushCachedPage(accountId, documentId)
            : async () => {
                throw acquisition.error;
              },
        });
        void activeProvider.connect().catch(() => {
          if (!denied) publish({ status: "disconnected", synced: false });
        });
      } catch (error) {
        if (!controller.signal.aborted)
          publish({
            status:
              error instanceof ApiError && [401, 403, 404].includes(error.status)
                ? "blocked"
                : "disconnected",
            error: error instanceof Error ? error.message : "Could not connect meeting content.",
          });
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      activeProvider?.off("synced", synced);
      activeProvider?.destroy();
      if (entry) {
        entry.document.off("update", handleDocumentUpdate);
        entry.errorListeners.delete(cacheError);
        entry.transportOrigin = null;
        releasePageDocument(entry);
      }
      fallbackDocument?.off("update", handleDocumentUpdate);
      fallbackDocument?.destroy();
    };
  }, [key, meetingId, documentId]);
  const current = connection.key === key ? connection : empty;
  useEffect(() => {
    if (collaborationUser) current.provider?.setAwarenessField("user", collaborationUser);
  }, [current.provider, collaborationUser]);
  return { ...current, user: collaborationUser };
}
