type DatabaseWheelEventLike = {
  deltaX: number
  deltaY: number
  shiftKey: boolean
}

const wheelNoiseThreshold = 1
const horizontalIntentRatio = 1.25

export function getDatabaseHorizontalWheelDelta(event: DatabaseWheelEventLike) {
  const absoluteDeltaX = Math.abs(event.deltaX)
  const absoluteDeltaY = Math.abs(event.deltaY)

  if (event.shiftKey && absoluteDeltaY > wheelNoiseThreshold) {
    return event.deltaY
  }

  if (absoluteDeltaX <= wheelNoiseThreshold) {
    return 0
  }

  if (absoluteDeltaY <= wheelNoiseThreshold) {
    return event.deltaX
  }

  return absoluteDeltaX >= absoluteDeltaY * horizontalIntentRatio
    ? event.deltaX
    : 0
}

export function preserveDatabaseScrollLeftOnVerticalWheel(
  event: DatabaseWheelEventLike,
  scrollElements: Array<HTMLElement | null | undefined>
) {
  if (!event.deltaX || getDatabaseHorizontalWheelDelta(event)) {
    return
  }

  const snapshots = scrollElements
    .filter((element): element is HTMLElement => Boolean(element))
    .map((element) => ({
      element,
      scrollLeft: element.scrollLeft,
    }))

  if (snapshots.length === 0) {
    return
  }

  const requestFrame =
    globalThis.requestAnimationFrame ??
    ((callback: FrameRequestCallback) => globalThis.setTimeout(callback, 0))

  requestFrame(() => {
    for (const snapshot of snapshots) {
      snapshot.element.scrollLeft = snapshot.scrollLeft
    }
  })
}
