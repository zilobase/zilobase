import type { DatabasePayload } from "@zilobase/features/databases"

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
  payload,
  updateValue,
}: {
  addRow: DatabaseRowMutations["addRow"]
  databaseId: string | null | undefined
  editable: boolean
  hostDatabaseId?: string | null
  payload: DatabasePayload | null | undefined
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
          ? { optimisticValues: [...uniquePropertyValues.values()] }
          : {}),
        title,
      },
      {
        onSuccess: (addedItem) => {
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
