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
