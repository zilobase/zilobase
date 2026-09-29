import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { SessionUser } from "@zilobase/features/auth";
import { Awareness } from "y-protocols/awareness";

import { ApiError, apiFetch } from "@/platform/network/api";
import { scheduleRealtimeAfterPagePaint } from "@/shared/lib/deferred-realtime";
import {
  applyTicketState,
  connectCollaborationDocument,
  type CollaborationTicket,
} from "./collaboration-connection";
import { collaborationColor } from "./color";
import { getConnectivityState, subscribeConnectivity } from "@/platform/network/connectivity";
import { startPageConnection } from "./connection-session";
import {
  acquirePageDocument,
  markPageDocumentInitialized,
  releasePageDocument,
  unblockCachedPage,
  verifyPageDocumentSaved,
  type PageDocumentEntry,
} from "./page-document-cache";
import type { CollaborationUser, CollaborationStatus } from "./collaboration-contracts";
import { canEditPageDuringConnection } from "./collaboration-readiness";

const STARTUP_WINDOW_MS = 20_000;

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
  const connectivity = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivityState,
    () => "online" as const,
  );
  const [entry, setEntry] = useState<PageDocumentEntry | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [connectionEntry, setConnectionEntry] = useState<PageDocumentEntry | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<CollaborationStatus>("disconnected");
  const [synced, setSynced] = useState(false);
  const [startupAllowed, setStartupAllowed] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);
  const [users, setUsers] = useState<CollaborationUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [acquisitionRetry, setAcquisitionRetry] = useState(0);
  const preparedTicketRef = useRef<{ pageId: string; ticket: CollaborationTicket } | null>(null);

  useEffect(() => {
    if (!enabled || !user || localOnly) {
      setEntry(null);
      setAwareness(null);
      setStartupAllowed(false);
      setError(null);
      return;
    }

    let disposed = false;
    let acquired: PageDocumentEntry | null = null;
    let activeAwareness: Awareness | null = null;
    const controller = new AbortController();
    setEntry(null);
    setAwareness(null);
    setConnectionEntry(null);
    setStatus("disconnected");
    setError(null);
    setSynced(false);
    setStartupAllowed(false);

    void (async () => {
      try {
        const next = await acquirePageDocument(user.id, pageId);
        acquired = next;
        if (disposed) {
          releasePageDocument(next);
          acquired = null;
          return;
        }

        if (!next.hasPersistedState) {
          if (getConnectivityState() !== "online") {
            setError("Page content is unavailable offline.");
            releasePageDocument(next);
            acquired = null;
            return;
          }
          const ticket = await getTicket(pageId, controller.signal, true);
          if (disposed) return;
          applyTicketState(next.document, ticket);
          await next.flush();
          if (next.persistenceError) throw next.persistenceError;
          await markPageDocumentInitialized(next);
          preparedTicketRef.current = { pageId, ticket };
        }

        setError(null);
        activeAwareness = new Awareness(next.document);
        setAwareness(activeAwareness);
        setEntry(next);
        setStartupAllowed(
          getConnectivityState() === "online" && !next.persistenceError && !next.blocked,
        );
        next.errorListeners.add(setCacheError);
      } catch (reason) {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "Could not open page content.");
          setStartupAllowed(false);
        }
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      preparedTicketRef.current = null;
      if (acquired) releasePageDocument(acquired);
      acquired?.errorListeners.delete(setCacheError);
      activeAwareness?.destroy();
    };
    function setCacheError(reason: Error) {
      setError(`Local page cache failed: ${reason.message}`);
      setStartupAllowed(false);
    }
  }, [acquisitionRetry, enabled, localOnly, pageId, user?.id]);

  useEffect(() => {
    if (!enabled || entry || !error || connectivity !== "online") return;
    const retry = window.setTimeout(() => setAcquisitionRetry((value) => value + 1), 3_000);
    return () => window.clearTimeout(retry);
  }, [connectivity, enabled, entry, error]);

  useEffect(() => {
    if (!entry || connectivity !== "online" || localOnly) {
      setStartupAllowed(false);
      setSynced(false);
      return;
    }
    if (synced) return;
    const timeout = window.setTimeout(() => setStartupAllowed(false), STARTUP_WINDOW_MS);
    return () => window.clearTimeout(timeout);
  }, [entry, connectivity, localOnly, synced]);

  useEffect(() => {
    if (connectivity === "online" && entry) setConnectionEntry(entry);
    if (connectivity !== "online" && !provider) setConnectionEntry(null);
  }, [connectivity, entry, provider]);

  useEffect(() => {
    if (!entry || connectionEntry !== entry || !awareness || !enabled || !user || localOnly) {
      setProvider(null);
      setSynced(false);
      setUsers([]);
      return;
    }

    const preparedTicket =
      preparedTicketRef.current?.pageId === pageId ? preparedTicketRef.current.ticket : null;
    preparedTicketRef.current = null;

    return startPageConnection({
      document: entry.document,
      awareness,
      pageId,
      preparedTicket,
      user: {
        avatar: user.image,
        color: collaborationColor(user.id),
        id: user.id,
        name: user.name || user.email,
      },
      state: {
        provider: (next) => {
          entry.transportOrigin = next;
          setProvider(next);
        },
        status: (next) => {
          setStatus(next);
          if (next === "blocked" || next === "disconnected") setStartupAllowed(false);
        },
        error: (next) => {
          setError(next);
          if (next) setStartupAllowed(false);
        },
        synced: (ready) => {
          setSynced(ready);
          if (ready) void unblockCachedPage(entry);
        },
        unsyncedChanges: setUnsyncedChanges,
        users: setUsers,
      },
      services: pageConnectionServices,
    });
  }, [awareness, connectionEntry, entry, enabled, localOnly, pageId, retryNonce, user?.id]);

  useEffect(() => {
    if (!entry || provider || !error || status !== "disconnected" || connectivity !== "online") {
      return;
    }
    const retry = window.setTimeout(() => setRetryNonce((value) => value + 1), 3_000);
    return () => window.clearTimeout(retry);
  }, [connectivity, entry, error, provider, status]);

  useEffect(() => {
    if (!entry || !synced || unsyncedChanges !== 0 || !entry.locallyChanged) return;
    let cancelled = false;
    let timeout: number | undefined;
    const verify = async () => {
      try {
        const ticket = await getTicket(pageId, undefined, true);
        if (!cancelled && ticket.initialState) {
          const { base64ToBytes } = await import("./collaboration-connection");
          await verifyPageDocumentSaved(entry, base64ToBytes(ticket.initialState));
        }
      } catch {
        // Keep the durable local changes and retry while the page remains live.
      }
      if (!cancelled && entry.locallyChanged) timeout = window.setTimeout(verify, 30_000);
    };
    timeout = window.setTimeout(verify, 2_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [entry, pageId, synced, unsyncedChanges]);

  useEffect(() => {
    if (!provider) return;
    if (connectivity !== "online") {
      provider.disconnect();
      setStatus("disconnected");
      setSynced(false);
      setStartupAllowed(false);
      return;
    }
    let disposed = false;
    const cancel = scheduleRealtimeAfterPagePaint(() => {
      if (disposed) return;
      void provider.connect().catch(() => {
        if (!disposed) {
          setStatus("disconnected");
          setStartupAllowed(false);
        }
      });
    });
    return () => {
      disposed = true;
      cancel();
    };
  }, [connectivity, provider]);

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
    [user],
  );

  return {
    document: entry?.document ?? null,
    awareness,
    entry,
    error,
    provider,
    status,
    synced,
    online: connectivity === "online",
    canEdit: canEditPageDuringConnection({
      online: connectivity === "online",
      error,
      cacheError: entry?.persistenceError ?? null,
      blocked: entry?.blocked ?? false,
      startupAllowed,
      status,
      synced,
    }),
    unsyncedChanges,
    user: collaborationUser,
    users,
  };
}

function getTicket(pageId: string, signal?: AbortSignal, includeState = false) {
  return apiFetch<CollaborationTicket>(
    `/pages/${encodeURIComponent(pageId)}/collaboration-bootstrap`,
    { method: "POST", body: JSON.stringify({ includeState }), signal },
  );
}

const pageConnectionServices = {
  applyTicket: applyTicketState,
  connect: connectCollaborationDocument,
  getTicket,
  isAccessDenied: (reason: unknown) =>
    reason instanceof ApiError && (reason.status === 403 || reason.status === 404),
  schedule: scheduleRealtimeAfterPagePaint,
};
