import { type FormEvent } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import type { DatabaseProperty } from "@notelab/features/databases"

import { defaultStatusOptions } from "../constants"
import { DatabasePropertyButton } from "../database-property-button"
import { DatabasePropertyDate } from "../database-property-date"
import { DatabasePropertyFiles } from "../database-property-files"
import { DatabasePropertyInput } from "../database-property-input"
import { DatabasePropertySelect } from "../database-property-select"
import { DatabaseFormulaValue } from "../formula"
import { type DatabasePropertyValue } from "../utils"
import { formatDatabaseDateValue } from "./database-date-config"
import { getPersonLimit } from "./database-view-config"
import { type DatabasePropertyListItem } from "../kanban/database-kanban-config"

type DatabaseRow = {
  createdAt: string
  id: string
  page: {
    createdAt?: string
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
  draftValues: Record<string, DatabasePropertyValue>
  editable: boolean
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  onActiveValueChange: (key: string | null) => void
  onDraftValuesChange: (
    updater: (
      drafts: Record<string, DatabasePropertyValue>
    ) => Record<string, DatabasePropertyValue>
  ) => void
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
  value: DatabasePropertyValue
}

function isReadOnlyTimeProperty(type: string) {
  return type === "created_time" || type === "edited_time"
}

function getReadOnlyTimePropertyValue(
  row: DatabaseRow,
  config: unknown,
  type: string
) {
  const value =
    type === "created_time"
      ? row.page.createdAt ?? row.createdAt
      : row.page.updatedAt ?? row.updatedAt

  return formatDatabaseDateValue(value, config)
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
  draftValues,
  editable,
  properties,
  propertyValuesByKey,
  onActiveValueChange,
  onDraftValuesChange,
  onPropertyConfigChange,
  onSaveValue,
  persistedValue,
  personOptions,
  property,
  row,
  titlePropertyLabel,
  value,
}: DatabasePropertyValueProps) {
  const workspaceProperty = property.property
  const key = `${row.pageId}:${workspaceProperty.id}`
  const isSelectProperty =
    workspaceProperty.type === "select" ||
    workspaceProperty.type === "multi_select" ||
    workspaceProperty.type === "status"
  const isCheckboxProperty = workspaceProperty.type === "checkbox"
  const isButtonProperty = workspaceProperty.type === "button"
  const isDateProperty = workspaceProperty.type === "date"
  const isFilesProperty = workspaceProperty.type === "files"
  const isFormulaProperty = workspaceProperty.type === "formula"
  const isPersonProperty = workspaceProperty.type === "person"
  const isReadOnlyTimeCell = isReadOnlyTimeProperty(workspaceProperty.type)
  const isMultiSelectProperty =
    workspaceProperty.type === "multi_select" ||
    (isPersonProperty && getPersonLimit(workspaceProperty.config) !== "one_person")
  const displayValue =
    workspaceProperty.type === "status" && !persistedValue
      ? defaultStatusOptions[0]?.name ?? "Not started"
      : value
  const content = isReadOnlyTimeCell ? (
    <span className="database-input-cell-trigger">
      {getReadOnlyTimePropertyValue(
        row,
        workspaceProperty.config,
        workspaceProperty.type
      ) || <span className="text-muted-foreground">Empty</span>}
    </span>
  ) : isCheckboxProperty ? (
    <div className="database-checkbox-cell">
      <Checkbox
        aria-label={`${workspaceProperty.name} value`}
        checked={value === "true"}
        disabled={!editable}
        onCheckedChange={(nextChecked) =>
          onSaveValue(
            row.id,
            workspaceProperty.id,
            workspaceProperty.type,
            persistedValue,
            nextChecked === true ? "true" : "false"
          )
        }
      />
    </div>
  ) : isButtonProperty ? (
    <DatabasePropertyButton
      className="px-3 py-1"
      editable={editable}
      label={workspaceProperty.name}
      value={value}
    />
  ) : isFormulaProperty ? (
    <DatabaseFormulaValue
      currentPropertyId={workspaceProperty.id}
      properties={properties}
      propertyConfig={workspaceProperty.config}
      propertyValuesByKey={propertyValuesByKey}
      row={row}
      titlePropertyLabel={titlePropertyLabel}
    />
  ) : isSelectProperty || isPersonProperty ? (
    <DatabasePropertySelect
      allowCreate={!isPersonProperty}
      editable={editable && !disabledSelect}
      defaultOptions={
        workspaceProperty.type === "status"
          ? defaultStatusOptions
          : isPersonProperty
            ? personOptions
            : undefined
      }
      label={workspaceProperty.name}
      multiple={isMultiSelectProperty}
      onSelect={(optionValue) =>
        onSaveValue(
          row.id,
          workspaceProperty.id,
          workspaceProperty.type,
          persistedValue,
          optionValue
        )
      }
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      propertyConfig={workspaceProperty.config}
      showStatusDot={workspaceProperty.type === "status"}
      value={displayValue}
      valueKey={isPersonProperty ? "id" : "name"}
    />
  ) : isDateProperty ? (
    <DatabasePropertyDate
      editable={editable}
      label={workspaceProperty.name}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      onSelect={(nextValue) =>
        onSaveValue(
          row.id,
          workspaceProperty.id,
          workspaceProperty.type,
          persistedValue,
          nextValue
        )
      }
      propertyConfig={workspaceProperty.config}
      value={value}
    />
  ) : isFilesProperty ? (
    <DatabasePropertyFiles
      editable={editable}
      label={workspaceProperty.name}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onSelect={(nextValue) =>
        onSaveValue(
          row.id,
          workspaceProperty.id,
          workspaceProperty.type,
          persistedValue,
          nextValue
        )
      }
      propertyConfig={workspaceProperty.config}
      value={value}
    />
  ) : (
    <DatabasePropertyInput
      editable={editable}
      label={workspaceProperty.name}
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
          workspaceProperty.id,
          workspaceProperty.type,
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
      propertyConfig={workspaceProperty.config}
      type={workspaceProperty.type}
      value={Array.isArray(value) ? value.join(", ") : value}
      wrapContent
    />
  )

  return content
}
