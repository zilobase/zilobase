export type TimelineRowLayout = {
  centers: Record<string, number>
  dropTops: number[]
}

export const emptyTimelineRowLayout: TimelineRowLayout = {
  centers: {},
  dropTops: [],
}

const positionsMatch = (first: number | undefined, second: number) =>
  first !== undefined && Math.abs(first - second) < 0.5

export function timelineRowLayoutsMatch(
  current: TimelineRowLayout,
  next: TimelineRowLayout,
) {
  const currentRowIds = Object.keys(current.centers)
  const nextRowIds = Object.keys(next.centers)

  if (
    currentRowIds.length !== nextRowIds.length ||
    current.dropTops.length !== next.dropTops.length
  ) {
    return false
  }

  return (
    nextRowIds.every((rowId) =>
      positionsMatch(current.centers[rowId], next.centers[rowId]),
    ) &&
    next.dropTops.every((top, index) =>
      positionsMatch(current.dropTops[index], top),
    )
  )
}

export function getTimelineRowDropTargetIndex(
  rowIds: string[],
  rowCenters: Record<string, number>,
  pointerTop: number,
) {
  let low = 0
  let high = rowIds.length

  while (low < high) {
    const index = Math.floor((low + high) / 2)
    const center = rowCenters[rowIds[index]]

    if (center !== undefined && pointerTop < center) {
      high = index
    } else {
      low = index + 1
    }
  }

  return low
}
