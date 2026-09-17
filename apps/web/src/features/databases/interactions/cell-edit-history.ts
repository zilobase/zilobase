import {
  getRedoableDatabaseCellFillChanges,
  getUndoableDatabaseCellFillChanges,
  type DatabaseCellFillHistoryChange,
} from "./database-cell-fill"
import type { DatabasePropertyValue } from "../schema/property-values"

export function createCellEditHistoryAction({
  label, changes, readValues, savePropertyValue, runWithoutRecording,
}: {
  label: string
  changes: DatabaseCellFillHistoryChange[]
  readValues: () => Record<string, DatabasePropertyValue>
  savePropertyValue: (rowId: string, propertyId: string, propertyType: string, currentValue: DatabasePropertyValue, nextValue: DatabasePropertyValue) => void
  runWithoutRecording: (callback: () => void) => void
}) {
  let appliedChanges = changes
  let undoneChanges: DatabaseCellFillHistoryChange[] = []
  const applyChanges = (changes: DatabaseCellFillHistoryChange[], value: "nextValue" | "previousValue") => {
    for (const change of changes) {
      const currentValue = readValues()[`${change.pageId}:${change.propertyId}`] ?? ""
      savePropertyValue(change.rowId, change.propertyId, change.propertyType, currentValue, change[value])
    }
  }
  return {
    label,
    redo: () => {
      const redoableChanges = getRedoableDatabaseCellFillChanges(undoneChanges, readValues())
      applyChanges(redoableChanges, "nextValue")
      appliedChanges = redoableChanges
      undoneChanges = []
      return redoableChanges.length > 0
    },
    undo: () => {
      const undoableChanges = getUndoableDatabaseCellFillChanges(appliedChanges, readValues())
      runWithoutRecording(() => applyChanges(undoableChanges, "previousValue"))
      appliedChanges = []
      undoneChanges = undoableChanges
      return undoableChanges.length > 0
    },
  }
}
