export function getDropDatabaseElement(event: DragEvent) {
  return event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>(".database-block[data-database-id]")
    : null
}

export function getDatabasePageDropPosition(
  databaseElement: HTMLElement,
  clientY: number,
) {
  const rows = Array.from(
    databaseElement.querySelectorAll<HTMLTableRowElement>(
      ".database-table tbody tr[data-database-row-id]",
    ),
  )
  if (rows.length === 0) return 0

  const targetIndex = rows.findIndex(
    (row) =>
      clientY < row.getBoundingClientRect().top + row.offsetHeight / 2,
  )
  return targetIndex === -1 ? rows.length : targetIndex
}
