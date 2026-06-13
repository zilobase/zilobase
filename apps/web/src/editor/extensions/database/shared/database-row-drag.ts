export type DatabaseRowDragOverlay = {
  height: number
  left: number
  offsetX: number
  offsetY: number
  title: string
  top: number
  width: number
}

type RowIdItem = {
  id: string
}

function areRowIdsEqual(leftRows: RowIdItem[], rowIds: string[]) {
  return rowIds.every((rowId, index) => rowId === leftRows[index]?.id)
}

export function getReorderedRowIds(
  sourceRows: RowIdItem[],
  draggedRowId: string,
  targetIndex: number
) {
  const sourceIndex = sourceRows.findIndex((row) => row.id === draggedRowId)

  if (sourceIndex === -1) {
    return null
  }

  const nextRows = [...sourceRows]
  const [draggedRow] = nextRows.splice(sourceIndex, 1)
  const nextTargetIndex = Math.min(
    nextRows.length,
    Math.max(0, targetIndex > sourceIndex ? targetIndex - 1 : targetIndex)
  )

  nextRows.splice(nextTargetIndex, 0, draggedRow)

  const rowIds = nextRows.map((row) => row.id)

  return areRowIdsEqual(sourceRows, rowIds) ? null : rowIds
}

export function getFilteredReorderedRowIds(
  allRows: RowIdItem[],
  visibleRows: RowIdItem[],
  draggedRowId: string,
  targetIndex: number
) {
  const nextVisibleRowIds = getReorderedRowIds(
    visibleRows,
    draggedRowId,
    targetIndex
  )
  const draggedRow = allRows.find((row) => row.id === draggedRowId)

  if (!nextVisibleRowIds || !draggedRow) {
    return null
  }

  const nextVisibleIndex = nextVisibleRowIds.indexOf(draggedRowId)
  const nextAnchorId = nextVisibleRowIds[nextVisibleIndex + 1]
  const previousAnchorId = nextVisibleRowIds[nextVisibleIndex - 1]
  const nextRows = allRows.filter((row) => row.id !== draggedRowId)
  let insertIndex = 0

  if (nextAnchorId) {
    insertIndex = nextRows.findIndex((row) => row.id === nextAnchorId)

    if (insertIndex === -1) {
      return null
    }
  } else if (previousAnchorId) {
    const previousAnchorIndex = nextRows.findIndex(
      (row) => row.id === previousAnchorId
    )

    if (previousAnchorIndex === -1) {
      return null
    }

    insertIndex = previousAnchorIndex + 1
  }

  nextRows.splice(insertIndex, 0, draggedRow)

  const rowIds = nextRows.map((row) => row.id)

  return areRowIdsEqual(allRows, rowIds) ? null : rowIds
}

export function getAnchoredReorderedRowIds(
  allRows: RowIdItem[],
  draggedRowId: string,
  anchorRows: RowIdItem[],
  targetIndex: number
) {
  const draggedRow = allRows.find((row) => row.id === draggedRowId)

  if (!draggedRow) {
    return null
  }

  const nextAnchorId = anchorRows[targetIndex]?.id
  const previousAnchorId = anchorRows[targetIndex - 1]?.id
  const nextRows = allRows.filter((row) => row.id !== draggedRowId)
  let insertIndex = 0

  if (nextAnchorId) {
    insertIndex = nextRows.findIndex((row) => row.id === nextAnchorId)

    if (insertIndex === -1) {
      return null
    }
  } else if (previousAnchorId) {
    const previousAnchorIndex = nextRows.findIndex(
      (row) => row.id === previousAnchorId
    )

    if (previousAnchorIndex === -1) {
      return null
    }

    insertIndex = previousAnchorIndex + 1
  }

  nextRows.splice(insertIndex, 0, draggedRow)

  const rowIds = nextRows.map((row) => row.id)

  return areRowIdsEqual(allRows, rowIds) ? null : rowIds
}

export function getGroupedReorderedRowIds({
  allRows,
  draggedRowId,
  groupRows,
  targetIndex,
  visibleRows,
}: {
  allRows: RowIdItem[]
  draggedRowId: string
  groupRows: RowIdItem[]
  targetIndex: number
  visibleRows: RowIdItem[]
}) {
  const groupRowIds = new Set(groupRows.map((row) => row.id))

  if (!groupRowIds.has(draggedRowId)) {
    return null
  }

  const groupStartIndex = visibleRows.findIndex((row) => groupRowIds.has(row.id))

  if (groupStartIndex === -1) {
    return null
  }

  const groupEndIndex = groupStartIndex + groupRows.length

  if (targetIndex < groupStartIndex || targetIndex > groupEndIndex) {
    return null
  }

  return getFilteredReorderedRowIds(
    allRows,
    groupRows,
    draggedRowId,
    targetIndex - groupStartIndex
  )
}

export function hideNativeDatabaseRowDragPreview(dataTransfer: DataTransfer) {
  const dragImage = document.createElement("span")

  dragImage.style.position = "fixed"
  dragImage.style.top = "-100px"
  dragImage.style.left = "-100px"
  dragImage.style.width = "1px"
  dragImage.style.height = "1px"
  dragImage.style.opacity = "0"

  document.body.appendChild(dragImage)
  dataTransfer.setDragImage(dragImage, 0, 0)
  window.requestAnimationFrame(() => dragImage.remove())
}
