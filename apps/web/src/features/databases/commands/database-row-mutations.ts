import type { DatabasePayload, DatabaseRow } from "@zilobase/features/databases"

import {
  toStringArray,
  type DatabasePropertyValue,
} from "../core/database-property-values"
import { findAddedDatabaseRow, type NewRowSetup } from "./database-row-plans"
import type { DatabaseRowMutations } from "./database-mutation-adapters"

export function createAddDatabaseRowMutation({
  addRow,
  databaseId,
  editable,
  items,
  payload,
  updateValue,
}: {
  addRow: DatabaseRowMutations["addRow"]
  databaseId: string | null | undefined
  editable: boolean
  items: DatabaseRow[]
  payload: DatabasePayload | null | undefined
  updateValue: DatabaseRowMutations["updateValue"]
}) {
  return ({ parentRelation, propertyValues, title }: NewRowSetup) => {
    if (!editable || !databaseId || addRow.isPending) return

    const existingItemIds = new Set(items.map((row) => row.id))
    const uniquePropertyValues = new Map(
      propertyValues.map((propertyValue) => [
        propertyValue.propertyId,
        propertyValue,
      ]),
    )

    addRow.mutate(
      {
        databaseId,
        ...(uniquePropertyValues.size > 0
          ? { optimisticValues: [...uniquePropertyValues.values()] }
          : {}),
        title,
      },
      {
        onSuccess: (nextPayload) => {
          const addedItem = findAddedDatabaseRow(
            nextPayload.rows,
            existingItemIds,
          )
          if (!addedItem) return

          for (const propertyValue of uniquePropertyValues.values()) {
            updateValue.mutate({
              databaseId,
              propertyId: propertyValue.propertyId,
              rowId: addedItem.id,
              value: propertyValue.value,
            })
          }

          if (!parentRelation) return

          const currentValue = payload?.values.find(
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
            propertyId: parentRelation.subItemPropertyId,
            rowId: parentRelation.parentRow.id,
            value: nextSubItemPageIds,
          })
        },
      },
    )
  }
}
