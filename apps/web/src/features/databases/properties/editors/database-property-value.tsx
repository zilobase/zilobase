import { useCallback, useEffect, useRef, type FormEvent } from "react"

import { Checkbox } from "@/shared/ui/checkbox"
import {
  type DatabaseProperty,
} from "@zilobase/features/databases"

import {
  defaultStatusOption,
  defaultStatusOptions,
} from "../../core/database-property-types"
import { DatabasePropertyButton } from "./database-property-button"
import { DatabasePropertyDate } from "./database-property-date"
import { DatabasePropertyFiles } from "./database-property-files"
import { DatabasePropertyInput } from "./database-property-input"
import { DatabasePropertySelect } from "./database-property-select"
import { getDatabasePropertyCellKind } from "../../core/database-property-types"
import { DatabaseFormulaValue } from "../formula/view/database-formula-value"
import { type DatabasePropertyValue } from "../../core/database-property-values"
import { formatDatabaseDateValue } from "../model/database-date-config"
import {
  getReadOnlyTimePropertyRawValue,
} from "../model/read-only-time-property"
import { useDatabaseActionsContext, useDatabaseDataContext, useDatabaseUiContext } from "../../views/model/database-view-context"
import {
  useDatabaseCellDraft,
  useSetActiveDatabaseCell,
  useUpdateDatabaseCellDraft,
} from "../../views/model/database-cell-state"
import { getPersonLimit, getPropertyWrapContent } from "../../views/model/database-view-config"
import { type DatabasePropertyListItem } from "../../views/kanban/model/database-kanban-config"
import { DatabaseRelationPropertyValue, DatabaseRollupPropertyValue } from "./database-derived-property-value"
export { DatabaseRelationPropertyValue } from "./database-derived-property-value"

type DatabaseRow = {
  createdAt: string
  id: string
  page: {
    createdAt?: string
    id?: string
    metadata?: unknown
    name?: string
    updatedAt?: string
  }
  pageId: string
  updatedAt: string
}

type PersonOption = {
  id: string
  name: string
  suffix?: string
}

type DatabasePropertyValueProps = {
  disabledSelect?: boolean
  editable: boolean
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  onPropertyConfigChange: (
    databasePropertyId: string,
    config: unknown
  ) => Promise<unknown>
  onSaveValue: (
    rowId: string,
    propertyId: string,
    propertyType: string,
    currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue
  ) => void
  persistedValue: DatabasePropertyValue
  personOptions: PersonOption[]
  property: DatabasePropertyListItem
  row: DatabaseRow
  titlePropertyLabel: string
  wrapContent?: boolean
}

function formatReadOnlyTimePropertyValue(
  row: DatabaseRow,
  config: unknown,
  type: string
) {
  return formatDatabaseDateValue(
    getReadOnlyTimePropertyRawValue(row, type),
    config
  )
}

function resizeCellEditor(element: HTMLTextAreaElement) {
  element.style.height = "auto"
  element.style.height = `${element.scrollHeight}px`
}

function handleCellInput(event: FormEvent<HTMLTextAreaElement>) {
  resizeCellEditor(event.currentTarget)
}

export function DatabasePropertyValue({
  disabledSelect = false,
  editable,
  properties,
  propertyValuesByKey,
  onPropertyConfigChange,
  onSaveValue,
  persistedValue,
  personOptions,
  property,
  row,
  titlePropertyLabel,
  wrapContent: wrapContentOverride,
}: DatabasePropertyValueProps) {
  const { layoutSettings } = useDatabaseUiContext()
  const {
    databaseId,
    databaseWorkspaceId,
    hostDatabaseWorkspaceId,
    workspaceId,
  } = useDatabaseDataContext()
  const { onOpenPage } = useDatabaseActionsContext()
  const pageProperty = property.property
  const key = `${row.pageId}:${pageProperty.id}`
  const draftValue = useDatabaseCellDraft(key)
  const setActiveCell = useSetActiveDatabaseCell()
  const updateDraft = useUpdateDatabaseCellDraft()
  const previousPropertyTypeRef = useRef(pageProperty.type)

  useEffect(() => {
    if (previousPropertyTypeRef.current === pageProperty.type) {
      return
    }

    previousPropertyTypeRef.current = pageProperty.type
    updateDraft(key, () => undefined)
  }, [key, pageProperty.type, updateDraft])

  const draftValues =
    draftValue === undefined ? {} : { [key]: draftValue }
  const value = draftValue ?? persistedValue
  const onActiveValueChange = useCallback(
    (activeKey: string | null) => setActiveCell(activeKey),
    [setActiveCell]
  )
  const onDraftValuesChange = useCallback(
    (
      updater: (
        drafts: Record<string, DatabasePropertyValue>
      ) => Record<string, DatabasePropertyValue>
    ) => {
      updateDraft(key, (currentValue) => {
        const currentDrafts =
          currentValue === undefined ? {} : { [key]: currentValue }

        return updater(currentDrafts)[key]
      })
    },
    [key, updateDraft]
  )
  const cellKind = getDatabasePropertyCellKind(pageProperty.type)
  const isMultiSelectProperty =
    pageProperty.type === "multi_select" ||
    (cellKind === "person" && getPersonLimit(pageProperty.config) !== "one_person")
  const wrapContent =
    wrapContentOverride ??
    (layoutSettings.wrapAllContent ||
      getPropertyWrapContent(pageProperty.config))
  const displayValue =
    pageProperty.type === "status" && !persistedValue
      ? defaultStatusOption.name
      : value
  const content = cellKind === "read_only_time" ? (
    <span className="database-input-cell-trigger">
      {formatReadOnlyTimePropertyValue(
        row,
        pageProperty.config,
        pageProperty.type
      ) || <span className="text-content-secondary">Empty</span>}
    </span>
  ) : cellKind === "checkbox" ? (
    <div className="database-checkbox-cell">
      <Checkbox
        aria-label={`${pageProperty.name} value`}
        checked={value === "true"}
        disabled={!editable}
        onBlur={() => onActiveValueChange(null)}
        onCheckedChange={(nextChecked) =>
          onSaveValue(
            row.id,
            pageProperty.id,
            pageProperty.type,
            persistedValue,
            nextChecked === true ? "true" : "false"
          )
        }
        onFocus={() => onActiveValueChange(key)}
      />
    </div>
  ) : cellKind === "button" ? (
    <DatabasePropertyButton
      className="px-3 py-1"
      editable={editable}
      label={pageProperty.name}
      value={value}
    />
  ) : cellKind === "formula" ? (
    <DatabaseFormulaValue
      currentPropertyId={pageProperty.id}
      properties={properties}
      propertyConfig={pageProperty.config}
      propertyValuesByKey={propertyValuesByKey}
      row={row}
      titlePropertyLabel={titlePropertyLabel}
    />
  ) : cellKind === "select" || cellKind === "person" ? (
    <DatabasePropertySelect
      allowCreate={cellKind !== "person"}
      editable={editable && !disabledSelect}
      defaultOptions={
        pageProperty.type === "status"
          ? defaultStatusOptions
          : cellKind === "person"
            ? personOptions
            : undefined
      }
      label={pageProperty.name}
      multiple={isMultiSelectProperty}
      onSelect={(optionValue) =>
        onSaveValue(
          row.id,
          pageProperty.id,
          pageProperty.type,
          persistedValue,
          optionValue
        )
      }
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      propertyConfig={pageProperty.config}
      showStatusDot={pageProperty.type === "status"}
      value={displayValue}
      valueKey={cellKind === "person" ? "id" : "name"}
    />
  ) : cellKind === "date" ? (
    <DatabasePropertyDate
      editable={editable}
      label={pageProperty.name}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      onSelect={(nextValue) =>
        onSaveValue(
          row.id,
          pageProperty.id,
          pageProperty.type,
          persistedValue,
          nextValue
        )
      }
      propertyConfig={pageProperty.config}
      value={value}
    />
  ) : cellKind === "files" ? (
    <DatabasePropertyFiles
      databaseId={databaseId}
      editable={editable}
      label={pageProperty.name}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onSelect={(nextValue) =>
        onSaveValue(
          row.id,
          pageProperty.id,
          pageProperty.type,
          persistedValue,
          nextValue
        )
      }
      workspaceId={
        workspaceId ?? databaseWorkspaceId ?? hostDatabaseWorkspaceId
      }
      propertyConfig={pageProperty.config}
      value={value}
      pageId={row.pageId}
    />
  ) : cellKind === "relation" ? (
    <DatabaseRelationPropertyValue
      editable={editable}
      label={pageProperty.name}
      onOpen={onOpenPage}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      onSelect={(nextValue) =>
        onSaveValue(
          row.id,
          pageProperty.id,
          pageProperty.type,
          persistedValue,
          nextValue
        )
      }
      propertyConfig={pageProperty.config}
      row={row}
      value={value}
      wrapContent={wrapContent}
    />
  ) : cellKind === "rollup" ? (
    <DatabaseRollupPropertyValue
      databaseId={databaseId}
      editable={editable}
      onOpen={onOpenPage}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      properties={properties}
      propertyConfig={pageProperty.config}
      propertyValuesByKey={propertyValuesByKey}
      row={row}
      wrapContent={wrapContent}
    />
  ) : (
    <DatabasePropertyInput
      editable={editable}
      label={pageProperty.name}
      onActivate={(element) => {
        onActiveValueChange(key)
        resizeCellEditor(element)
      }}
      onChange={(nextValue) =>
        onDraftValuesChange((drafts) => ({
          ...drafts,
          [key]: nextValue,
        }))
      }
      onCommit={() => {
        const nextValue = draftValues[key] ?? persistedValue

        onSaveValue(
          row.id,
          pageProperty.id,
          pageProperty.type,
          persistedValue,
          nextValue
        )
        onDraftValuesChange((drafts) => {
          const nextDrafts = { ...drafts }

          delete nextDrafts[key]

          return nextDrafts
        })
      }}
      onDeactivate={() => onActiveValueChange(null)}
      onInput={handleCellInput}
      propertyConfig={pageProperty.config}
      type={pageProperty.type}
      value={Array.isArray(value) ? value.join(", ") : value}
    />
  )

  return content
}
