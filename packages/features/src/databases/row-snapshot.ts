import type { DatabaseProperty } from "./queries"
import {
  escapeFormulaString,
  evaluateDatabaseFormula,
  type DatabaseFormulaEvaluationResult,
  type DatabaseFormulaPropertyValue,
  type DatabaseFormulaRow,
  type FormulaRuntimeOptions,
  type FormulaValue,
} from "./formula"

export type DatabaseRowSnapshotSource = {
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabaseFormulaPropertyValue>
  row: DatabaseFormulaRow
}

export type DatabaseRowSnapshot = {
  computed: Record<string, DatabaseFormulaEvaluationResult>
  pageId: string
  relations: Record<string, DatabaseRowSnapshot[]>
  rowId: string
  title: string
  values: Record<string, FormulaValue>
}

export type DatabaseRowSnapshotOptions = FormulaRuntimeOptions & {
  maxRelatedRows?: number
  maxRelationDepth?: number
  resolveRelatedPage?: (pageId: string) => DatabaseRowSnapshotSource | null
}

type SnapshotState = {
  maxRelatedRows: number
  maxRelationDepth: number
  relatedRows: number
  visitedPageIds: Set<string>
}

/**
 * Builds the immutable row input used by trigger and saved-view evaluation.
 * The caller supplies a revision-consistent relation resolver; traversal is
 * cycle-safe and bounded independently from the database adapter.
 */
export function createDatabaseRowSnapshot(
  source: DatabaseRowSnapshotSource,
  options: DatabaseRowSnapshotOptions = {},
): DatabaseRowSnapshot {
  const state: SnapshotState = {
    maxRelatedRows: clamp(options.maxRelatedRows ?? 100, 0, 1_000),
    maxRelationDepth: clamp(options.maxRelationDepth ?? 2, 0, 5),
    relatedRows: 0,
    visitedPageIds: new Set(),
  }

  return createSnapshot(source, options, state, 0)
}

function createSnapshot(
  source: DatabaseRowSnapshotSource,
  options: DatabaseRowSnapshotOptions,
  state: SnapshotState,
  depth: number,
): DatabaseRowSnapshot {
  state.visitedPageIds.add(source.row.pageId)
  const values: Record<string, FormulaValue> = {}
  const computed: Record<string, DatabaseFormulaEvaluationResult> = {}
  const relations: Record<string, DatabaseRowSnapshot[]> = {}

  for (const property of source.properties) {
    const result = evaluateDatabaseFormula({
      expression: `prop("${escapeFormulaString(property.property.name)}")`,
      locale: options.locale,
      now: options.now,
      properties: source.properties,
      propertyValuesByKey: source.propertyValuesByKey,
      row: source.row,
      timezone: options.timezone,
      titlePropertyLabel: "Name",
    })
    computed[property.property.id] = result
    values[property.property.id] = result.ok ? result.value : null

    if (
      property.property.type !== "relation" ||
      depth >= state.maxRelationDepth ||
      !options.resolveRelatedPage
    ) {
      continue
    }

    const raw = source.propertyValuesByKey[
      `${source.row.pageId}:${property.property.id}`
    ]
    const pageIds = Array.isArray(raw) ? raw : raw ? [raw] : []
    const related: DatabaseRowSnapshot[] = []
    for (const pageId of pageIds) {
      if (
        state.relatedRows >= state.maxRelatedRows ||
        state.visitedPageIds.has(pageId)
      ) {
        continue
      }
      const relatedSource = options.resolveRelatedPage(pageId)
      if (!relatedSource) continue

      state.relatedRows += 1
      related.push(createSnapshot(relatedSource, options, state, depth + 1))
    }
    relations[property.property.id] = related
  }

  return {
    computed,
    pageId: source.row.pageId,
    relations,
    rowId: source.row.id,
    title: source.row.page.name ?? "",
    values,
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}
