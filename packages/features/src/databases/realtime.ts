import type { QueryClient } from "@tanstack/react-query"
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"

import { useZilobaseFeatures, type ApiFetcher } from "../shared/context"
import {
  applyDataSourceMutationToPageProperties,
  recoverPagePropertiesIfSourceBehind,
} from "../pages/database-realtime-cache"
import {
  dataSourceMutationEventV3Schema,
  type DataSourceMutationEventV3,
} from "./contracts-v2"
import {
  useOptionalDatabaseClient,
} from "./client/provider"
import type { DatabaseClient } from "./client/database-client"
import { createRealtimeClientBinding } from "./client/realtime-client-binding"

export type DatabasePresence = {
  columnKey: string
  rowId: string
  viewId: string | null
}

export type DatabasePresenceCollaborator = {
  color: string
  connectedAt: string
  presence: DatabasePresence
  revision: number
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
  expiresAt: string
  sessionId: string
  sourceId: string
  sourceVersion: number
  token: string
  websocketProtocols: string[]
  websocketUrl: string
}

type DatabaseRealtimeState = {
  cellPresenceByKey: Record<string, DatabasePresenceCollaborator[]>
  collaborators: DatabasePresenceCollaborator[]
  status: "connected" | "connecting" | "disconnected" | "offline" | "unavailable"
}

type Listener = () => void

const managers = new WeakMap<
  QueryClient,
  Map<string, DatabaseRealtimeManager>
>()

export function useDatabaseRealtime(
  sourceId: string | null | undefined,
  options: {
    enabled?: boolean
    presence?: DatabasePresence | null
    publishPresence?: boolean
  } = {},
) {
  const { apiFetch, databaseRealtimeEnabled = false, queryClient } =
    useZilobaseFeatures()
  const databaseClient = useOptionalDatabaseClient()
  const ownerIdRef = useRef<string>(crypto.randomUUID())
  const enabled = Boolean(
    databaseRealtimeEnabled && options.enabled !== false && sourceId,
  )
  const manager = useMemo(
    () => enabled && sourceId
      ? getManager(queryClient, apiFetch, sourceId, databaseClient)
      : null,
    [apiFetch, databaseClient, enabled, queryClient, sourceId],
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

export function createCellPresenceByKey(
  collaborators: DatabasePresenceCollaborator[],
) {
  const result: Record<string, DatabasePresenceCollaborator[]> = {}

  for (const collaborator of collaborators) {
    const key = `${collaborator.presence.rowId}:${collaborator.presence.columnKey}`
    const existing = result[key] ?? []

    if (existing.some((item) => item.sessionId === collaborator.sessionId)) {
      continue
    }

    result[key] = [...existing, collaborator]
  }

  return result
}

export const DATABASE_REALTIME_HEARTBEAT_MS = 20_000
export const DATABASE_REALTIME_PING = { type: "realtime.ping" } as const

class DatabaseRealtimeManager {
  private readonly listeners = new Set<Listener>()
  private readonly presenceByOwner = new Map<
    string,
    { activation: number; presence: DatabasePresence }
  >()
  private socket: WebSocket | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private visibilityTimer: ReturnType<typeof setTimeout> | null = null
  private connectionGeneration = 0
  private connecting = false
  private terminal = false
  private lifecycleListening = false
  private paused = false
  private reconnectAttempt = 0
  private presenceActivation = 0
  private presenceRevision = 0
  private lastSentPresence: DatabasePresence | null = null
  private stopped = true
  private sessionId: string | null = null
  private state: DatabaseRealtimeState = getOfflineSnapshot()
  private readonly databaseClientBinding

  constructor(
    private readonly queryClient: QueryClient,
    private readonly apiFetch: ApiFetcher,
    private readonly sourceId: string,
    databaseClient: DatabaseClient | null,
    private readonly onIdle: () => void,
  ) {
    this.databaseClientBinding = createRealtimeClientBinding(databaseClient)
  }

  bindDatabaseClient(databaseClient: DatabaseClient | null) {
    this.databaseClientBinding.bind(databaseClient)
  }

  subscribe = (listener: Listener) => {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.listeners.add(listener)

    if (this.listeners.size === 1) {
      if (this.stopped && !this.terminal) {
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
    const previous = this.presenceByOwner.get(ownerId)?.presence ?? null

    if (samePresence(previous, presence)) return

    this.presenceByOwner.delete(ownerId)
    if (presence) {
      this.presenceActivation += 1
      this.presenceByOwner.set(ownerId, {
        activation: this.presenceActivation,
        presence,
      })
    }
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
      this.reconnectAttempt = 0

      const socket = new WebSocket(
        ticket.websocketUrl,
        ticket.websocketProtocols,
      )
      socketToken.set(socket, ticket.token)
      this.socket = socket

      socket.addEventListener("message", (message) => {
        if (this.socket !== socket) return
        this.handleMessage(message.data, socket)
      })
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return
        this.socket = null
        this.stopHeartbeat()
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.refreshTimer = null
        if (!this.stopped && generation === this.connectionGeneration) {
          this.scheduleReconnect()
        }
      })
      this.scheduleTicketRefresh(ticket, socket, generation)
      this.recoverSource(ticket.sourceVersion)
    } catch (error) {
      if (ticketFailureAction(error) === "stop") {
        this.markUnavailable()
      } else if (!this.stopped && generation === this.connectionGeneration) {
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
      `/data-sources/${encodeURIComponent(this.sourceId)}/realtime-ticket`,
      {
        body: JSON.stringify(refreshToken ? { token: refreshToken } : {}),
        method: "POST",
      },
    )
  }

  private handleMessage(data: unknown, socket: WebSocket) {
    const parsed = parseDatabaseRealtimeServerMessage(data)

    if (!parsed.ok) {
      if (parsed.reason === "protocol_mismatch") {
        console.warn(JSON.stringify({
          sourceId: this.sourceId,
          event: "database_realtime_protocol_mismatch",
          expectedProtocolVersion: 3,
        }))
        closeRealtimeSocket(socket, 1012, "Database realtime protocol changed")
      }
      return
    }
    const message = parsed.message

    if (message.sourceId !== this.sourceId) return

    if (message.type === "database.mutation") {
      void this.ingestMutation(message).catch(() => undefined)
      return
    }

    if (message.type === "realtime.ready") {
      this.sessionId = message.sessionId
      this.reconnectAttempt = 0
      this.recoverSource(message.sourceVersion)
      this.setCollaborators(message.peers)
      this.setState({ ...this.state, status: "connected" })
      this.startHeartbeat()
      this.sendPresence(true)
      return
    }

    if (message.type === "presence.update") {
      const collaborator = withColor(message.collaborator)
      const current = this.state.collaborators.find(
        (item) => item.sessionId === collaborator.sessionId,
      )
      if (current && !isNewerCollaborator(collaborator, current)) return
      this.setCollaborators([
        ...this.state.collaborators.filter(
          (item) => item.sessionId !== collaborator.sessionId,
        ),
        collaborator,
      ])
      return
    }

    if (message.type === "presence.clear") {
      const current = this.state.collaborators.find(
        (item) => item.sessionId === message.sessionId,
      )
      if (current && current.revision > message.revision) return
      this.setCollaborators(
        this.state.collaborators.filter(
          (item) => item.sessionId !== message.sessionId,
        ),
      )
    }
  }

  private async ingestMutation(event: DataSourceMutationEventV3) {
    applyDataSourceMutationToPageProperties(this.queryClient, event)
    try {
      if (await this.databaseClientBinding.ingest(event)) return
    } catch {
      // A replaced session client recovers from the source feed below.
    }
    await this.catchUpSource()
  }

  private async catchUpSource() {
    try {
      await this.databaseClientBinding.catchUp(this.sourceId)
    } catch {
      // The next ready/mutation/reconnect retries the authoritative source feed.
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

  private recoverSource(serverVersion?: number) {
    void this.catchUpSource()
    if (serverVersion !== undefined) {
      recoverPagePropertiesIfSourceBehind(
        this.queryClient,
        this.sourceId,
        serverVersion,
      )
    }
  }

  private sendPresence(force = false) {
    if (this.socket?.readyState !== WebSocket.OPEN ||
      this.state.status !== "connected") return
    const selected = selectActivePresence(this.presenceByOwner.values())
    if (selected === null && this.lastSentPresence === null) return
    if (!force && samePresence(this.lastSentPresence, selected)) return
    this.presenceRevision += 1
    this.lastSentPresence = selected
    this.socket.send(JSON.stringify({
      presence: selected,
      revision: this.presenceRevision,
      type: "presence.update",
    }))
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (
        this.socket?.readyState !== WebSocket.OPEN ||
        this.state.status !== "connected"
      ) return
      this.socket.send(JSON.stringify(DATABASE_REALTIME_PING))
    }, DATABASE_REALTIME_HEARTBEAT_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
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
    }, 4_000)
  }

  private stop() {
    this.stopped = true
    this.connectionGeneration += 1
    this.connecting = false
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.visibilityTimer) clearTimeout(this.visibilityTimer)
    this.stopHeartbeat()
    this.reconnectTimer = null
    this.refreshTimer = null
    this.visibilityTimer = null
    closeRealtimeSocket(this.socket, 1000, "Database view closed")
    this.socket = null
    this.sessionId = null
    this.lastSentPresence = null
    this.presenceByOwner.clear()
    this.paused = false
    this.stopLifecycleListeners()
    this.setState(this.terminal ? getUnavailableSnapshot() : getOfflineSnapshot())
    this.idleTimer = setTimeout(this.onIdle, 60_000)
  }

  private markUnavailable() {
    this.terminal = true
    this.stopped = true
    this.connectionGeneration += 1
    this.connecting = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.visibilityTimer) clearTimeout(this.visibilityTimer)
    this.stopHeartbeat()
    this.reconnectTimer = null
    this.refreshTimer = null
    this.visibilityTimer = null
    closeRealtimeSocket(this.socket, 1000, "Database realtime unavailable")
    this.socket = null
    this.sessionId = null
    this.lastSentPresence = null
    this.stopLifecycleListeners()
    this.setState(getUnavailableSnapshot())
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
    this.stopHeartbeat()
    this.reconnectTimer = null
    this.refreshTimer = null
    closeRealtimeSocket(this.socket, 1000, "Database realtime paused")
    this.socket = null
    this.sessionId = null
    this.lastSentPresence = null
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

const WEB_SOCKET_CONNECTING = 0
const WEB_SOCKET_OPEN = 1

export function closeRealtimeSocket(
  socket: WebSocket | null,
  code: number,
  reason: string,
) {
  if (!socket) return

  if (socket.readyState === WEB_SOCKET_CONNECTING) {
    const closeWhenOpen = () => socket.close(code, reason)
    socket.addEventListener("open", closeWhenOpen, { once: true })
    socket.addEventListener("error", () => {
      socket.removeEventListener("open", closeWhenOpen)
    }, { once: true })
    return
  }

  if (socket.readyState === WEB_SOCKET_OPEN) {
    socket.close(code, reason)
  }
}

export function reconnectDelay(
  attempt: number,
  random: () => number = Math.random,
) {
  const maximum = Math.min(30_000, 500 * 2 ** Math.max(attempt, 0))
  return Math.floor(random() * maximum)
}

export function ticketFailureAction(error: unknown): "retry" | "stop" {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return "retry"
  }

  const status = (error as { status?: unknown }).status
  return status === 401 || status === 403 || status === 404 ? "stop" : "retry"
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

export function selectActivePresence(
  entries: Iterable<{ activation: number; presence: DatabasePresence }>,
) {
  let selected: { activation: number; presence: DatabasePresence } | null = null
  for (const entry of entries) {
    if (!selected || entry.activation > selected.activation) selected = entry
  }
  return selected?.presence ?? null
}

function getManager(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  sourceId: string,
  databaseClient: DatabaseClient | null,
) {
  let bySource = managers.get(queryClient)

  if (!bySource) {
    bySource = new Map()
    managers.set(queryClient, bySource)
  }

  const managerKey = `${databaseClient?.sessionId ?? "public"}:${sourceId}`
  let manager = bySource.get(managerKey)

  if (!manager) {
    const created = new DatabaseRealtimeManager(
      queryClient,
      apiFetch,
      sourceId,
      databaseClient,
      () => {
        if (bySource?.get(managerKey) === created) {
          bySource.delete(managerKey)
        }
      },
    )
    manager = created
    bySource.set(managerKey, manager)
  }

  manager.bindDatabaseClient(databaseClient)

  return manager
}

export type DatabaseRealtimeServerMessageParseResult =
  | { message: RealtimeServerMessage; ok: true }
  | { ok: false; reason: "invalid" | "protocol_mismatch" }

export function parseDatabaseRealtimeServerMessage(
  data: unknown,
): DatabaseRealtimeServerMessageParseResult {
  if (typeof data !== "string") return { ok: false, reason: "invalid" }

  try {
    const value = JSON.parse(data) as unknown
    if (!value || typeof value !== "object") {
      return { ok: false, reason: "invalid" }
    }
    const message = value as Record<string, unknown>
    const isKnownServerMessage = message.type === "database.mutation" ||
      message.type === "realtime.ready" ||
      message.type === "presence.update" ||
      message.type === "presence.clear"

    if (isKnownServerMessage && message.protocolVersion !== 3) {
      return { ok: false, reason: "protocol_mismatch" }
    }

    if (message.type === "database.mutation") {
      const parsed = dataSourceMutationEventV3Schema.safeParse(value)
      return parsed.success
        ? { message: parsed.data, ok: true }
        : { ok: false, reason: "invalid" }
    }

    if (message.type === "realtime.ready" &&
      typeof message.sourceId === "string" &&
      typeof message.sourceVersion === "number" &&
      Number.isSafeInteger(message.sourceVersion) &&
      message.sourceVersion >= 0 &&
      typeof message.sessionId === "string" &&
      Array.isArray(message.peers) &&
      message.peers.every(isPresenceCollaborator)) {
      return { message: message as RealtimeReadyMessage, ok: true }
    }

    if (message.type === "presence.update" &&
      typeof message.sourceId === "string" &&
      isPresenceCollaborator(message.collaborator)) {
      return { message: message as PresenceUpdateMessage, ok: true }
    }

    if (message.type === "presence.clear" &&
      typeof message.sourceId === "string" &&
      typeof message.sessionId === "string" &&
      Number.isSafeInteger(message.revision) &&
      (message.revision as number) >= 0) {
      return { message: message as PresenceClearMessage, ok: true }
    }

    return { ok: false, reason: "invalid" }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}

type RealtimeReadyMessage = {
  peers: Array<Omit<DatabasePresenceCollaborator, "color">>
  protocolVersion: 3
  sessionId: string
  sourceId: string
  sourceVersion: number
  type: "realtime.ready"
}
type PresenceUpdateMessage = {
  collaborator: Omit<DatabasePresenceCollaborator, "color">
  protocolVersion: 3
  sourceId: string
  type: "presence.update"
}
type PresenceClearMessage = {
  protocolVersion: 3
  revision: number
  sessionId: string
  sourceId: string
  type: "presence.clear"
}
type RealtimeServerMessage = DataSourceMutationEventV3 |
  RealtimeReadyMessage |
  PresenceUpdateMessage | PresenceClearMessage

function isPresenceCollaborator(
  value: unknown,
): value is Omit<DatabasePresenceCollaborator, "color"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const collaborator = value as Record<string, unknown>
  const presence = collaborator.presence as Record<string, unknown> | undefined
  const user = collaborator.user as Record<string, unknown> | undefined
  return typeof collaborator.connectedAt === "string" &&
    typeof collaborator.updatedAt === "string" &&
    typeof collaborator.sessionId === "string" &&
    Number.isSafeInteger(collaborator.revision) &&
    (collaborator.revision as number) >= 0 &&
    Boolean(presence &&
      typeof presence.columnKey === "string" &&
      typeof presence.rowId === "string" &&
      (presence.viewId === null || typeof presence.viewId === "string")) &&
    Boolean(user && typeof user.id === "string" && typeof user.name === "string")
}

function isNewerCollaborator(
  candidate: DatabasePresenceCollaborator,
  current: DatabasePresenceCollaborator,
) {
  return candidate.revision > current.revision ||
    (candidate.revision === current.revision &&
      Date.parse(candidate.updatedAt) > Date.parse(current.updatedAt))
}

function withColor<T extends Omit<DatabasePresenceCollaborator, "color">>(
  collaborator: T,
): DatabasePresenceCollaborator {
  return { ...collaborator, color: stableColor(collaborator.sessionId) }
}

function stableColor(value: string) {
  const colors = [
    "var(--editor-blue)",
    "var(--editor-purple)",
    "var(--editor-pink)",
    "var(--editor-orange)",
    "var(--editor-green)",
    "var(--editor-yellow)",
    "var(--editor-red)",
    "var(--editor-brown)",
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
const UNAVAILABLE_STATE: DatabaseRealtimeState = {
  cellPresenceByKey: {},
  collaborators: [],
  status: "unavailable",
}
function getOfflineSnapshot() {
  return OFFLINE_STATE
}
function getUnavailableSnapshot() {
  return UNAVAILABLE_STATE
}
function emptySubscribe() {
  return () => undefined
}
