type DatabaseWheelEventLike = {
  deltaX: number
  deltaY: number
  shiftKey: boolean
}

const wheelNoiseThreshold = 1
const horizontalIntentRatio = 1.25

type DatabaseHorizontalScrollMetrics = {
  clientWidth: number
  scrollLeft: number
  scrollWidth: number
}

export function getClampedDatabaseScrollLeft(
  metrics: DatabaseHorizontalScrollMetrics,
  delta = 0
) {
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth)

  return Math.min(
    maxScrollLeft,
    Math.max(0, metrics.scrollLeft + delta)
  )
}

export function getDatabaseHorizontalScrollSync(
  source: DatabaseHorizontalScrollMetrics,
  targetScrollLeft: number
) {
  const scrollLeft = getClampedDatabaseScrollLeft(source)
  const isRubberBanding = scrollLeft !== source.scrollLeft

  return {
    isRubberBanding,
    rubberBandOffset: isRubberBanding
      ? targetScrollLeft - source.scrollLeft
      : 0,
    scrollLeft,
  }
}

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

export function getDatabaseHorizontalWheelScrollLeft(
  event: DatabaseWheelEventLike,
  metrics: DatabaseHorizontalScrollMetrics
) {
  const horizontalDelta = getDatabaseHorizontalWheelDelta(event)
  const maxScrollLeft = metrics.scrollWidth - metrics.clientWidth

  if (!horizontalDelta || maxScrollLeft <= 1) {
    return null
  }

  const scrollLeft = getClampedDatabaseScrollLeft(metrics, horizontalDelta)

  return {
    scrollLeft,
    shouldConsume: scrollLeft !== metrics.scrollLeft,
  }
}
