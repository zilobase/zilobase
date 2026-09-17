import { createCellEditHistoryAction } from "../../../interactions/cell-edit-history"
import { useCallback, useMemo, useState } from "react";

import { toast } from "sonner"

import type { useUndoHistory } from "@/shared/shortcuts"

import {
  type DatabasePropertyValue as DatabasePropertyValueType,
} from "../../../schema/property-values";

import { areSerializedPropertyValuesEqual } from "../../../interactions/database-item-utils";

import { type DatabaseCellFillHistoryChange } from "../../../interactions/database-cell-fill";

import { type DatabasePropertyListItem } from "../../kanban/model/database-kanban-config";
import { getSharedDatabaseSelectionValue } from "../model/database-table-selection"
import { type TableRow } from "../model/database-table-model";

import type { MutableRefObject } from "react"
import type { DatabaseViewProviderValue } from "../../state/database-view-context"

export function useTableSelection({
  rows,
  propertyValuesByKey,
  propertyValuesByKeyRef,
  savePropertyValue,
  undoHistory,
}: {
  rows: TableRow[]
  propertyValuesByKey: Record<string, DatabasePropertyValueType>
  propertyValuesByKeyRef: MutableRefObject<Record<string, DatabasePropertyValueType>>
  savePropertyValue: DatabaseViewProviderValue["savePropertyValue"]
  undoHistory: ReturnType<typeof useUndoHistory>
}) {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    () => new Set()
  )
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedRowIds.has(row.id)),
    [rows, selectedRowIds]
  )
  const getSelectionValue = useCallback(
    (property: DatabasePropertyListItem) => {
      const pageProperty = property.property
      const values = selectedRows.map(
        (row) => propertyValuesByKey[`${row.pageId}:${pageProperty.id}`] ?? ""
      )

      return getSharedDatabaseSelectionValue(values, (left, right) =>
        areSerializedPropertyValuesEqual(pageProperty.type, left, right)
      )
    },
    [propertyValuesByKey, selectedRows]
  )
  const copySelectedRowLinks = useCallback(() => {
    const links = selectedRows.map(
      (row) => `${window.location.origin}/p/${row.pageId}`
    )

    void navigator.clipboard
      .writeText(links.join("\n"))
      .then(() =>
        toast.success(
          `Copied ${links.length} selected page ${links.length === 1 ? "link" : "links"}`
        )
      )
      .catch(() => toast.error("Couldn't copy selected page links"))
  }, [selectedRows])
  const saveSelectedPropertyValue = useCallback(
    (
      property: DatabasePropertyListItem,
      nextValue: DatabasePropertyValueType
    ) => {
      const pageProperty = property.property
      const historyChanges: DatabaseCellFillHistoryChange[] = []

      undoHistory.runWithoutRecording(() => {
        for (const row of selectedRows) {
          const currentValue =
            propertyValuesByKeyRef.current[
              `${row.pageId}:${pageProperty.id}`
            ] ?? ""

          if (
            areSerializedPropertyValuesEqual(
              pageProperty.type,
              currentValue,
              nextValue
            )
          ) {
            continue
          }

          const savedValue = Array.isArray(nextValue)
            ? [...nextValue]
            : nextValue

          historyChanges.push({
            nextValue: savedValue,
            pageId: row.pageId,
            previousValue: Array.isArray(currentValue)
              ? [...currentValue]
              : currentValue,
            propertyId: pageProperty.id,
            propertyType: pageProperty.type,
            rowId: row.id,
          })

          savePropertyValue(
            row.id,
            pageProperty.id,
            pageProperty.type,
            currentValue,
            savedValue
          )
        }
      })

      if (historyChanges.length === 0) {
        return
      }

      undoHistory.pushAction(createCellEditHistoryAction({
        label: `Update ${pageProperty.name} for selected rows`,
        changes: historyChanges,
        readValues: () => propertyValuesByKeyRef.current,
        savePropertyValue,
        runWithoutRecording: undoHistory.runWithoutRecording,
      }))
    },
    [savePropertyValue, selectedRows, undoHistory]
  )
  const toggleSelectedRow = (rowId: string, checked: boolean) => {
    setSelectedRowIds((current) => {
      const next = new Set(current)

      if (checked) {
        next.add(rowId)
      } else {
        next.delete(rowId)
      }

      return next
    })
  }
  return {
    selectedRowIds,
    setSelectedRowIds,
    selectedRows,
    getSelectionValue,
    copySelectedRowLinks,
    saveSelectedPropertyValue,
    toggleSelectedRow,
  }
}
