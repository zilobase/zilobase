import type { QueryClient } from "@tanstack/react-query"
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"

import { useNotelabFeatures, type ApiFetcher } from "../context"
import {
  applyDatabaseMutationToPageProperties,
  recoverPagePropertiesIfBehind,
} from "../pages/database-realtime-cache"
import { applyVersionedDatabaseMutation } from "./mutation-cache"
import type { DatabaseMutationResponse } from "./mutation-types"
import {
  databasePayloadRootQueryKey,
  databaseQueryKey,
  type DatabasePayload,
} from "./queries"

export type DatabasePresence = {
  columnKey: string
  rowId: string
  viewId: string | null
}

export type DatabasePresenceCollaborator = {
  color: string
  connectedAt: string
  presence: DatabasePresence
  sessionId: string
  updatedAt: string
  user: {
    email?: string | null
    id: string
    image?: string | null
    name: string
  }
}

type DatabaseRealtimeTicket = {
  databaseId: string
  expiresAt: string
  sessionId: string
  token: string
  version: number
  websocketProtocols: string[]
  websocketUrl: string
}

type DatabaseRealtimeState = {
  cellPresenceByKey: Record<string, DatabasePresenceCollaborator[]>
  collaborators: DatabasePresenceCollaborator[]
  status: "connected" | "connecting" | "disconnected" | "offline"
}

type DatabaseMutationEvent = DatabaseMutationResponse & {
  actorId: string
  protocolVersion: 1
  type: "database.mutation"
}

type Listener = () => void

const managers = new WeakMap<
  QueryClient,
  Map<string, DatabaseRealtimeManager>
>()

export function useDatabaseRealtime(
  databaseId: string | null | undefined,
  options: {
    enabled?: boolean
    presence?: DatabasePresence | null
    publishPresence?: boolean
  } = {},
) {
  const { apiFetch, databaseRealtimeEnabled = false, queryClient } =
    useNotelabFeatures()
  const ownerIdRef = useRef<string>(crypto.randomUUID())
  const enabled = Boolean(
    databaseRealtimeEnabled && options.enabled !== false && databaseId,
  )
  const manager = useMemo(
    () => enabled && databaseId
      ? getManager(queryClient, apiFetch, databaseId)
      : null,
    [apiFetch, databaseId, enabled, queryClient],
  )
  const state = useSyncExternalStore(
    manager ? manager.subscribe : emptySubscribe,
    manager ? manager.getSnapshot : getOfflineSnapshot,
    getOfflineSnapshot,
  )
  const publishPresence = options.publishPresence === true
  const presenceRowId = options.presence?.rowId ?? null
  const presenceColumnKey = options.presence?.columnKey ?? null
  const presenceViewId = options.presence?.viewId ?? null

  useEffect(() => {
    if (!manager) return

    return () => manager.setPresence(ownerIdRef.current, null)
  }, [manager])

  useEffect(() => {
    if (!manager) return

    manager.setPresence(
      ownerIdRef.current,
      publishPresence && presenceRowId && presenceColumnKey
        ? {
            columnKey: presenceColumnKey,
            rowId: presenceRowId,
            viewId: presenceViewId,
          }
        : null,
    )
  }, [
    manager,
    presenceColumnKey,
    presenceRowId,
    presenceViewId,
    publishPresence,
  ])

  return state
}

export function applyDatabaseRealtimeMutation(
  queryClient: QueryClient,
  event: DatabaseMutationEvent,
) {
  const result = applyVersionedDatabaseMutation(queryClient, event)
  applyDatabaseMutationToPageProperties(queryClient, event)
  return result
}

export function createCellPresenceByKey(
  collaborators: DatabasePresenceCollaborator[],
) {
  const result: Record<string, DatabasePresenceCollaborator[]> = {}

  for (const collaborator of collaborators) {
    const key = `${collaborator.presence.rowId}:${collaborator.presence.columnKey}`
    const existing = result[key] ?? []

    if (existing.some((item) => item.user.id === collaborator.user.id)) {
      continue
    }

    result[key] = [...existing, collaborator]
  }

  return result
}

class DatabaseRealtimeManager {
  private readonly listeners = new Set<Listener>()
  private readonly presenceByOwner = new Map<string, DatabasePresence>()
  private socket: WebSocket | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private visibilityTimer: ReturnType<typeof setTimeout> | null = null
  private connectionGeneration = 0
  private connecting = false
  private lifecycleListening = false
  private paused = false
  private reconnectAttempt = 0
  private stopped = true
  private sessionId: string | null = null
  private state: DatabaseRealtimeState = getOfflineSnapshot()

  constructor(
    private readonly queryClient: QueryClient,
    private readonly apiFetch: ApiFetcher,
    private readonly databaseId: string,
    private readonly onIdle: () => void,
  ) {}

  subscribe = (listener: Listener) => {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.listeners.add(listener)

    if (this.listeners.size === 1) {
      if (this.stopped) {
        this.stopped = false
        this.startLifecycleListeners()
        this.handleLifecycleChange()
      }
    }

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.scheduleStop()
    }
  }

  getSnapshot = () => this.state

  setPresence(ownerId: string, presence: DatabasePresence | null) {
    const previous = this.presenceByOwner.get(ownerId) ?? null

    if (samePresence(previous, presence)) return

    this.presenceByOwner.delete(ownerId)
    if (presence) this.presenceByOwner.set(ownerId, presence)
    this.sendPresence()
  }

  private async connect() {
    if (
      this.stopped ||
      this.paused ||
      !isBrowserOnline() ||
      this.connecting ||
      typeof WebSocket === "undefined" ||
      this.socket?.readyState === WebSocket.CONNECTING ||
      this.socket?.readyState === WebSocket.OPEN
    ) return

    const generation = this.connectionGeneration
    this.connecting = true

    this.setState({ ...this.state, status: "connecting" })

    try {
      const ticket = await this.fetchTicket()
      if (this.stopped || generation !== this.connectionGeneration) return

      const socket = new WebSocket(
        ticket.websocketUrl,
        ticket.websocketProtocols,
      )
      socketToken.set(socket, ticket.token)
      this.socket = socket

      socket.addEventListener("message", (message) => {
        if (this.socket !== socket) return
        this.handleMessage(message.data)
      })
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return
        this.socket = null
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.refreshTimer = null
        if (!this.stopped && generation === this.connectionGeneration) {
          this.scheduleReconnect()
        }
      })
      socket.addEventListener("error", () => socket.close())
      this.scheduleTicketRefresh(ticket, socket, generation)
      this.recoverIfBehind(ticket.version)
    } catch {
      if (!this.stopped && generation === this.connectionGeneration) {
        this.scheduleReconnect()
      }
    } finally {
      if (generation === this.connectionGeneration) {
        this.connecting = false
      }
    }
  }

  private async fetchTicket(refreshToken?: string) {
    return this.apiFetch<DatabaseRealtimeTicket>(
      `/databases/${encodeURIComponent(this.databaseId)}/realtime-ticket`,
      {
        body: JSON.stringify(refreshToken ? { token: refreshToken } : {}),
        method: "POST",
      },
    )
  }

  private handleMessage(data: unknown) {
    const message = parseMessage(data)

    if (!message || message.databaseId !== this.databaseId) return

    if (message.type === "database.mutation") {
      applyDatabaseRealtimeMutation(this.queryClient, message)
      return
    }

    if (message.type === "realtime.ready") {
      this.sessionId = message.sessionId
      this.reconnectAttempt = 0
      if (typeof message.version === "number") {
        this.recoverIfBehind(message.version)
      }
      this.setCollaborators(message.peers)
      this.setState({ ...this.state, status: "connected" })
      this.sendPresence()
      return
    }

    if (message.type === "presence.update") {
      const collaborator = withColor(message.collaborator)
      this.setCollaborators([
        ...this.state.collaborators.filter(
          (item) => item.sessionId !== collaborator.sessionId,
        ),
        collaborator,
      ])
      return
    }

    if (message.type === "presence.clear") {
      this.setCollaborators(
        this.state.collaborators.filter(
          (item) => item.sessionId !== message.sessionId,
        ),
      )
    }
  }

  private scheduleTicketRefresh(
    ticket: DatabaseRealtimeTicket,
    socket: WebSocket,
    generation: number,
  ) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    const delay = Math.max(
      10_000,
      new Date(ticket.expiresAt).getTime() - Date.now() - 5 * 60_000,
    )

    this.refreshTimer = setTimeout(() => {
      void this.refreshTicket(socket, generation)
    }, delay)
  }

  private async refreshTicket(socket: WebSocket, generation: number) {
    try {
      const ticket = await this.fetchTicket(ticketTokenFor(socket))
      if (
        this.stopped ||
        generation !== this.connectionGeneration ||
        this.socket !== socket ||
        socket.readyState !== WebSocket.OPEN
      ) return
      socket.send(JSON.stringify({
        type: "auth.refresh",
        token: ticket.token,
      }))
      socketToken.set(socket, ticket.token)
      this.scheduleTicketRefresh(ticket, socket, generation)
    } catch {
      if (this.socket === socket) socket.close()
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.paused || this.reconnectTimer) return

    if (!isBrowserOnline()) {
      this.pause()
      return
    }

    this.setState({
      ...this.state,
      collaborators: [],
      cellPresenceByKey: {},
      status: "disconnected",
    })
    const delay = reconnectDelay(this.reconnectAttempt)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private recoverIfBehind(serverVersion: number) {
    const payload = this.queryClient.getQueryData<DatabasePayload | null>(
      databaseQueryKey(this.databaseId),
    )

    if (!payload || (payload.database.version ?? 0) < serverVersion) {
      void this.queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(this.databaseId),
      })
    }

    recoverPagePropertiesIfBehind(
      this.queryClient,
      this.databaseId,
      serverVersion,
    )
  }

  private sendPresence() {
    if (this.socket?.readyState !== WebSocket.OPEN ||
      this.state.status !== "connected") return
    const values = [...this.presenceByOwner.values()]
    this.socket.send(JSON.stringify({
      presence: values.at(-1) ?? null,
      type: "presence.update",
    }))
  }

  private setCollaborators(
    collaborators: Array<
      Omit<DatabasePresenceCollaborator, "color"> |
      DatabasePresenceCollaborator
    >,
  ) {
    const colored = collaborators
      .filter((item) => item.sessionId !== this.sessionId)
      .map(withColor)
    this.setState({
      ...this.state,
      cellPresenceByKey: createCellPresenceByKey(colored),
      collaborators: colored,
    })
  }

  private setState(state: DatabaseRealtimeState) {
    this.state = state
    for (const listener of this.listeners) listener()
  }

  private scheduleStop() {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    // React Strict Mode briefly unsubscribes and resubscribes external stores.
    // A short grace period avoids tearing down a healthy socket in between.
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.listeners.size === 0) this.stop()
    }, 250)
  }

  private stop() {
    this.stopped = true
    this.connectionGeneration += 1
    this.connecting = false
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.visibilityTimer) clearTimeout(this.visibilityTimer)
    this.reconnectTimer = null
    this.refreshTimer = null
    this.visibilityTimer = null
    this.socket?.close(1000, "Database view closed")
    this.socket = null
    this.sessionId = null
    this.presenceByOwner.clear()
    this.paused = false
    this.stopLifecycleListeners()
    this.setState(getOfflineSnapshot())
    this.idleTimer = setTimeout(this.onIdle, 60_000)
  }

  private readonly handleOnline = () => this.handleLifecycleChange()
  private readonly handleOffline = () => this.pause()
  private readonly handleVisibility = () => this.handleLifecycleChange()

  private startLifecycleListeners() {
    if (this.lifecycleListening || typeof window === "undefined") return
    window.addEventListener("online", this.handleOnline)
    window.addEventListener("offline", this.handleOffline)
    document.addEventListener("visibilitychange", this.handleVisibility)
    this.lifecycleListening = true
  }

  private stopLifecycleListeners() {
    if (!this.lifecycleListening || typeof window === "undefined") return
    window.removeEventListener("online", this.handleOnline)
    window.removeEventListener("offline", this.handleOffline)
    document.removeEventListener("visibilitychange", this.handleVisibility)
    this.lifecycleListening = false
  }

  private handleLifecycleChange() {
    if (!isBrowserOnline()) {
      this.pause()
      return
    }

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      if (!this.visibilityTimer) {
        this.visibilityTimer = setTimeout(() => {
          this.visibilityTimer = null
          if (document.visibilityState === "hidden") this.pause()
        }, 60_000)
      }
      if (!this.paused) void this.connect()
      return
    }

    if (this.visibilityTimer) clearTimeout(this.visibilityTimer)
    this.visibilityTimer = null
    this.resume()
  }

  private pause() {
    if (this.stopped || this.paused) return
    this.paused = true
    this.connectionGeneration += 1
    this.connecting = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.reconnectTimer = null
    this.refreshTimer = null
    this.socket?.close(1000, "Database realtime paused")
    this.socket = null
    this.sessionId = null
    this.setState(getOfflineSnapshot())
  }

  private resume() {
    if (this.stopped || this.listeners.size === 0 || !isBrowserOnline()) return
    if (this.visibilityTimer) clearTimeout(this.visibilityTimer)
    this.visibilityTimer = null
    this.paused = false
    void this.connect()
  }
}

const socketToken = new WeakMap<WebSocket, string>()

function ticketTokenFor(socket: WebSocket) {
  const token = socketToken.get(socket)

  if (!token) throw new Error("Missing database realtime refresh token")
  return token
}

export function reconnectDelay(
  attempt: number,
  random: () => number = Math.random,
) {
  const maximum = Math.min(30_000, 500 * 2 ** Math.max(attempt, 0))
  return Math.floor(random() * maximum)
}

function isBrowserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false
}

export function samePresence(
  left: DatabasePresence | null,
  right: DatabasePresence | null,
) {
  return left === right || Boolean(
    left &&
    right &&
    left.rowId === right.rowId &&
    left.columnKey === right.columnKey &&
    left.viewId === right.viewId,
  )
}

function getManager(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  databaseId: string,
) {
  let byDatabase = managers.get(queryClient)

  if (!byDatabase) {
    byDatabase = new Map()
    managers.set(queryClient, byDatabase)
  }

  let manager = byDatabase.get(databaseId)

  if (!manager) {
    const created = new DatabaseRealtimeManager(
      queryClient,
      apiFetch,
      databaseId,
      () => {
        if (byDatabase?.get(databaseId) === created) {
          byDatabase.delete(databaseId)
        }
      },
    )
    manager = created
    byDatabase.set(databaseId, manager)
  }

  return manager
}

function parseMessage(data: unknown): RealtimeServerMessage | null {
  if (typeof data !== "string") return null

  try {
    const value = JSON.parse(data) as unknown
    if (!value || typeof value !== "object") return null
    const message = value as Record<string, unknown>

    if (message.type === "database.mutation" &&
      message.protocolVersion === 1 &&
      typeof message.databaseId === "string" &&
      typeof message.version === "number" &&
      typeof message.mutationId === "string" &&
      Array.isArray(message.changed) &&
      message.delta && typeof message.delta === "object") {
      return message as DatabaseMutationEvent
    }

    if (message.type === "realtime.ready" &&
      typeof message.databaseId === "string" &&
      typeof message.sessionId === "string" &&
      Array.isArray(message.peers)) {
      return message as RealtimeReadyMessage
    }

    if (message.type === "presence.update" &&
      typeof message.databaseId === "string" &&
      message.collaborator && typeof message.collaborator === "object") {
      return message as PresenceUpdateMessage
    }

    if (message.type === "presence.clear" &&
      typeof message.databaseId === "string" &&
      typeof message.sessionId === "string") {
      return message as PresenceClearMessage
    }

    return null
  } catch {
    return null
  }
}

type RealtimeReadyMessage = {
  databaseId: string
  peers: Array<Omit<DatabasePresenceCollaborator, "color">>
  sessionId: string
  type: "realtime.ready"
  version?: number
}
type PresenceUpdateMessage = {
  collaborator: Omit<DatabasePresenceCollaborator, "color">
  databaseId: string
  type: "presence.update"
}
type PresenceClearMessage = {
  databaseId: string
  sessionId: string
  type: "presence.clear"
}
type RealtimeServerMessage = DatabaseMutationEvent | RealtimeReadyMessage |
  PresenceUpdateMessage | PresenceClearMessage

function withColor<T extends Omit<DatabasePresenceCollaborator, "color">>(
  collaborator: T,
): DatabasePresenceCollaborator {
  return { ...collaborator, color: stableColor(collaborator.user.id) }
}

function stableColor(value: string) {
  const colors = [
    "#2563eb", "#059669", "#dc2626", "#7c3aed",
    "#c2410c", "#0f766e", "#be185d", "#4f46e5",
  ]
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return colors[hash % colors.length]
}

const OFFLINE_STATE: DatabaseRealtimeState = {
  cellPresenceByKey: {},
  collaborators: [],
  status: "offline",
}
function getOfflineSnapshot() {
  return OFFLINE_STATE
}
function emptySubscribe() {
  return () => undefined
}
