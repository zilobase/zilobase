import { useEffect } from "react"

import { apiFetch } from "@/features/desktop/network/api"

type MailRealtimeTicket = {
  expiresAt: string
  ticket: string
  websocketProtocols: string[]
  websocketUrl: string
}

type MailRealtimeMessage = {
  connectionId: string
  revision: number
  type: "mail.invalidate"
}

type LockManagerLike = {
  request<T>(
    name: string,
    options: { ifAvailable: true; mode: "exclusive" },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

const HEARTBEAT_MS = 20_000
const MAX_RECONNECT_MS = 30_000

export function useMailRealtime(input: {
  connectionId: string
  enabled: boolean
  onSynchronize: () => Promise<unknown>
}) {
  useEffect(() => {
    if (!input.enabled || typeof WebSocket === "undefined") return
    let socket: WebSocket | null = null
    let stopped = false
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let ticketTimer: ReturnType<typeof setTimeout> | null = null
    const channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(`zilobase:mail:${input.connectionId}`)

    const synchronizeRevision = (revision: number) => coordinateMailRevision({
      connectionId: input.connectionId,
      revision,
      synchronize: input.onSynchronize,
    })
    const recover = () => coordinateMailRecovery({
      connectionId: input.connectionId,
      synchronize: input.onSynchronize,
    })

    const stopSocketTimers = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (ticketTimer) clearTimeout(ticketTimer)
      heartbeatTimer = null
      ticketTimer = null
    }
    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return
      const delay = mailReconnectDelay(reconnectAttempt++)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, delay)
    }
    const connect = async () => {
      if (stopped || navigator.onLine === false || socket) return
      try {
        const ticket = await apiFetch<MailRealtimeTicket>("/mail/realtime-ticket", {
          body: "{}",
          method: "POST",
        })
        if (stopped) return
        const nextSocket = new WebSocket(ticket.websocketUrl, ticket.websocketProtocols)
        socket = nextSocket
        nextSocket.addEventListener("open", () => {
          if (socket !== nextSocket) return
          reconnectAttempt = 0
          heartbeatTimer = setInterval(() => {
            if (nextSocket.readyState === WebSocket.OPEN) {
              nextSocket.send(JSON.stringify({ type: "mail.ping" }))
            }
          }, HEARTBEAT_MS)
          ticketTimer = setTimeout(
            () => nextSocket.close(1000, "Refreshing mail realtime ticket"),
            Math.max(1_000, new Date(ticket.expiresAt).getTime() - Date.now() - 5_000),
          )
          void recover()
        })
        nextSocket.addEventListener("message", (event) => {
          const message = parseMailRealtimeMessage(event.data, input.connectionId)
          if (!message) return
          channel?.postMessage(message)
          void synchronizeRevision(message.revision)
        })
        nextSocket.addEventListener("close", () => {
          if (socket !== nextSocket) return
          socket = null
          stopSocketTimers()
          scheduleReconnect()
        })
        nextSocket.addEventListener("error", () => nextSocket.close())
      } catch {
        socket = null
        scheduleReconnect()
      }
    }
    const handleFocus = () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return
      void recover()
      if (!socket || socket.readyState >= WebSocket.CLOSING) void connect()
    }
    const handleOnline = () => {
      void recover()
      void connect()
    }
    if (channel) {
      channel.onmessage = (event) => {
        const message = parseMailRealtimeMessage(event.data, input.connectionId)
        if (message) void synchronizeRevision(message.revision)
      }
    }
    document.addEventListener("visibilitychange", handleFocus)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("online", handleOnline)
    void connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      stopSocketTimers()
      channel?.close()
      socket?.close(1000, "Mail view closed")
      document.removeEventListener("visibilitychange", handleFocus)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("online", handleOnline)
    }
  }, [input.connectionId, input.enabled, input.onSynchronize])
}

export async function coordinateMailRevision(input: {
  connectionId: string
  locks?: LockManagerLike | null
  revision: number
  storage?: StorageLike | null
  synchronize: () => Promise<unknown>
}) {
  const key = `zilobase:mail:revision:${input.connectionId}`
  const storage = input.storage === undefined ? browserStorage() : input.storage
  const locks = input.locks === undefined ? browserLocks() : input.locks
  const synchronize = async () => {
    const current = Number(storage?.getItem(key) ?? -1)
    if (Number.isSafeInteger(current) && current >= input.revision) return false
    const result = await input.synchronize()
    if (result === null) return false
    storage?.setItem(key, String(input.revision))
    return true
  }
  if (!locks) return synchronize()
  return locks.request(
    `zilobase:mail:sync:${input.connectionId}`,
    { ifAvailable: true, mode: "exclusive" },
    (lock) => lock ? synchronize() : Promise.resolve(false),
  )
}

export async function coordinateMailRecovery(input: {
  connectionId: string
  locks?: LockManagerLike | null
  synchronize: () => Promise<unknown>
}) {
  const locks = input.locks === undefined ? browserLocks() : input.locks
  if (!locks) {
    await input.synchronize()
    return true
  }
  return locks.request(
    `zilobase:mail:sync:${input.connectionId}`,
    { ifAvailable: true, mode: "exclusive" },
    async (lock) => {
      if (!lock) return false
      await input.synchronize()
      return true
    },
  )
}

export function mailReconnectDelay(attempt: number) {
  return Math.min(MAX_RECONNECT_MS, 1_000 * 2 ** Math.max(0, Math.min(attempt, 10)))
}

function parseMailRealtimeMessage(data: unknown, connectionId: string): MailRealtimeMessage | null {
  let value = data
  if (typeof data === "string") {
    try { value = JSON.parse(data) } catch { return null }
  }
  if (!value || typeof value !== "object") return null
  const message = value as Partial<MailRealtimeMessage>
  if (
    message.type !== "mail.invalidate" ||
    message.connectionId !== connectionId ||
    !Number.isSafeInteger(message.revision) ||
    Number(message.revision) < 0
  ) return null
  return message as MailRealtimeMessage
}

function browserLocks() {
  if (typeof navigator === "undefined") return null
  return (navigator as Navigator & { locks?: LockManagerLike }).locks ?? null
}

function browserStorage() {
  if (typeof localStorage === "undefined") return null
  return localStorage
}
