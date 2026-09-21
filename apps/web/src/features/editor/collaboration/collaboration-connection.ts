import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
} from "@hocuspocus/provider"
import * as Y from "yjs"

import { getDesktopAuthToken } from "@/platform/auth/desktop-auth-token"

const COLLABORATION_TICKET_REFRESH_BUFFER_MS = 75_000
const COLLABORATION_WEBSOCKET_PROTOCOL = "zilobase.collaboration.v1"
const SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX = "zilobase.session.v1."

export type CollaborationTicket = {
  documentName: string
  expiresAt: string
  initialState?: string
  token: string
  websocketUrl: string
}

export function applyTicketState(document: Y.Doc, ticket: CollaborationTicket) {
  if (ticket.initialState) {
    Y.applyUpdate(document, base64ToBytes(ticket.initialState))
  }
}

export function connectCollaborationDocument(input: {
  autoConnect?: boolean
  document: Y.Doc
  onAuthenticationFailed?: (reason: string) => void
  onStatus?: (status: "connected" | "connecting" | "disconnected") => void
  onUnsyncedChanges?: (count: number) => void
  onUsers?: (states: Array<{ clientId: number; user?: unknown }>) => void
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
      const encodedToken = bytesToBase64(new TextEncoder().encode(sessionToken))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")
      super(url, [
        COLLABORATION_WEBSOCKET_PROTOCOL,
        `${SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX}${encodedToken}`,
      ])
      return
    }

    super(url, COLLABORATION_WEBSOCKET_PROTOCOL)
  }
}

export function bytesToBase64(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

export function base64ToBytes(value: string) {
  const binary = window.atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
