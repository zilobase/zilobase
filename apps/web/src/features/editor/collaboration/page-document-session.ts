import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import type { PageDocumentEntry } from "./page-document-cache";
import type { CollaborationStatus, CollaborationUser } from "./collaboration-contracts";
import type { CollaborationTicket } from "./collaboration-connection";
import { canEditPageDuringConnection } from "./collaboration-readiness";

export type DocumentSessionSnapshot = {
  document: PageDocumentEntry["document"] | null;
  entry: PageDocumentEntry | null;
  awareness: Awareness | null;
  provider: HocuspocusProvider | null;
  error: string | null;
  status: CollaborationStatus;
  synced: boolean;
  online: boolean;
  canEdit: boolean;
  unsyncedChanges: number;
  user?: { avatar?: string | null; color: string; id: string; name: string };
  users: CollaborationUser[];
};
export const emptyDocumentSession: DocumentSessionSnapshot = {
  document: null,
  entry: null,
  awareness: null,
  provider: null,
  error: null,
  status: "disconnected",
  synced: false,
  online: true,
  canEdit: false,
  unsyncedChanges: 0,
  users: [],
};
type SessionUser = NonNullable<DocumentSessionSnapshot["user"]>;
export type PageSessionServices = {
  isAccessDenied: (reason: unknown) => boolean;
  acquire: (userId: string, pageId: string) => Promise<PageDocumentEntry>;
  release: (entry: PageDocumentEntry) => void;
  initialize: (entry: PageDocumentEntry) => Promise<void>;
  unblock: (entry: PageDocumentEntry) => Promise<void>;
  verify: (entry: PageDocumentEntry, state: string) => Promise<void>;
  awareness: (entry: PageDocumentEntry) => Awareness;
  getTicket: (
    pageId: string,
    signal?: AbortSignal,
    includeState?: boolean,
  ) => Promise<CollaborationTicket>;
  applyTicket: (entry: PageDocumentEntry, ticket: CollaborationTicket) => void;
  online: () => boolean;
  subscribeConnectivity: (listener: () => void) => () => void;
  schedule: (callback: () => void) => () => void;
  connect: (input: {
    entry: PageDocumentEntry;
    awareness: Awareness;
    pageId: string;
    preparedTicket: CollaborationTicket | null;
    user: SessionUser;
    publish: (patch: Partial<DocumentSessionSnapshot>) => void;
  }) => () => void;
};

/** One document, awareness and transport per deployment/account/page lease group. */
export function createPageDocumentSession(
  input: { user: SessionUser; pageId: string },
  services: PageSessionServices,
) {
  let snapshot = { ...emptyDocumentSession, online: services.online(), user: input.user };
  const listeners = new Set<() => void>();
  const controller = new AbortController();
  let disposed = false;
  let startupAllowed = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let verifyTimer: ReturnType<typeof setTimeout> | undefined;
  let stopConnection: (() => void) | undefined;
  let cancelConnect: (() => void) | undefined;
  let epoch = 0;
  let acquiring = false;

  const publish = (patch: Partial<DocumentSessionSnapshot>) => {
    if (disposed) return;
    const next = { ...snapshot, ...patch };
    if (patch.status === "blocked" || patch.status === "disconnected" || patch.error)
      startupAllowed = false;
    next.canEdit = canEditPageDuringConnection({
      online: next.online,
      error: next.error,
      cacheError: next.entry?.persistenceError ?? null,
      blocked: next.entry?.blocked ?? false,
      startupAllowed,
      status: next.status,
      synced: next.synced,
    });
    snapshot = next;
    for (const listener of listeners) listener();
    if (patch.provider) connectProvider(patch.provider);
    if (next.synced && next.entry && next.unsyncedChanges === 0 && next.entry.locallyChanged)
      scheduleVerification();
  };
  const fail = (reason: unknown) =>
    publish({ error: reason instanceof Error ? reason.message : "Could not open page content." });
  const cacheError = (reason: Error) =>
    publish({ error: `Local page cache failed: ${reason.message}` });
  const connectProvider = (provider: HocuspocusProvider) => {
    cancelConnect?.();
    if (!snapshot.online) return;
    cancelConnect = services.schedule(() => {
      if (!disposed && snapshot.provider === provider && snapshot.online) {
        void provider.connect().catch(() => publish({ status: "disconnected", synced: false }));
      }
    });
  };
  const scheduleVerification = () => {
    if (verifyTimer !== undefined) return;
    verifyTimer = setTimeout(() => {
      verifyTimer = undefined;
      void verifySaved();
    }, 2_000);
  };
  const verifySaved = async () => {
    const entry = snapshot.entry;
    if (
      disposed ||
      !entry ||
      !snapshot.online ||
      !snapshot.synced ||
      snapshot.unsyncedChanges !== 0
    )
      return;
    try {
      const ticket = await services.getTicket(input.pageId, controller.signal, true);
      if (!disposed && ticket.initialState) await services.verify(entry, ticket.initialState);
    } catch {
      /* Unconfirmed local updates stay durable in the existing cache. */
    }
    if (!disposed && entry.locallyChanged) {
      verifyTimer = setTimeout(() => {
        verifyTimer = undefined;
        void verifySaved();
      }, 30_000);
    }
  };
  const startConnection = (preparedTicket: CollaborationTicket | null) => {
    if (disposed || !snapshot.entry || !snapshot.awareness || !snapshot.online) return;
    const generation = ++epoch;
    stopConnection?.();
    stopConnection = services.connect({
      entry: snapshot.entry,
      awareness: snapshot.awareness,
      pageId: input.pageId,
      preparedTicket,
      user: snapshot.user!,
      publish: (patch) => {
        if (disposed || generation !== epoch) return;
        if (patch.provider !== undefined) snapshot.entry!.transportOrigin = patch.provider;
        publish(patch);
        if (patch.synced) void services.unblock(snapshot.entry!);
        if (patch.status === "disconnected" && snapshot.online) scheduleRetry();
      },
    });
  };
  const scheduleRetry = () => {
    if (disposed || retryTimer !== undefined || !snapshot.online || snapshot.status === "blocked")
      return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (snapshot.entry) startConnection(null);
      else void acquire();
    }, 3_000);
  };
  const acquire = async () => {
    if (disposed || acquiring) return;
    acquiring = true;
    let entry: PageDocumentEntry | null = null;
    try {
      entry = await services.acquire(input.user.id, input.pageId);
      if (disposed) {
        services.release(entry);
        return;
      }
      let preparedTicket: CollaborationTicket | null = null;
      if (!entry.hasPersistedState) {
        if (!services.online()) throw new Error("Page content is unavailable offline.");
        preparedTicket = await services.getTicket(input.pageId, controller.signal, true);
        if (disposed) {
          services.release(entry);
          return;
        }
        services.applyTicket(entry, preparedTicket);
        await entry.flush();
        if (entry.persistenceError) throw entry.persistenceError;
        await services.initialize(entry);
      }
      if (disposed) {
        services.release(entry);
        return;
      }
      const awareness = services.awareness(entry);
      entry.errorListeners.add(cacheError);
      startupAllowed = services.online() && !entry.persistenceError && !entry.blocked;
      publish({
        entry,
        document: entry.document,
        awareness,
        error: null,
        online: services.online(),
      });
      startupTimer = setTimeout(() => {
        startupAllowed = false;
        publish({});
      }, 20_000);
      startConnection(preparedTicket);
    } catch (reason) {
      if (entry && snapshot.entry !== entry) services.release(entry);
      if (!disposed) {
        if (services.isAccessDenied(reason)) publish({ status: "blocked", synced: false });
        fail(reason);
        scheduleRetry();
      }
    } finally {
      acquiring = false;
    }
  };
  const unsubscribeConnectivity = services.subscribeConnectivity(() => {
    const online = services.online();
    if (!online) {
      startupAllowed = false;
      cancelConnect?.();
      snapshot.provider?.disconnect();
      publish({ online, synced: false, status: "disconnected" });
    } else {
      publish({ online });
      if (snapshot.status === "blocked") return;
      if (snapshot.provider) connectProvider(snapshot.provider);
      else if (snapshot.entry) startConnection(null);
      else scheduleRetry();
    }
  });
  void acquire();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateUser(user: SessionUser) {
      if (disposed) return;
      snapshot.provider?.setAwarenessField("user", user);
      publish({ user });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++epoch;
      controller.abort();
      clearTimeout(startupTimer);
      clearTimeout(retryTimer);
      clearTimeout(verifyTimer);
      cancelConnect?.();
      stopConnection?.();
      unsubscribeConnectivity();
      snapshot.entry?.errorListeners.delete(cacheError);
      snapshot.awareness?.destroy();
      if (snapshot.entry) {
        snapshot.entry.transportOrigin = null;
        services.release(snapshot.entry);
      }
      listeners.clear();
    },
  };
}
export type PageDocumentSession = ReturnType<typeof createPageDocumentSession>;
