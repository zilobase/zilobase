export type RealtimeSocketStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "offline"

export function shouldReconnectRealtimeSocket() {
  return document.visibilityState !== "hidden"
}

export function getReconnectDelayMs(attempt: number) {
  return Math.min(10_000, 500 * 2 ** attempt)
}

export function bindVisibilityOnHidden(options: {
  isDisposed?: () => boolean
  onHidden: () => void
  onVisible: () => void
}) {
  const handleVisibilityChange = () => {
    if (options.isDisposed?.()) {
      return
    }

    if (document.visibilityState === "hidden") {
      options.onHidden()
      return
    }

    options.onVisible()
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
  }
}