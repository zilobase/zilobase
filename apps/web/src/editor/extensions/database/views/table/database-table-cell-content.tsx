import {
  useEffect,
  useRef,
  type ReactNode,
} from "react"

import {
  getDatabaseHorizontalWheelDelta,
  preserveDatabaseScrollLeftOnVerticalWheel,
} from "../../interactions/database-wheel-scroll"

function handleDatabaseCellWheel(
  event: WheelEvent,
  scrollElement: HTMLDivElement
) {
  const horizontalDelta = getDatabaseHorizontalWheelDelta(event)
  const tableScrollElement = scrollElement.closest<HTMLDivElement>(
    ".database-table-scroll"
  )

  if (!horizontalDelta) {
    preserveDatabaseScrollLeftOnVerticalWheel(event, [
      scrollElement,
      tableScrollElement,
    ])
    return
  }

  const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth
  const preventCancelableDefault = () => {
    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const scrollTable = (delta: number) => {
    if (!tableScrollElement) {
      return false
    }

    const tableMaxScrollLeft =
      tableScrollElement.scrollWidth - tableScrollElement.clientWidth
    const nextScrollLeft = Math.min(
      tableMaxScrollLeft,
      Math.max(0, tableScrollElement.scrollLeft + delta)
    )

    if (nextScrollLeft === tableScrollElement.scrollLeft) {
      return false
    }

    tableScrollElement.scrollLeft = nextScrollLeft
    return true
  }

  if (maxScrollLeft <= 1) {
    if (scrollTable(horizontalDelta)) {
      preventCancelableDefault()
      event.stopPropagation()
    }

    return
  }

  const previousScrollLeft = scrollElement.scrollLeft
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, previousScrollLeft + horizontalDelta)
  )
  const consumedDelta = nextScrollLeft - previousScrollLeft
  const remainingDelta = horizontalDelta - consumedDelta

  scrollElement.scrollLeft = nextScrollLeft

  if (remainingDelta) {
    scrollTable(remainingDelta)
  }

  preventCancelableDefault()
  event.stopPropagation()
}

export function DatabaseTableCellContent({
  children,
  wrapContent = false,
}: {
  children: ReactNode
  wrapContent?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const scrollElement = scrollRef.current

    if (!scrollElement) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      handleDatabaseCellWheel(event, scrollElement)
    }

    scrollElement.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      scrollElement.removeEventListener("wheel", handleWheel)
    }
  }, [])

  return (
    <div
      className="database-cell-scroll"
      data-database-cell-scroll
      data-wrap-content={wrapContent ? "true" : "false"}
      ref={scrollRef}
    >
      {children}
    </div>
  )
}
