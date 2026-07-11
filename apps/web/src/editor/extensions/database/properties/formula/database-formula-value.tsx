import type { DatabaseProperty } from "@notelab/features/databases"

import type { DatabasePropertyValue } from "../../core/utils"
import { getFormulaExpression } from "./formula-config"
import {
  evaluateDatabaseFormula,
  formatFormulaValue,
  type DatabaseFormulaRow,
} from "./formula-engine"

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
      <span className="database-input-cell-trigger text-muted-foreground">
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
        className="database-input-cell-trigger text-destructive"
        title={result.error}
      >
        Formula error
      </span>
    )
  }

  const value = formatFormulaValue(result.value)

  return (
    <span className="database-input-cell-trigger">
      {value || <span className="text-muted-foreground">Empty</span>}
    </span>
  )
}
