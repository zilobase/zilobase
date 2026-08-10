export function getDatabaseRowDropTargetIndex(
  dropTops: number[],
  pointerTop: number
) {
  if (dropTops.length < 2) {
    return 0
  }

  let low = 0
  let high = dropTops.length - 1

  while (low < high) {
    const index = Math.floor((low + high) / 2)
    const midpoint = (dropTops[index] + dropTops[index + 1]) / 2

    if (pointerTop < midpoint) {
      high = index
    } else {
      low = index + 1
    }
  }

  return low
}

export type DatabaseRowDropTarget = {
  index: number
  lineTop: number
}

/**
 * Resolves both the insertion position and its visual line from the same row
 * geometry. The final entry in `dropTops` is the bottom edge of the last data
 * row, so the final destination remains above the "New page" footer.
 */
export function getDatabaseRowDropTarget(
  dropTops: number[],
  pointerTop: number
): DatabaseRowDropTarget | null {
  if (dropTops.length === 0) {
    return null
  }

  const index = getDatabaseRowDropTargetIndex(dropTops, pointerTop)
  return {
    index,
    lineTop: dropTops[index] ?? dropTops[dropTops.length - 1],
  }
}
