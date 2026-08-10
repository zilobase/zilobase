import type { DatabaseSubItemsSettings } from "./database-view-config"

type SubItemRow = {
  id: string
  pageId?: string
  position: number
}

type SubItemHierarchyRow = Pick<SubItemRow, "id">

export type DatabaseSubItemsView<Row extends SubItemRow> = {
  childRowIdsByParentId: Record<string, string[]>
  depthByRowId: Record<string, number>
  parentRowIdsByRowId: Record<string, string[]>
  rows: Row[]
}

export type DatabaseSubItemRelationChange = {
  currentValue: string | string[]
  nextValue: string[]
  propertyId: string
  rowId: string
}

export function getDatabaseSubItemLineParentRowId<Row extends { id: string }>({
  childRowIdsByParentId,
  collapsedRowIds,
  parentRowIdsByRowId,
  preferPreviousRowAsParent = false,
  rows,
  targetIndex,
}: {
  childRowIdsByParentId: Record<string, string[]>
  collapsedRowIds: ReadonlySet<string>
  parentRowIdsByRowId: Record<string, string[]>
  preferPreviousRowAsParent?: boolean
  rows: Row[]
  targetIndex: number
}): string | null {
  const nextRow = rows[targetIndex]
  const previousRow = rows[targetIndex - 1]

  if (preferPreviousRowAsParent && previousRow) return previousRow.id

  const nextParentRowId = nextRow
    ? parentRowIdsByRowId[nextRow.id]?.[0]
    : undefined

  if (nextParentRowId) return nextParentRowId

  if (
    previousRow &&
    collapsedRowIds.has(previousRow.id) &&
    (childRowIdsByParentId[previousRow.id]?.length ?? 0) > 0
  ) {
    return previousRow.id
  }

  return nextRow
    ? null
    : previousRow
      ? parentRowIdsByRowId[previousRow.id]?.[0] ?? null
      : null
}

export function getDatabaseSubItemRelationChanges<Row extends SubItemRow>({
  draggedRowId,
  parentPropertyId,
  propertyValuesByKey,
  rows,
  subItemPropertyId,
  targetParentRowId,
}: {
  draggedRowId: string
  parentPropertyId: string
  propertyValuesByKey: Record<string, string | string[]>
  rows: Row[]
  subItemPropertyId: string
  targetParentRowId: string | null
}): DatabaseSubItemRelationChange[] | null {
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const draggedRow = rowsById.get(draggedRowId)
  const targetParentRow = targetParentRowId
    ? rowsById.get(targetParentRowId)
    : undefined

  if (
    !draggedRow?.pageId ||
    (targetParentRowId && !targetParentRow?.pageId) ||
    draggedRow.id === targetParentRow?.id
  ) {
    return null
  }

  const childrenByPageId = new Map<string, Set<string>>()
  const addChild = (parentPageId: string, childPageId: string) => {
    const children = childrenByPageId.get(parentPageId) ?? new Set<string>()
    children.add(childPageId)
    childrenByPageId.set(parentPageId, children)
  }

  for (const row of rows) {
    if (!row.pageId) continue

    for (const parentPageId of toRelationPageIds(
      propertyValuesByKey[`${row.pageId}:${parentPropertyId}`]
    )) {
      addChild(parentPageId, row.pageId)
    }

    for (const childPageId of toRelationPageIds(
      propertyValuesByKey[`${row.pageId}:${subItemPropertyId}`]
    )) {
      addChild(row.pageId, childPageId)
    }
  }

  if (targetParentRow?.pageId) {
    const pending = [draggedRow.pageId]
    const visited = new Set<string>()

    while (pending.length > 0) {
      const pageId = pending.shift()!
      if (visited.has(pageId)) continue
      if (pageId === targetParentRow.pageId) return null
      visited.add(pageId)
      pending.push(...(childrenByPageId.get(pageId) ?? []))
    }
  }

  const changes: DatabaseSubItemRelationChange[] = []
  const currentParentValue =
    propertyValuesByKey[`${draggedRow.pageId}:${parentPropertyId}`] ?? ""
  const nextParentValue = targetParentRow?.pageId
    ? [targetParentRow.pageId]
    : []

  addRelationChange(changes, {
    currentValue: currentParentValue,
    nextValue: nextParentValue,
    propertyId: parentPropertyId,
    rowId: draggedRow.id,
  })

  for (const row of rows) {
    if (!row.pageId) continue

    const currentValue =
      propertyValuesByKey[`${row.pageId}:${subItemPropertyId}`] ?? ""
    const currentPageIds = toRelationPageIds(currentValue)
    const nextValue =
      row.id === targetParentRow?.id
        ? currentPageIds.includes(draggedRow.pageId)
          ? currentPageIds
          : [...currentPageIds, draggedRow.pageId]
        : currentPageIds.filter((pageId) => pageId !== draggedRow.pageId)

    addRelationChange(changes, {
      currentValue,
      nextValue,
      propertyId: subItemPropertyId,
      rowId: row.id,
    })
  }

  return changes
}

function addRelationChange(
  changes: DatabaseSubItemRelationChange[],
  change: DatabaseSubItemRelationChange
) {
  const currentPageIds = toRelationPageIds(change.currentValue)

  if (
    currentPageIds.length !== change.nextValue.length ||
    currentPageIds.some((pageId, index) => pageId !== change.nextValue[index])
  ) {
    changes.push(change)
  }
}

function toRelationPageIds(value: string | string[] | undefined) {
  return [...new Set(Array.isArray(value) ? value : value ? [value] : [])]
}

export function getSubItemCreateRowsAfterRow<Row extends SubItemHierarchyRow>({
  expandedRowIds,
  parentRowIdsByRowId,
  rows,
}: {
  expandedRowIds: ReadonlySet<string>
  parentRowIdsByRowId: Record<string, string[]>
  rows: Row[]
}): Record<string, string[]> {
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const createRowIdsByAfterRowId: Record<string, string[]> = {}

  const getParentRowIds = (row: Row | undefined) =>
    row ? parentRowIdsByRowId[row.id] ?? [] : []

  const isDescendantOf = (row: Row | undefined, ancestorRowId: string) => {
    const seen = new Set<string>()
    const pending = [...getParentRowIds(row)]

    while (pending.length > 0) {
      const parentRowId = pending.shift()!
      if (seen.has(parentRowId)) continue
      if (parentRowId === ancestorRowId) return true

      seen.add(parentRowId)
      pending.push(...getParentRowIds(rowsById.get(parentRowId)))
    }

    return false
  }

  rows.forEach((row, index) => {
    const nextRow = rows[index + 1]
    const createRowIds: string[] = []
    const seen = new Set<string>()
    const pending = [row.id]

    while (pending.length > 0) {
      const currentRowId = pending.shift()!
      if (seen.has(currentRowId)) continue
      const currentRow = rowsById.get(currentRowId)
      if (!currentRow) continue
      seen.add(currentRowId)

      if (
        expandedRowIds.has(currentRow.id) &&
        !isDescendantOf(nextRow, currentRow.id)
      ) {
        createRowIds.push(currentRow.id)
      }

      pending.push(...getParentRowIds(currentRow))
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
  propertyValuesByKey,
}: {
  filteredRows: Row[]
  hasFilters: boolean
  rows: Row[]
  settings: DatabaseSubItemsSettings
  sortedRows: Row[]
  propertyValuesByKey?: Record<string, string | string[]>
}): DatabaseSubItemsView<Row> {
  const hierarchyEnabled = settings.enabled && settings.display !== "disabled"

  if (!hierarchyEnabled) {
    return {
      childRowIdsByParentId: {},
      depthByRowId: Object.fromEntries(sortedRows.map((row) => [row.id, 0])),
      parentRowIdsByRowId: {},
      rows: sortedRows,
    }
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const rowByPageId = new Map(
    rows.flatMap((row) => (row.pageId ? [[row.pageId, row] as const] : [])),
  )
  const childrenByParentId = new Map<string, Row[]>()
  const parentRowIdsByRowId: Record<string, string[]> = {}
  const usesRelationProperties = Boolean(
    settings.parentPropertyId || settings.subItemPropertyId,
  )

  const addRelationship = (parent: Row | undefined, child: Row | undefined) => {
    if (!parent || !child || parent.id === child.id) return
    if (parentRowIdsByRowId[child.id]) return

    parentRowIdsByRowId[child.id] = [parent.id]

    const children = childrenByParentId.get(parent.id) ?? []
    if (!children.some((row) => row.id === child.id)) children.push(child)
    childrenByParentId.set(parent.id, children)
  }

  if (
    usesRelationProperties &&
    propertyValuesByKey &&
    settings.property === "parent-item" &&
    settings.parentPropertyId
  ) {
    for (const child of rows) {
      if (!child.pageId) continue
      const value =
        propertyValuesByKey[`${child.pageId}:${settings.parentPropertyId}`]
      const parentPageIds = Array.isArray(value) ? value : value ? [value] : []

      for (const parentPageId of parentPageIds) {
        addRelationship(rowByPageId.get(parentPageId), child)
      }
    }
  } else if (
    usesRelationProperties &&
    propertyValuesByKey &&
    settings.subItemPropertyId
  ) {
    for (const parent of rows) {
      if (!parent.pageId) continue
      const value =
        propertyValuesByKey[`${parent.pageId}:${settings.subItemPropertyId}`]
      const childPageIds = Array.isArray(value) ? value : value ? [value] : []

      for (const childPageId of childPageIds) {
        addRelationship(parent, rowByPageId.get(childPageId))
      }
    }
  }

  const selectedRowIds = getSelectedRowIds({
    childrenByParentId,
    filteredRows,
    hasFilters,
    rows,
    rowsById,
    settings,
    parentRowIdsByRowId,
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
      parentRowIdsByRowId,
      rows: selectedRows,
    }
  }

  const selectedRowsById = new Map(selectedRows.map((row) => [row.id, row]))
  const getDisplayedParentRowId = (row: Row) =>
    (parentRowIdsByRowId[row.id] ?? []).find((parentRowId) =>
      selectedRowsById.has(parentRowId)
    )
  const rootRows = selectedRows.filter(
    (row) => !getDisplayedParentRowId(row)
  )
  const orderedRows: Row[] = []
  const depthByRowId: Record<string, number> = {}
  const displayedChildRowIdsByParentId: Record<string, string[]> = {}
  const displayedParentRowIdsByRowId: Record<string, string[]> = {}
  const visited = new Set<string>()

  const visit = (row: Row, depth: number, parentRowId?: string) => {
    if (visited.has(row.id)) return false

    visited.add(row.id)
    orderedRows.push(row)
    depthByRowId[row.id] = depth
    if (parentRowId) displayedParentRowIdsByRowId[row.id] = [parentRowId]

    for (const childRowId of childRowIdsByParentId[row.id] ?? []) {
      const child = selectedRowsById.get(childRowId)
      if (
        child &&
        getDisplayedParentRowId(child) === row.id &&
        visit(child, depth + 1, row.id)
      ) {
        displayedChildRowIdsByParentId[row.id] = [
          ...(displayedChildRowIdsByParentId[row.id] ?? []),
          child.id,
        ]
      }
    }

    return true
  }

  rootRows.sort(compareRows).forEach((row) => visit(row, 0))
  selectedRows.forEach((row) => visit(row, 0))

  return {
    childRowIdsByParentId: displayedChildRowIdsByParentId,
    depthByRowId,
    parentRowIdsByRowId: displayedParentRowIdsByRowId,
    rows: orderedRows,
  }
}

function getSelectedRowIds<Row extends SubItemRow>({
  childrenByParentId,
  filteredRows,
  hasFilters,
  rows,
  rowsById,
  settings,
  parentRowIdsByRowId,
}: {
  childrenByParentId: Map<string, Row[]>
  filteredRows: Row[]
  hasFilters: boolean
  rows: Row[]
  rowsById: Map<string, Row>
  settings: DatabaseSubItemsSettings
  parentRowIdsByRowId: Record<string, string[]>
}) {
  if (!hasFilters) return new Set(rows.map((row) => row.id))

  const matchingRowIds = new Set(filteredRows.map((row) => row.id))
  const selectedRowIds = new Set<string>()

  const addAncestors = (row: Row) => {
    if (selectedRowIds.has(row.id)) return

    selectedRowIds.add(row.id)
    for (const parentRowId of parentRowIdsByRowId[row.id] ?? []) {
      const parent = rowsById.get(parentRowId)
      if (parent) addAncestors(parent)
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
      .filter(
        (row) =>
          (parentRowIdsByRowId[row.id]?.length ?? 0) === 0 &&
          matchingRowIds.has(row.id),
      )
      .forEach(addDescendants)
    return selectedRowIds
  }

  rows
    .filter(
      (row) =>
        matchingRowIds.has(row.id) &&
        (settings.filter !== "sub-items-only" ||
          (parentRowIdsByRowId[row.id]?.length ?? 0) > 0),
    )
    .forEach(addAncestors)

  return selectedRowIds
}
