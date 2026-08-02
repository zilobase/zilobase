import type { DatabaseSubItemsSettings } from "./database-view-config"

type SubItemRow = {
  id: string
  parentRowId?: string | null
  position: number
}

type SubItemHierarchyRow = Pick<SubItemRow, "id" | "parentRowId">

export type DatabaseSubItemsView<Row extends SubItemRow> = {
  childRowIdsByParentId: Record<string, string[]>
  depthByRowId: Record<string, number>
  rows: Row[]
}

export function getSubItemCreateRowsAfterRow<Row extends SubItemHierarchyRow>({
  expandedRowIds,
  rows,
}: {
  expandedRowIds: ReadonlySet<string>
  rows: Row[]
}): Record<string, string[]> {
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const createRowIdsByAfterRowId: Record<string, string[]> = {}

  const isDescendantOf = (row: Row | undefined, ancestorRowId: string) => {
    const seen = new Set<string>()
    let parentRowId = row?.parentRowId

    while (parentRowId && !seen.has(parentRowId)) {
      if (parentRowId === ancestorRowId) return true

      seen.add(parentRowId)
      parentRowId = rowsById.get(parentRowId)?.parentRowId
    }

    return false
  }

  rows.forEach((row, index) => {
    const nextRow = rows[index + 1]
    const createRowIds: string[] = []
    const seen = new Set<string>()
    let currentRow: Row | undefined = row

    while (currentRow && !seen.has(currentRow.id)) {
      seen.add(currentRow.id)

      if (
        expandedRowIds.has(currentRow.id) &&
        !isDescendantOf(nextRow, currentRow.id)
      ) {
        createRowIds.push(currentRow.id)
      }

      currentRow = currentRow.parentRowId
        ? rowsById.get(currentRow.parentRowId)
        : undefined
    }

    if (createRowIds.length > 0) {
      createRowIdsByAfterRowId[row.id] = createRowIds
    }
  })

  return createRowIdsByAfterRowId
}

export function getDatabaseSubItemsView<Row extends SubItemRow>({
  filteredRows,
  hasFilters,
  rows,
  settings,
  sortedRows,
}: {
  filteredRows: Row[]
  hasFilters: boolean
  rows: Row[]
  settings: DatabaseSubItemsSettings
  sortedRows: Row[]
}): DatabaseSubItemsView<Row> {
  const hierarchyEnabled = settings.enabled && settings.display !== "disabled"

  if (!hierarchyEnabled) {
    return {
      childRowIdsByParentId: {},
      depthByRowId: Object.fromEntries(sortedRows.map((row) => [row.id, 0])),
      rows: sortedRows,
    }
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const childrenByParentId = new Map<string, Row[]>()

  for (const row of rows) {
    if (!row.parentRowId || !rowsById.has(row.parentRowId)) continue

    const children = childrenByParentId.get(row.parentRowId) ?? []
    children.push(row)
    childrenByParentId.set(row.parentRowId, children)
  }

  const selectedRowIds = getSelectedRowIds({
    childrenByParentId,
    filteredRows,
    hasFilters,
    rows,
    rowsById,
    settings,
  })
  const sortIndexByRowId = new Map(
    sortedRows.map((row, index) => [row.id, index]),
  )
  const compareRows = (left: Row, right: Row) =>
    (sortIndexByRowId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (sortIndexByRowId.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
    left.position - right.position
  const selectedRows = rows
    .filter((row) => selectedRowIds.has(row.id))
    .sort(compareRows)
  const childRowIdsByParentId: Record<string, string[]> = {}

  for (const [parentRowId, children] of childrenByParentId) {
    const selectedChildren = children
      .filter((row) => selectedRowIds.has(row.id))
      .sort(compareRows)

    if (selectedChildren.length > 0) {
      childRowIdsByParentId[parentRowId] = selectedChildren.map((row) => row.id)
    }
  }

  if (settings.display === "flattened") {
    return {
      childRowIdsByParentId,
      depthByRowId: Object.fromEntries(selectedRows.map((row) => [row.id, 0])),
      rows: selectedRows,
    }
  }

  const selectedRowsById = new Map(selectedRows.map((row) => [row.id, row]))
  const rootRows = selectedRows.filter(
    (row) => !row.parentRowId || !selectedRowsById.has(row.parentRowId),
  )
  const orderedRows: Row[] = []
  const depthByRowId: Record<string, number> = {}
  const visited = new Set<string>()

  const visit = (row: Row, depth: number) => {
    if (visited.has(row.id)) return

    visited.add(row.id)
    orderedRows.push(row)
    depthByRowId[row.id] = depth

    for (const childRowId of childRowIdsByParentId[row.id] ?? []) {
      const child = selectedRowsById.get(childRowId)
      if (child) visit(child, depth + 1)
    }
  }

  rootRows.sort(compareRows).forEach((row) => visit(row, 0))
  selectedRows.forEach((row) => visit(row, 0))

  return { childRowIdsByParentId, depthByRowId, rows: orderedRows }
}

function getSelectedRowIds<Row extends SubItemRow>({
  childrenByParentId,
  filteredRows,
  hasFilters,
  rows,
  rowsById,
  settings,
}: {
  childrenByParentId: Map<string, Row[]>
  filteredRows: Row[]
  hasFilters: boolean
  rows: Row[]
  rowsById: Map<string, Row>
  settings: DatabaseSubItemsSettings
}) {
  if (!hasFilters) return new Set(rows.map((row) => row.id))

  const matchingRowIds = new Set(filteredRows.map((row) => row.id))
  const selectedRowIds = new Set<string>()

  const addAncestors = (row: Row) => {
    const seen = new Set<string>()
    let current: Row | undefined = row

    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      selectedRowIds.add(current.id)
      current = current.parentRowId
        ? rowsById.get(current.parentRowId)
        : undefined
    }
  }
  const addDescendants = (row: Row) => {
    if (selectedRowIds.has(row.id)) return

    selectedRowIds.add(row.id)
    for (const child of childrenByParentId.get(row.id) ?? []) {
      addDescendants(child)
    }
  }

  if (settings.filter === "parents-only") {
    rows
      .filter((row) => !row.parentRowId && matchingRowIds.has(row.id))
      .forEach(addDescendants)
    return selectedRowIds
  }

  rows
    .filter(
      (row) =>
        matchingRowIds.has(row.id) &&
        (settings.filter !== "sub-items-only" || Boolean(row.parentRowId)),
    )
    .forEach(addAncestors)

  return selectedRowIds
}
