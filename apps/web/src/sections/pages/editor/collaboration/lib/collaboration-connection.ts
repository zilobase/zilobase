import { collaboratorColorIds } from "@/lib/color-tokens";
import type { CollaborationTicket } from "@zilobase/features/pages";

export type { CollaborationTicket } from "@zilobase/features/pages";

import { getHostedEditorAuthToken } from "@/platform/auth/hosted-editor-auth";
import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
  type StatesArray,
} from "@hocuspocus/provider";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

import { getDesktopAuthToken } from "@/platform/auth/desktop-auth-token";

const COLLABORATION_TICKET_REFRESH_BUFFER_MS = 75_000;
const COLLABORATION_WEBSOCKET_PROTOCOL = "zilobase.collaboration.v1";
const SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX = "zilobase.session.v1.";

export function applyTicketState(document: Y.Doc, ticket: CollaborationTicket) {
  if (ticket.initialState) {
    Y.applyUpdate(document, base64ToBytes(ticket.initialState), "page-bootstrap");
  }
}

export function connectCollaborationDocument(input: {
  autoConnect?: boolean;
  awareness?: Awareness;
  document: Y.Doc;
  onAuthenticationFailed?: (reason: string) => void;
  onClose?: () => void;
  onStatus?: (status: "connected" | "connecting" | "disconnected") => void;
  onUnsyncedChanges?: (count: number) => void;
  onUsers?: (states: Array<{ clientId: number; user?: unknown }>) => void;
  pageId: string;
  refreshTicket?: () => Promise<CollaborationTicket>;
  ticket: CollaborationTicket;
}) {
  let currentTicket = input.ticket;
  const provider = new HocuspocusProvider({
    autoConnect: input.autoConnect ?? true,
    awareness: input.awareness,
    WebSocketPolyfill: CollaborationWebSocket,
    document: input.document,
    name: input.ticket.documentName,
    token: async () => {
      if (
        new Date(currentTicket.expiresAt).getTime() >
        Date.now() + COLLABORATION_TICKET_REFRESH_BUFFER_MS
      ) {
        return currentTicket.token;
      }
      if (input.refreshTicket) {
        currentTicket = await input.refreshTicket();
      }
      return currentTicket.token;
    },
    url: input.ticket.websocketUrl,
    onAuthenticationFailed: ({ reason }) =>
      input.onAuthenticationFailed?.(reason || "Collaboration access was denied."),
    onClose: () => input.onClose?.(),
    onStatus: ({ status }) => input.onStatus?.(status),
    onUnsyncedChanges: ({ number }) => input.onUnsyncedChanges?.(number),
    onAwarenessUpdate: ({ states }) => input.onUsers?.(states),
  } as HocuspocusProviderConfiguration);

  return provider;
}

class CollaborationWebSocket extends WebSocket {
  constructor(url: string | URL) {
    const sessionToken = getHostedEditorAuthToken() ?? getDesktopAuthToken();

    if (sessionToken) {
      const encodedToken = bytesToBase64(new TextEncoder().encode(sessionToken))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      super(url, [
        COLLABORATION_WEBSOCKET_PROTOCOL,
        `${SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX}${encodedToken}`,
      ]);
      return;
    }

    super(url, COLLABORATION_WEBSOCKET_PROTOCOL);
  }
}

export function bytesToBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export type CollaborationUser = {
  avatar?: string | null;
  clientId: number;
  color: string;
  id: string;
  name: string;
};

export type CollaborationStatus = "local" | "connecting" | "connected" | "disconnected" | "blocked";

const collaboratorColorTokens = collaboratorColorIds.map(
  (id) => `--zb-color-palette-text-${id}` as const,
);

export function collaborationColor(userId: string) {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  const token =
    collaboratorColorTokens[Math.abs(hash) % collaboratorColorTokens.length] ??
    collaboratorColorTokens[0];

  if (typeof document !== "undefined") {
    const resolvedColor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();

    // y-prosemirror appends an alpha channel to this value when it renders a
    // remote selection, so its awareness payload must contain six-digit RGB.
    if (/^#[0-9a-f]{6}$/i.test(resolvedColor)) return resolvedColor;
  }

  return `var(${token})`;
}

// Production uses the collaboration connection owner and request runtime; tests control
// ticket completion, provider events and deferred startup through the same seam.
type ConnectionServices = {
  applyTicket: (document: Y.Doc, ticket: CollaborationTicket) => void;
  connect: typeof connectCollaborationDocument;
  getTicket: (pageId: string, signal?: AbortSignal) => Promise<CollaborationTicket>;
  isAccessDenied: (reason: unknown) => boolean;
  schedule: (start: () => void) => () => void;
};

type ConnectionState = {
  provider: (provider: HocuspocusProvider | null) => void;
  status: (status: CollaborationStatus) => void;
  error: (error: string | null) => void;
  synced: (synced: boolean) => void;
  unsyncedChanges: (count: number) => void;
  users: (users: CollaborationUser[]) => void;
};

export function startPageConnection({
  document,
  awareness,
  pageId,
  preparedTicket,
  user,
  state,
  services,
}: {
  document: Y.Doc;
  awareness?: Awareness;
  pageId: string;
  preparedTicket: CollaborationTicket | null;
  user: { avatar?: string | null; color: string; id: string; name: string };
  state: ConnectionState;
  services: ConnectionServices;
}) {
  let disposed = false;
  let denied = false;
  const controller = new AbortController();
  let activeProvider: HocuspocusProvider | null = null;
  state.status("connecting");
  state.error(null);

  const authenticationFailed = (reason: string) => {
    if (disposed) return;
    denied = true;
    state.status("blocked");
    state.error(reason);
  };
  const unsyncedChanges = (count: number) => {
    if (disposed) return;
    state.unsyncedChanges(count);
  };
  const synced = ({ state: ready }: { state: boolean }) => {
    if (disposed || !ready) return;
    state.synced(true);
  };
  const failed = (reason: unknown) => {
    if (disposed) return;
    const blocked = services.isAccessDenied(reason);
    state.status(blocked ? "blocked" : "disconnected");
    state.error(reason instanceof Error ? reason.message : "Could not start collaboration.");
  };
  const attach = (ticket: CollaborationTicket) => {
    if (disposed) return;
    services.applyTicket(document, ticket);
    activeProvider = services.connect({
      autoConnect: false,
      awareness,
      document,
      onAuthenticationFailed: authenticationFailed,
      // The server can close the document while leaving its WebSocket open.
      onClose: () => {
        if (disposed || denied) return;
        state.synced(false);
        state.status("disconnected");
      },
      onStatus: (next) => {
        if (disposed || denied) return;
        if (next !== "connected") state.synced(false);
        state.status(next);
      },
      onUnsyncedChanges: unsyncedChanges,
      onUsers: (states) => {
        if (!disposed) state.users(readCollaborationUsers(states));
      },
      pageId,
      refreshTicket: () => services.getTicket(pageId),
      ticket,
    });
    activeProvider.setAwarenessField("user", user);
    activeProvider.on("synced", synced);
    state.provider(activeProvider);
  };
  const cancelStart = services.schedule(() => {
    // Invoke the ticket port at the scheduled boundary, preserving synchronous throws.
    const ticket = preparedTicket
      ? Promise.resolve(preparedTicket)
      : services.getTicket(pageId, controller.signal);
    void (async () => {
      try {
        attach(await ticket);
      } catch (reason) {
        failed(reason);
      }
    })();
  });

  return () => {
    disposed = true;
    cancelStart();
    controller.abort();
    if (activeProvider) activeProvider.destroy();
    else awareness?.destroy();
    state.provider(null);
    state.synced(false);
    state.users([]);
  };
}

function readCollaborationUsers(states: StatesArray) {
  const users = new Map<string, CollaborationUser>();
  for (const state of states) {
    const user = state.user as Partial<CollaborationUser> | undefined;
    if (
      !user ||
      typeof user.id !== "string" ||
      typeof user.name !== "string" ||
      typeof user.color !== "string"
    )
      continue;
    users.set(user.id, {
      avatar: user.avatar,
      clientId: state.clientId,
      color: user.color,
      id: user.id,
      name: user.name,
    });
  }
  return [...users.values()];
}
