import { listRowDragAttributes, listRowCompletionLabel } from "./list-row-presentation";
import { useMemo } from "react"
import { GripVertical, Plus } from "@/shared/components/icons"

import { Checkbox } from "@/shared/ui/checkbox"
import { DatabasePageLink } from "../../../interactions/database-page-link"
import { DatabasePropertyValue } from "../../../properties/editors/database-property-value"
import { useDatabaseActionsContext, useDatabaseDataContext, useDatabaseUiContext } from "../../state/database-view-context"
import { DatabaseRecordWindowControl } from "../../components/database-record-window-control"
import { useDatabaseListRowDrag } from "../controller/use-database-list-row-drag"

export function DatabaseListView() {
  const {
    addDraggedPageRow,
    addDatabaseRow,
    isRowComplete,
    onOpenPage,
    savePropertyValue,
    setRowComplete,
    updateDatabasePropertyConfig,
  } = useDatabaseActionsContext()
  const {
    activeDatabaseFilters,
    activeDatabaseSorts,
    databaseId,
    editable,
    hostDatabaseId,
    items,
    personOptions,
    properties,
    propertyValuesByKey,
    sortedItems,
    visibleProperties,
  } = useDatabaseDataContext()
  const {
    layoutSettings,
    newRowLabel,
    showPageIconInTitle,
    titlePropertyLabel,
  } = useDatabaseUiContext()
  const rows = useMemo(() => {
    const rowsById = new Map(items.map((row) => [row.id, row]))

    return sortedItems.flatMap((item) => {
      const row = rowsById.get(item.id)
      return row ? [row] : []
    })
  }, [items, sortedItems])
  const canReorderRows = editable && activeDatabaseSorts.length === 0
  const rowDrag = useDatabaseListRowDrag({
    addDraggedPageRow,
    databaseId,
    editable,
    hasActiveFilters: activeDatabaseFilters.length > 0,
    hostDatabaseId,
    items,
    reorderEnabled: canReorderRows,
    visibleRows: rows,
  })
  return (
    <div
      className="database-list-view"
      data-wrap-content={layoutSettings.wrapAllContent ? "true" : undefined}
      onDragLeave={rowDrag.leave}
    >
      <div className="database-list-rows">
        {rows.map((row, rowIndex) => (
          <div
            className="database-list-row"
            {...listRowDragAttributes(row.id, rowIndex, rows.length, rowDrag)}
            key={row.id}
            onDragOver={(event) => rowDrag.updateDropTarget(event, rowIndex)}
            onDrop={rowDrag.drop}
          >
            {editable ? (
              <button
                aria-label={`Drag ${row.page.name || "row"}`}
                className="database-list-drag-handle"
                draggable={editable}
                onDragEnd={rowDrag.clearDrag}
                onDragStart={(event) => rowDrag.startDrag(event, row.id)}
                title={
                  canReorderRows
                    ? "Drag page"
                    : "Drag page. Clear sorting to reorder in this view"
                }
                type="button"
              >
                <GripVertical />
              </button>
            ) : null}
            {isRowComplete && setRowComplete ? (
              <Checkbox
                aria-label={listRowCompletionLabel(row.page.name, isRowComplete(row))}
                checked={isRowComplete(row)}
                className="database-list-row-checkbox"
                disabled={!editable}
                onCheckedChange={(checked) =>
                  setRowComplete(row, checked === true)
                }
              />
            ) : null}
            <div className="database-list-title">
              <DatabasePageLink
                onOpen={onOpenPage}
                openMode="title"
                pageId={row.pageId}
                pageSummary={row.page}
                showPageIcon={showPageIconInTitle}
              />
            </div>
            <div className="database-list-properties">
              {visibleProperties.map((property) => {
                const key = `${row.pageId}:${property.property.id}`
                const persistedValue = propertyValuesByKey[key] ?? ""

                return (
                  <div
                    className="database-list-property"
                    key={`${row.id}:${property.id}`}
                    title={property.property.name}
                  >
                    <DatabasePropertyValue
                      editable={editable}
                      properties={properties}
                      propertyValuesByKey={propertyValuesByKey}
                      onPropertyConfigChange={(databasePropertyId, config) =>
                        updateDatabasePropertyConfig(databasePropertyId, config)
                      }
                      onSaveValue={savePropertyValue}
                      persistedValue={persistedValue}
                      personOptions={personOptions}
                      property={property}
                      row={row}
                      titlePropertyLabel={titlePropertyLabel}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <DatabaseRecordWindowControl automatic />
        {editable ? (
          <button
            className="database-list-new-row"
            disabled={!databaseId}
            onClick={() => addDatabaseRow()}
            type="button"
          >
            <Plus />
            <span>{newRowLabel ?? "New page"}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
