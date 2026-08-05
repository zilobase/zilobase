import type { DatabasePayload, DatabaseProperty, DatabaseRow } from "./queries"
import type { DatabaseDelta } from "./mutation-types"

function mergeRecord<T extends Record<string, unknown>>(
  current: T | undefined,
  patch: Record<string, unknown>,
) {
  return {
    ...(current ?? {}),
    ...patch,
  } as T
}

function mergeProperty(
  current: DatabaseProperty | undefined,
  patch: Record<string, unknown>,
): DatabaseProperty | null {
  if (!current && !patch.property && !patch.id) {
    return null
  }

  const nestedProperty =
    patch.property && typeof patch.property === "object"
      ? (patch.property as DatabaseProperty["property"])
      : undefined

  return mergeRecord(current ?? ({} as DatabaseProperty), {
    ...patch,
    property: nestedProperty
      ? mergeRecord(
          current?.property,
          nestedProperty as Record<string, unknown>,
        )
      : current?.property,
  })
}

function mergeRow(
  current: DatabaseRow | undefined,
  patch: Record<string, unknown>,
): DatabaseRow | null {
  if (!current && !patch.id) {
    return null
  }

  const nestedPage =
    patch.page && typeof patch.page === "object"
      ? (patch.page as DatabaseRow["page"])
      : undefined

  return mergeRecord(current ?? ({} as DatabaseRow), {
    ...patch,
    page: nestedPage
      ? mergeRecord(current?.page, nestedPage as Record<string, unknown>)
      : current?.page,
  })
}

function findMatchingOptimisticRowIndex(
  rows: DatabaseRow[],
  patch: Record<string, unknown>,
) {
  if (
    typeof patch.pageId !== "string" ||
    typeof patch.position !== "number"
  ) {
    return -1
  }

  const optimisticRows = rows
    .map((row, index) => ({ index, row }))
    .filter(({ row }) => row.id.startsWith("optimistic-row-"))
  const exactPageMatches = optimisticRows.filter(
    ({ row }) => row.pageId === patch.pageId,
  )

  if (exactPageMatches.length === 1) {
    return exactPageMatches[0]!.index
  }

  const patchPage =
    patch.page && typeof patch.page === "object"
      ? (patch.page as Record<string, unknown>)
      : null
  const patchPageName =
    typeof patchPage?.name === "string" ? patchPage.name : null

  if (!patchPageName) {
    return -1
  }

  const positionalMatches = optimisticRows.filter(
    ({ row }) =>
      row.position === patch.position && row.page.name === patchPageName,
  )

  return positionalMatches.length === 1 ? positionalMatches[0]!.index : -1
}

export function applyDatabaseDelta(
  payload: DatabasePayload,
  delta: DatabaseDelta,
): DatabasePayload {
  let next = payload
  const optimisticValueOverrides: Array<{
    pageId: string
    propertyId: string
    value: unknown
  }> = []

  if (delta.database) {
    next = {
      ...next,
      database: mergeRecord(next.database, delta.database),
    }
  }

  if (delta.properties?.length) {
    const properties = [...next.properties]

    for (const patch of delta.properties) {
      const id = typeof patch.id === "string" ? patch.id : null

      if (!id) {
        continue
      }

      const index = properties.findIndex((property) => property.id === id)
      const merged = mergeProperty(
        index >= 0 ? properties[index] : undefined,
        patch,
      )

      if (!merged) {
        continue
      }

      if (index >= 0) {
        properties[index] = merged
      } else {
        properties.push(merged)
      }
    }

    next = {
      ...next,
      properties: properties.sort(
        (left, right) => left.position - right.position,
      ),
    }
  }

  if (delta.removedPropertyIds?.length) {
    const removed = new Set(delta.removedPropertyIds)

    next = {
      ...next,
      properties: next.properties.filter(
        (property) => !removed.has(property.id),
      ),
    }
  }

  if (delta.views?.length) {
    const views = [...next.views]

    for (const patch of delta.views) {
      const id = typeof patch.id === "string" ? patch.id : null

      if (!id) {
        continue
      }

      const index = views.findIndex((view) => view.id === id)

      if (index >= 0) {
        views[index] = mergeRecord(views[index], patch)
      } else {
        views.push(mergeRecord({} as (typeof views)[number], patch))
      }
    }

    next = {
      ...next,
      views: views.sort((left, right) => left.position - right.position),
    }
  }

  if (delta.removedViewIds?.length) {
    const removed = new Set(delta.removedViewIds)

    next = {
      ...next,
      views: next.views.filter((view) => !removed.has(view.id)),
    }
  }

  if (delta.rows?.length) {
    const rows = [...next.rows]
    let addedRowCount = 0

    for (const patch of delta.rows) {
      const id = typeof patch.id === "string" ? patch.id : null

      if (!id) {
        continue
      }

      let index = rows.findIndex((row) => row.id === id)
      if (index < 0) {
        index = findMatchingOptimisticRowIndex(rows, patch)

        if (index >= 0 && typeof patch.pageId === "string") {
          const optimisticPageId = rows[index]!.pageId

          next = {
            ...next,
            values: next.values.map((value) => {
              if (value.pageId !== optimisticPageId) {
                return value
              }

              optimisticValueOverrides.push({
                pageId: patch.pageId as string,
                propertyId: value.propertyId,
                value: value.value,
              })

              return { ...value, pageId: patch.pageId as string }
            }),
          }
        }
      }
      const merged = mergeRow(index >= 0 ? rows[index] : undefined, patch)

      if (!merged) {
        continue
      }

      if (index >= 0) {
        rows[index] = merged
      } else {
        rows.push(merged)
        addedRowCount += 1
      }
    }

    next = {
      ...next,
      rowCount:
        next.rowCount === undefined ? undefined : next.rowCount + addedRowCount,
      rows: rows.sort((left, right) => left.position - right.position),
    }
  }

  if (delta.removedRowIds?.length) {
    const removed = new Set(delta.removedRowIds)
    const removedRows = next.rows.filter((row) => removed.has(row.id))
    const removedPageIds = new Set(removedRows.map((row) => row.pageId))

    next = {
      ...next,
      rowCount:
        next.rowCount === undefined
          ? undefined
          : Math.max(0, next.rowCount - removedRows.length),
      rows: next.rows.filter((row) => !removed.has(row.id)),
      values: next.values.filter((value) => !removedPageIds.has(value.pageId)),
    }
  }

  if (delta.values?.length) {
    const values = [...next.values]

    for (const patch of delta.values) {
      const index = values.findIndex(
        (value) =>
          value.pageId === patch.pageId &&
          value.propertyId === patch.propertyId,
      )
      const merged = {
        ...(index >= 0 ? values[index] : {}),
        ...patch,
        createdAt:
          patch.createdAt ??
          (index >= 0 ? values[index]?.createdAt : undefined) ??
          new Date().toISOString(),
        id:
          patch.id ??
          (index >= 0 ? values[index]?.id : undefined) ??
          crypto.randomUUID(),
      }

      if (index >= 0) {
        values[index] = merged
      } else {
        values.push(merged)
      }
    }

    next = {
      ...next,
      values,
    }
  }

  if (optimisticValueOverrides.length) {
    const values = [...next.values]

    for (const override of optimisticValueOverrides) {
      const index = values.findIndex(
        (value) =>
          value.pageId === override.pageId &&
          value.propertyId === override.propertyId,
      )

      if (index >= 0) {
        values[index] = { ...values[index], value: override.value }
      }
    }

    next = { ...next, values }
  }

  return next
}
