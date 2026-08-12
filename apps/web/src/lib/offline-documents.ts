import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
  type StatesArray,
} from "@hocuspocus/provider"
import { IndexeddbPersistence, storeState } from "y-indexeddb"
import * as Y from "yjs"

import {
  base64ToBytes,
  bytesToBase64,
  offlineDocumentName,
  patchOfflineItem,
} from "@/lib/offline-store"
import { getDesktopAuthToken } from "@/lib/desktop-auth-token"

const COLLABORATION_TICKET_REFRESH_BUFFER_MS = 75_000
const COLLABORATION_WEBSOCKET_PROTOCOL = "zilobase.collaboration.v1"
const SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX = "zilobase.session.v1."

export type CollaborationTicket = {
  documentName: string
  expiresAt: string
  initialState: string
  token: string
  websocketUrl: string
}

export type LocalPageDocument = {
  document: Y.Doc
  persistence: IndexeddbPersistence
}

export async function openLocalPageDocument(
  workspaceId: string,
  pageId: string,
): Promise<LocalPageDocument> {
  const document = new Y.Doc()
  const persistence = new IndexeddbPersistence(
    offlineDocumentName(workspaceId, pageId),
    document,
  )

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Local page storage did not become ready.")),
        10_000,
      )
      persistence.once("synced", () => {
        window.clearTimeout(timeout)
        resolve()
      })
    })
  } catch (error) {
    await persistence.destroy()
    document.destroy()
    throw error
  }

  return { document, persistence }
}

export function flushLocalPageDocument(local: LocalPageDocument) {
  return storeState(local.persistence)
}

export function applyTicketState(document: Y.Doc, ticket: CollaborationTicket) {
  Y.applyUpdate(document, base64ToBytes(ticket.initialState))
}

export function connectLocalPageDocument(input: {
  autoConnect?: boolean
  document: Y.Doc
  onAuthenticationFailed?: (reason: string) => void
  onStatus?: (status: "connected" | "connecting" | "disconnected") => void
  onUnsyncedChanges?: (count: number) => void
  onUsers?: (states: StatesArray) => void
  pageId: string
  refreshTicket?: () => Promise<CollaborationTicket>
  ticket: CollaborationTicket
}) {
  let currentTicket = input.ticket
  const provider = new HocuspocusProvider({
    autoConnect: input.autoConnect ?? true,
    WebSocketPolyfill: CollaborationWebSocket,
    document: input.document,
    name: input.ticket.documentName,
    token: async () => {
      if (
        new Date(currentTicket.expiresAt).getTime() >
          Date.now() + COLLABORATION_TICKET_REFRESH_BUFFER_MS
      ) {
        return currentTicket.token
      }
      if (input.refreshTicket) {
        currentTicket = await input.refreshTicket()
      }
      return currentTicket.token
    },
    url: input.ticket.websocketUrl,
    onAuthenticationFailed: ({ reason }) =>
      input.onAuthenticationFailed?.(reason || "Collaboration access was denied."),
    onStatus: ({ status }) => input.onStatus?.(status),
    onUnsyncedChanges: ({ number }) => input.onUnsyncedChanges?.(number),
    onAwarenessUpdate: ({ states }) => input.onUsers?.(states),
  } as HocuspocusProviderConfiguration)

  return provider
}

class CollaborationWebSocket extends WebSocket {
  constructor(url: string | URL) {
    const sessionToken = getDesktopAuthToken()

    if (sessionToken) {
      const encodedToken = bytesToBase64(
        new TextEncoder().encode(sessionToken),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")
      super(
        url,
        [
          COLLABORATION_WEBSOCKET_PROTOCOL,
          `${SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX}${encodedToken}`,
        ],
      )
      return
    }

    super(url)
  }
}

export async function waitForProviderSync(
  provider: HocuspocusProvider,
  timeoutMs = 15_000,
) {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error("Page synchronization timed out."))
    }, timeoutMs)

    const check = () => {
      if (!provider.synced || provider.hasUnsyncedChanges) return
      cleanup()
      resolve()
    }
    const fail = ({ reason }: { reason: string }) => {
      cleanup()
      reject(new Error(reason || "Collaboration access was denied."))
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      provider.off("synced", check)
      provider.off("unsyncedChanges", check)
      provider.off("authenticationFailed", fail)
    }

    provider.on("synced", check)
    provider.on("unsyncedChanges", check)
    provider.on("authenticationFailed", fail)
    check()
  })
}

export async function recordConfirmedDocument(pageId: string, document: Y.Doc) {
  await patchOfflineItem("page", pageId, {
    blocked: false,
    confirmedStateVector: bytesToBase64(Y.encodeStateVector(document)),
    dirty: false,
    lastSyncedAt: new Date().toISOString(),
  })
}

export function documentDiffersFromConfirmed(
  document: Y.Doc,
  confirmedStateVector?: string,
) {
  if (!confirmedStateVector) return true
  return Y.encodeStateAsUpdate(
    document,
    base64ToBytes(confirmedStateVector),
  ).byteLength > 2
}

export function shouldMarkOfflineDocumentDirty(
  transaction: Pick<Y.Transaction, "local">,
) {
  return transaction.local
}
