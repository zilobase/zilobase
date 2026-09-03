import type { DatabaseProperty } from "@zilobase/features/databases"

import type { DatabasePropertyValue } from "../../../core/database-property-values"
import { getFormulaExpression } from "../model/formula-config"
import {
  evaluateDatabaseFormula,
  type DatabaseFormulaRow,
} from "../runtime/formula-evaluator"
import { formatFormulaValue } from "../formatting/formula-formatters"

export function DatabaseFormulaValue({
  currentPropertyId,
  properties,
  propertyConfig,
  propertyValuesByKey,
  row,
  titlePropertyLabel,
}: {
  currentPropertyId: string
  properties: DatabaseProperty[]
  propertyConfig?: unknown
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  row: DatabaseFormulaRow
  titlePropertyLabel: string
}) {
  const expression = getFormulaExpression(propertyConfig)

  if (!expression.trim()) {
    return (
      <span className="database-input-cell-trigger text-content-secondary">
        Configure formula
      </span>
    )
  }

  const result = evaluateDatabaseFormula({
    currentPropertyId,
    expression,
    properties,
    propertyValuesByKey,
    row,
    titlePropertyLabel,
  })

  if (!result.ok) {
    return (
      <span
        className="database-input-cell-trigger text-action-danger-text"
        title={result.error}
      >
        Formula error
      </span>
    )
  }

  const value = formatFormulaValue(result.value)

  return (
    <span className="database-input-cell-trigger">
      {value || <span className="text-content-secondary">Empty</span>}
    </span>
  )
}
