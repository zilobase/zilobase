import type { DatabasePropertyValue } from "../utils"

export function getRawDatabaseGroupValue(value: DatabasePropertyValue) {
  return Array.isArray(value) ? (value[0] ?? "") : value
}

export function getDatabaseGroupMoveValue({
  currentValue,
  propertyType,
  sourceGroupValue,
  targetGroupValue,
}: {
  currentValue: DatabasePropertyValue
  propertyType: string
  sourceGroupValue: string
  targetGroupValue: string
}): DatabasePropertyValue {
  if (sourceGroupValue === targetGroupValue) {
    return currentValue
  }

  if (propertyType !== "multi_select") {
    return targetGroupValue
  }

  if (!targetGroupValue) {
    return []
  }

  const currentValues = Array.isArray(currentValue)
    ? currentValue
    : currentValue
      ? [currentValue]
      : []
  const nextValues =
    sourceGroupValue && currentValues.includes(sourceGroupValue)
      ? currentValues.map((value) =>
          value === sourceGroupValue ? targetGroupValue : value
        )
      : [...currentValues, targetGroupValue]

  return nextValues.filter(
    (value, index, values) => values.indexOf(value) === index
  )
}
