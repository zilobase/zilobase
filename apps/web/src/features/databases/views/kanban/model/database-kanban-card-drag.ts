export function getKanbanCardDropTargetIndex(
  cards: readonly { height: number; top: number }[],
  pointerOffset: number,
) {
  const targetIndex = cards.findIndex(
    (card) => pointerOffset < card.top + card.height / 2,
  )

  return targetIndex === -1 ? cards.length : targetIndex
}

export function getKanbanExternalDropPosition<Row extends { id: string }>(
  allRows: Row[],
  columnRows: Row[],
  targetIndex: number,
) {
  const targetRow = columnRows[targetIndex]
  if (targetRow) {
    const index = allRows.findIndex((row) => row.id === targetRow.id)
    if (index >= 0) return index
  }

  const previousRow = columnRows[targetIndex - 1]
  if (previousRow) {
    const index = allRows.findIndex((row) => row.id === previousRow.id)
    if (index >= 0) return index + 1
  }

  return allRows.length
}

/** Preview only: original row indices remain the persistence/drop contract. */
export function getKanbanCardPreview(input: {
  heights: number[]
  gap: number
  draggedHeight: number
  sourceIndex: number
  targetIndex: number | null
}) {
  const { heights, gap, draggedHeight, sourceIndex, targetIndex } = input
  const offsets: number[] = []
  let originalTop = 0
  let previewTop = 0
  let placeholderTop: number | null = null
  for (let index = 0; index <= heights.length; index++) {
    if (index === targetIndex) {
      placeholderTop = previewTop
      previewTop += draggedHeight + gap
    }
    if (index === heights.length) break
    offsets.push(previewTop - originalTop)
    originalTop += heights[index] + gap
    if (index !== sourceIndex) previewTop += heights[index] + gap
  }
  return { offsets, placeholderTop, heightDelta: previewTop - originalTop }
}

/** Pixels per second, increasing as the pointer approaches the visible edge. */
export function getKanbanEdgeScrollSpeed({
  clientX, left, right, scrollLeft, maxScrollLeft,
}: {
  clientX: number
  left: number
  right: number
  scrollLeft: number
  maxScrollLeft: number
}) {
  if (right <= left || maxScrollLeft <= 0 || clientX < left || clientX > right) return 0
  // Start before a typical card extends beyond the viewport.
  const edge = Math.min(180, (right - left) / 3)
  if (clientX < left + edge && scrollLeft > 0) {
    return -1000 * (1 - (clientX - left) / edge)
  }
  if (clientX > right - edge && scrollLeft < maxScrollLeft) {
    return 1000 * (1 - (right - clientX) / edge)
  }
  return 0
}

/** The committed card layout, shown while the shared cache mutation catches up. */
export function getKanbanDroppedRows<Row extends { id: string }>({
  rows, draggedRow, rowIds, isTarget,
}: {
  rows: Row[]
  draggedRow: Row
  rowIds: string[]
  isTarget: boolean
}) {
  const nextRows = new Map(rows.filter((row) => row.id !== draggedRow.id).map((row) => [row.id, row]))
  if (isTarget) nextRows.set(draggedRow.id, draggedRow)
  return rowIds.flatMap((id) => {
    const row = nextRows.get(id)
    return row ? [row] : []
  })
}
