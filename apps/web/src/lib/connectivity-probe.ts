import type { ConnectivityState } from "@/lib/offline-store"

export function connectivityStateDuringProbe(
  current: ConnectivityState,
): ConnectivityState {
  return current === "online" ? "online" : "checking"
}
