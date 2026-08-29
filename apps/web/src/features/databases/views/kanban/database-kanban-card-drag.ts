export function getKanbanCardDropTargetIndex(
  columnElement: HTMLElement,
  clientY: number,
) {
  const cards = Array.from(
    columnElement.querySelectorAll<HTMLElement>(
      ".database-kanban-card[data-database-row-id]",
    ),
  )
  const targetIndex = cards.findIndex((card) => {
    const rect = card.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2
  })

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
