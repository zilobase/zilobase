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
import { DatabasePageLink } from "./database-page-link"
import {
  getReadOnlyTimePropertyRawValue,
  isReadOnlyTimeProperty,
} from "./read-only-time-property"
import { useDatabaseViewContext } from "./database-view-context"
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

type RelationPageSummary = {
  iconKind?: "database" | "page"
  id?: string
  metadata?: unknown
  name?: string
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
  const databaseContext = useDatabaseViewContext()
  const pageProperty = property.property
  const key = `${row.pageId}:${pageProperty.id}`
  const isSelectProperty =
    pageProperty.type === "select" ||
    pageProperty.type === "multi_select" ||
    pageProperty.type === "status"
  const isCheckboxProperty = pageProperty.type === "checkbox"
  const isButtonProperty = pageProperty.type === "button"
  const isDateProperty = pageProperty.type === "date"
  const isFilesProperty = pageProperty.type === "files"
  const isFormulaProperty = pageProperty.type === "formula"
  const isPersonProperty = pageProperty.type === "person"
  const isRelationProperty = pageProperty.type === "relation"
  const isReadOnlyTimeCell = isReadOnlyTimeProperty(pageProperty.type)
  const isMultiSelectProperty =
    pageProperty.type === "multi_select" ||
    (isPersonProperty && getPersonLimit(pageProperty.config) !== "one_person")
  const displayValue =
    pageProperty.type === "status" && !persistedValue
      ? defaultStatusOptions[0]?.name ?? "Not started"
      : value
  const content = isReadOnlyTimeCell ? (
    <span className="database-input-cell-trigger">
      {formatReadOnlyTimePropertyValue(
        row,
        pageProperty.config,
        pageProperty.type
      ) || <span className="text-muted-foreground">Empty</span>}
    </span>
  ) : isCheckboxProperty ? (
    <div className="database-checkbox-cell">
      <Checkbox
        aria-label={`${pageProperty.name} value`}
        checked={value === "true"}
        disabled={!editable}
        onCheckedChange={(nextChecked) =>
          onSaveValue(
            row.id,
            pageProperty.id,
            pageProperty.type,
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
      label={pageProperty.name}
      value={value}
    />
  ) : isFormulaProperty ? (
    <DatabaseFormulaValue
      currentPropertyId={pageProperty.id}
      properties={properties}
      propertyConfig={pageProperty.config}
      propertyValuesByKey={propertyValuesByKey}
      row={row}
      titlePropertyLabel={titlePropertyLabel}
    />
  ) : isSelectProperty || isPersonProperty ? (
    <DatabasePropertySelect
      allowCreate={!isPersonProperty}
      editable={editable && !disabledSelect}
      defaultOptions={
        pageProperty.type === "status"
          ? defaultStatusOptions
          : isPersonProperty
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
      valueKey={isPersonProperty ? "id" : "name"}
    />
  ) : isDateProperty ? (
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
  ) : isFilesProperty ? (
    <DatabasePropertyFiles
      databaseId={databaseContext.databaseId}
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
        databaseContext.workspaceId ??
        databaseContext.databaseWorkspaceId ??
        databaseContext.hostDatabaseWorkspaceId
      }
      propertyConfig={pageProperty.config}
      value={value}
      pageId={row.pageId}
    />
  ) : isRelationProperty ? (
    <DatabaseRelationPropertyValue
      onOpen={databaseContext.onOpenPage}
      propertyConfig={pageProperty.config}
      value={value}
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
      wrapContent
    />
  )

  return content
}

function DatabaseRelationPropertyValue({
  onOpen,
  propertyConfig,
  value,
}: {
  onOpen?: (pageId: string) => void
  propertyConfig: unknown
  value: DatabasePropertyValue
}) {
  const pageId = Array.isArray(value) ? value[0] : value

  if (!pageId) {
    return null
  }

  const pageSummary = getRelationPageSummary(propertyConfig, pageId)

  return (
    <DatabasePageLink
      editable={false}
      onOpen={onOpen}
      pageId={pageId}
      pageSummary={pageSummary}
      showPageIcon
    />
  )
}

function getRelationPageSummary(
  propertyConfig: unknown,
  pageId: string
): RelationPageSummary | null {
  if (!propertyConfig || typeof propertyConfig !== "object" || Array.isArray(propertyConfig)) {
    return null
  }

  const pageSummaries = (propertyConfig as { pageSummaries?: unknown }).pageSummaries

  if (!pageSummaries || typeof pageSummaries !== "object" || Array.isArray(pageSummaries)) {
    return null
  }

  const pageSummary = (pageSummaries as Record<string, unknown>)[pageId]

  if (!pageSummary || typeof pageSummary !== "object" || Array.isArray(pageSummary)) {
    return null
  }

  return pageSummary as RelationPageSummary
}
