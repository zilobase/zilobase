type DeferredRealtimeScheduler = Pick<
  Window,
  "cancelAnimationFrame" | "clearTimeout" | "requestAnimationFrame" | "setTimeout"
>

/**
 * Starts realtime work only after the current React commit has had a chance to
 * paint. The timeout inside requestAnimationFrame keeps socket setup out of the
 * frame that mounts the page/editor.
 */
export function scheduleRealtimeAfterPagePaint(
  start: () => void,
  scheduler: DeferredRealtimeScheduler = window,
) {
  let frameId: number | null = null
  let timeoutId: number | null = null
  let cancelled = false

  frameId = scheduler.requestAnimationFrame(() => {
    frameId = null
    timeoutId = scheduler.setTimeout(() => {
      timeoutId = null
      if (!cancelled) start()
    }, 0)
  })

  return () => {
    cancelled = true
    if (frameId !== null) scheduler.cancelAnimationFrame(frameId)
    if (timeoutId !== null) scheduler.clearTimeout(timeoutId)
  }
}
