import type { FormulaValue, FormulaValueType } from "../model/formula-types"

export function formatFormulaValue(value: FormulaValue): string {
  if (value === null) {
    return ""
  }

  if (Array.isArray(value)) {
    return value.map(formatFormulaValue).filter(Boolean).join(", ")
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return ""
    }

    return value.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  return String(value)
}

export function getFormulaValueType(value: FormulaValue): FormulaValueType {
  if (value === null || value === "") {
    return "empty"
  }

  if (Array.isArray(value)) {
    return "list"
  }

  if (value instanceof Date) {
    return "date"
  }

  if (typeof value === "boolean") {
    return "boolean"
  }

  if (typeof value === "number") {
    return "number"
  }

  return "text"
}
