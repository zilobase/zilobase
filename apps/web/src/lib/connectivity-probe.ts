import type { ConnectivityState } from "@/lib/offline-store"

// Health probe aborts at 5s; wait a beat longer so startup can fail closed.
export const CONNECTIVITY_SETTLE_TIMEOUT_MS = 6_000

export function connectivityStateDuringProbe(
  current: ConnectivityState,
): ConnectivityState {
  return current === "online" ? "online" : "checking"
}

export function resolveOfflineFallback<T>(
  connectivity: ConnectivityState,
  fallback: T | null | undefined,
):
  | { type: "network" }
  | { type: "fallback"; value: T }
  | { type: "unavailable" } {
  if (connectivity === "online") return { type: "network" }
  if (fallback != null) return { type: "fallback", value: fallback }
  return { type: "unavailable" }
}

export function waitForSettledConnectivity({
  getState,
  subscribe,
  timeoutMs = CONNECTIVITY_SETTLE_TIMEOUT_MS,
}: {
  getState: () => ConnectivityState
  subscribe: (listener: () => void) => () => void
  timeoutMs?: number
}): Promise<ConnectivityState> {
  const current = getState()
  if (current !== "checking") return Promise.resolve(current)

  return new Promise((resolve) => {
    let settled = false
    const finish = (state: ConnectivityState) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve(state)
    }
    const unsubscribe = subscribe(() => {
      const state = getState()
      if (state !== "checking") finish(state)
    })
    const timer = setTimeout(() => finish(getState()), timeoutMs)
  })
}
