import { useState, type FormEvent } from "react"
import { Check, FileText } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  useDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
  type DatabaseProperty,
  type DatabaseRow as FeatureDatabaseRow,
} from "@notelab/features/databases"
import { getPageEmoji, type PageMetadata } from "@notelab/features/pages"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PageIconDisplay } from "@/lib/page-icon"

import { defaultStatusOptions } from "../constants"
import { DatabasePropertyButton } from "../database-property-button"
import { DatabasePropertyDate } from "../database-property-date"
import { DatabasePropertyFiles } from "../database-property-files"
import {
  DatabasePropertyInput,
  getNumberDisplayValue,
} from "../database-property-input"
import { DatabasePropertySelect } from "../database-property-select"
import { DatabaseFormulaValue } from "../formula"
import { toStringArray, type DatabasePropertyValue } from "../utils"
import { formatDatabaseDateValue } from "./database-date-config"
import { DatabasePageLink } from "./database-page-link"
import {
  getRelationConfigWithPageSummary,
  getRelationConfigWithSyncStatus,
  getRelationLimit,
  getRelationReciprocalUpdates,
  getRelationTargetDatabaseId,
} from "./database-relation-sync"
import {
  getReadOnlyTimePropertyRawValue,
  isReadOnlyTimeProperty,
} from "./read-only-time-property"
import { DatabaseRollupPropertySettings } from "./database-property-edit-submenu"
import { useDatabaseViewContext } from "./database-view-context"
import { getPersonLimit } from "./database-view-config"
import { type DatabasePropertyListItem } from "../kanban/database-kanban-config"
import {
  evaluateDatabaseRollup,
  getRollupRelationProperty,
} from "../rollup/rollup-engine"
import { getRollupConfig } from "../rollup/rollup-config"

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
  const isRollupProperty = pageProperty.type === "rollup"
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
      editable={editable}
      label={pageProperty.name}
      onOpen={databaseContext.onOpenPage}
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
    />
  ) : isRollupProperty ? (
    <DatabaseRollupPropertyValue
      databaseId={databaseContext.databaseId}
      editable={editable}
      onOpenChange={(open) => onActiveValueChange(open ? key : null)}
      onPropertyConfigChange={(config) =>
        onPropertyConfigChange(property.id, config)
      }
      properties={properties}
      propertyConfig={pageProperty.config}
      propertyValuesByKey={propertyValuesByKey}
      row={row}
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

function DatabaseRollupPropertyValue({
  databaseId,
  editable,
  onOpenChange,
  onPropertyConfigChange,
  properties,
  propertyConfig,
  propertyValuesByKey,
  row,
}: {
  databaseId: string | null | undefined
  editable: boolean
  onOpenChange?: (open: boolean) => void
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown
  properties: DatabaseProperty[]
  propertyConfig: unknown
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  row: DatabaseRow
}) {
  const config = getRollupConfig(propertyConfig)
  const relationProperty = getRollupRelationProperty(
    properties,
    config.relationPropertyId
  )
  const relatedDatabaseId = relationProperty
    ? getRelationTargetDatabaseId(relationProperty.property.config)
    : null
  const { data: relatedDatabasePayload } = useDatabase(relatedDatabaseId, {
    schemaOnly: false,
  })
  const result = evaluateDatabaseRollup({
    currentRow: row,
    propertyConfig,
    propertyValuesByKey,
    relatedDatabasePayload,
    relationProperty,
  })
  const numberDisplayConfig =
    config.calculation?.startsWith("percent_")
      ? { ...config, numberFormat: "percent" }
      : config
  const value =
    result.kind === "number" && typeof result.value === "number"
      ? getNumberDisplayValue(String(result.value), numberDisplayConfig)
      : result.displayValue || <span className="text-muted-foreground">Empty</span>

  if (!editable || !databaseId) {
    return <span className="database-input-cell-trigger">{value}</span>
  }

  return (
    <DropDrawer onOpenChange={onOpenChange}>
      <DropDrawerTrigger asChild>
        <button
          className="database-input-cell-trigger"
          type="button"
        >
          {result.kind === "empty" && result.displayValue ? (
            <span className="text-muted-foreground">{result.displayValue}</span>
          ) : (
            value
          )}
        </button>
      </DropDrawerTrigger>
      <DropDrawerContent
        className="w-80"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DatabaseRollupPropertySettings
          config={propertyConfig}
          databaseId={databaseId}
          onUpdateConfig={(config) => {
            void onPropertyConfigChange?.(config)
          }}
        />
      </DropDrawerContent>
    </DropDrawer>
  )
}

function DatabaseRelationPropertyValue({
  editable,
  label,
  onOpenChange,
  onOpen,
  onPropertyConfigChange,
  onSelect,
  propertyConfig,
  row,
  value,
}: {
  editable: boolean
  label: string
  onOpenChange?: (open: boolean) => void
  onOpen?: (pageId: string) => void
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown
  onSelect: (value: string | string[]) => void
  propertyConfig: unknown
  row: DatabaseRow
  value: DatabasePropertyValue
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const updateProperty = useUpdateDatabaseProperty()
  const updateValue = useUpdateDatabasePropertyValue()
  const relatedDatabaseId = getRelationTargetDatabaseId(propertyConfig)
  const multiple = getRelationLimit(propertyConfig) !== "one_page"
  const selectedPageIds = toStringArray(value)
  const { data: relatedDatabasePayload, isLoading } = useDatabase(
    relatedDatabaseId,
    { schemaOnly: false }
  )
  const pageOptions = relatedDatabasePayload?.rows ?? []
  const normalizedQuery = query.trim().toLowerCase()
  const filteredPageOptions = normalizedQuery
    ? pageOptions.filter((row) =>
        row.page.name.toLowerCase().includes(normalizedQuery)
      )
    : pageOptions

  const setOpen = (open: boolean) => {
    onOpenChange?.(open)

    if (open) {
      setIsOpen(true)
      return
    }

    setIsOpen(false)
    setQuery("")
  }

  const selectPage = (page: FeatureDatabaseRow["page"]) => {
    const wasSelected = selectedPageIds.includes(page.id)
    const nextValue = multiple
      ? wasSelected
        ? selectedPageIds.filter((pageId) => pageId !== page.id)
        : [...selectedPageIds, page.id]
      : page.id
    const nextPageIds = toStringArray(nextValue)
    const relationChanged =
      nextPageIds.length !== selectedPageIds.length ||
      nextPageIds.some((pageId, index) => pageId !== selectedPageIds[index])

    const reciprocalUpdates = getRelationReciprocalUpdates({
      nextPageIds,
      propertyConfig,
      relatedDatabasePayload,
      selectedPageIds,
      sourcePage: {
        id: row.pageId,
        metadata: row.page.metadata,
        name: row.page.name,
      },
    })
    const nextConfig = getRelationConfigWithPageSummary(propertyConfig, page)

    void onPropertyConfigChange?.(
      reciprocalUpdates.length > 0
        ? nextConfig
        : relationChanged
          ? getRelationConfigWithSyncStatus(nextConfig, "not_synced")
          : nextConfig
    )
    onSelect(nextValue)

    reciprocalUpdates.forEach((update) => {
      if (update.config && update.databasePropertyId) {
        updateProperty.mutate({
          config: update.config,
          databaseId: update.databaseId,
          databasePropertyId: update.databasePropertyId,
        })
      }

      updateValue.mutate({
        databaseId: update.databaseId,
        propertyId: update.propertyId,
        rowId: update.rowId,
        value: update.value,
      })
    })

    if (!multiple) {
      setOpen(false)
    }
  }

  const selectedLinks = selectedPageIds.map((pageId) => (
    <DatabasePageLink
      editable={false}
      key={pageId}
      onOpen={onOpen}
      pageId={pageId}
      pageSummary={getRelationPageSummary(propertyConfig, pageId)}
      showPageIcon
    />
  ))

  if (!editable) {
    return selectedLinks.length > 0 ? (
      <span className="flex min-w-0 flex-wrap gap-1">{selectedLinks}</span>
    ) : null
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          aria-label={`${label} value`}
          className={
            selectedLinks.length > 0
              ? "database-relation-cell-trigger"
              : "database-select-cell-trigger"
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              setOpen(true)
            }
          }}
          role="button"
          tabIndex={0}
        >
          {selectedLinks.length > 0 ? (
            selectedLinks
          ) : (
            <span className="text-muted-foreground">Empty</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-1 p-1" sideOffset={0}>
        <input
          autoFocus
          className="database-select-search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && filteredPageOptions[0]) {
              event.preventDefault()
              selectPage(filteredPageOptions[0].page)
            }

            if (event.key === "Escape") {
              setOpen(false)
            }
          }}
          placeholder="Search for a page..."
          value={query}
        />
        <div className="database-select-popover-label">
          {multiple ? "Select pages" : "Select a page"}
        </div>
        <div className="database-select-options">
          {!relatedDatabaseId ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Configure a relation database first.
            </div>
          ) : isLoading ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Loading pages...
            </div>
          ) : filteredPageOptions.length > 0 ? (
            filteredPageOptions.map((row) => {
              const isSelected = selectedPageIds.includes(row.page.id)

              return (
                <button
                  className="database-select-option"
                  data-selected={isSelected ? "true" : undefined}
                  key={row.page.id}
                  onClick={() => selectPage(row.page)}
                  type="button"
                >
                  <RelationPageOptionIcon page={row.page} />
                  <span className="truncate">{row.page.name || "Untitled"}</span>
                  {isSelected ? (
                    <Check className="database-select-option-check" />
                  ) : null}
                </button>
              )
            })
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No pages found.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RelationPageOptionIcon({
  page,
}: {
  page: FeatureDatabaseRow["page"]
}) {
  const emoji = getPageEmoji({
    metadata: page.metadata as PageMetadata | null | undefined,
  })

  return emoji ? <PageIconDisplay size="sm" value={emoji} /> : <FileText />
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
