import type { DatabaseViewData } from "../views/model/database-controller-state"

import {
  toStringArray,
  type DatabasePropertyValue,
} from "../schema/property-values"
import { type NewRowSetup } from "./row-plans"
import type { DatabaseRowMutations } from "./mutation-adapters"

export function createAddDatabaseRowMutation({
  addRow,
  databaseId,
  editable,
  hostDatabaseId,
  viewData,
  updateValue,
}: {
  addRow: DatabaseRowMutations["addRow"]
  databaseId: string | null | undefined
  editable: boolean
  hostDatabaseId?: string | null
  viewData: DatabaseViewData | null | undefined
  updateValue: DatabaseRowMutations["updateValue"]
}) {
  return ({ parentRelation, propertyValues, title }: NewRowSetup) => {
    if (!editable || !databaseId) return

    const uniquePropertyValues = new Map(
      propertyValues.map((propertyValue) => [
        propertyValue.propertyId,
        propertyValue,
      ]),
    )

    addRow.mutate(
      {
        databaseId,
        ...(hostDatabaseId ? { hostDatabaseId } : {}),
        ...(uniquePropertyValues.size > 0
          ? { initialValues: [...uniquePropertyValues.values()] }
          : {}),
        title,
      },
      {
      onSuccess: (addedItem) => {
        if (!parentRelation) return

        const currentValue = viewData?.records
          .flatMap((record) => Object.values(record.valuesByPropertyId))
          .find(
            (value) =>
              value.pageId === parentRelation.parentRow.pageId &&
              value.propertyId === parentRelation.subItemPropertyId,
          )?.value
          const nextSubItemPageIds = [
            ...new Set([
              ...toStringArray(currentValue as DatabasePropertyValue),
              addedItem.pageId,
            ]),
          ]

          updateValue.mutate({
            databaseId,
            ...(hostDatabaseId ? { hostDatabaseId } : {}),
            propertyId: parentRelation.subItemPropertyId,
            rowId: parentRelation.parentRow.id,
            value: nextSubItemPageIds,
          })
        },
      },
    )
  }
}
