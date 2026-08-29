export type DatabaseViewScrollSnapshot = {
  scrollElement: Element & { scrollTop: number }
  scrollTop: number
}

const verticalScrollOverflowValues = new Set(["auto", "overlay", "scroll"])

export function isVerticalScrollContainer({
  clientHeight,
  overflowY,
  scrollHeight,
}: {
  clientHeight: number
  overflowY: string
  scrollHeight: number
}) {
  return (
    verticalScrollOverflowValues.has(overflowY) &&
    scrollHeight > clientHeight
  )
}

export function captureDatabaseViewScroll(
  anchor: HTMLElement | null,
): DatabaseViewScrollSnapshot | null {
  if (!anchor) {
    return null
  }

  const ownerWindow = anchor.ownerDocument.defaultView
  let parent = anchor.parentElement

  while (ownerWindow && parent) {
    if (
      isVerticalScrollContainer({
        clientHeight: parent.clientHeight,
        overflowY: ownerWindow.getComputedStyle(parent).overflowY,
        scrollHeight: parent.scrollHeight,
      })
    ) {
      return {
        scrollElement: parent,
        scrollTop: parent.scrollTop,
      }
    }

    parent = parent.parentElement
  }

  const documentScrollElement = anchor.ownerDocument.scrollingElement

  return documentScrollElement
    ? {
        scrollElement: documentScrollElement,
        scrollTop: documentScrollElement.scrollTop,
      }
    : null
}

export function restoreDatabaseViewScroll(
  snapshot: DatabaseViewScrollSnapshot | null,
) {
  if (snapshot) {
    snapshot.scrollElement.scrollTop = snapshot.scrollTop
  }
}

export function shouldRenderVirtualizedDatabaseRows({
  hasScrollElement,
  virtualRowCount,
  virtualizationEnabled,
}: {
  hasScrollElement: boolean
  virtualRowCount: number
  virtualizationEnabled: boolean
}) {
  return virtualizationEnabled && hasScrollElement && virtualRowCount > 0
}
