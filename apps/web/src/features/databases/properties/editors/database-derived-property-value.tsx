import { useState } from "react"
import { Check } from "@/shared/components/icons"
import {
  useDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
  type DatabasePayload,
  type DatabaseProperty,
  type DatabaseRow as FeatureDatabaseRow,
} from "@zilobase/features/databases"
import { getPageEmoji, type PageMetadata } from "@zilobase/features/pages"
import { DefaultPageIcon, PageIconDisplay } from "@/features/pages/index"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { DatabasePageLink } from "../../interactions/database-page-link"
import { DatabaseRollupPropertySettings } from "../configuration"
import {
  getRelationConfigWithPageSummary,
  getRelationConfigWithSyncStatus,
  getRelationLimit,
  getRelationReciprocalUpdates,
  getRelationTargetDatabaseId,
} from "../relations/model/database-relation-sync"
import {
  evaluateDatabaseRollup,
  getRollupRelationProperty,
} from "../rollup/model/rollup-engine"
import { getRollupConfig } from "../rollup/model/rollup-config"
import { getNumberDisplayValue } from "./database-property-input"
import {
  toStringArray,
  type DatabasePropertyValue,
} from "../../core/database-property-values"

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

type RelationPageSummary = {
  iconKind?: "database" | "page"
  id?: string
  metadata?: unknown
  name?: string
}

export function DatabaseRollupPropertyValue({
  databaseId,
  editable,
  onOpen,
  onOpenChange,
  onPropertyConfigChange,
  properties,
  propertyConfig,
  propertyValuesByKey,
  row,
  wrapContent,
}: {
  databaseId: string | null | undefined
  editable: boolean
  onOpen?: (pageId: string) => void
  onOpenChange?: (open: boolean) => void
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown
  properties: DatabaseProperty[]
  propertyConfig: unknown
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  row: DatabaseRow
  wrapContent: boolean
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
      : result.displayValue || <span className="text-content-secondary">Empty</span>
  const shouldShowRelationLinks =
    config.targetPropertyId === "name" &&
    (!config.calculation || config.calculation === "show_original")
  const pageLinks =
    shouldShowRelationLinks
      ? getRollupPageLinks({
          onOpen,
          openMode: wrapContent ? "button" : "title",
          pageIds: toStringArray(
            relationProperty
              ? propertyValuesByKey[`${row.pageId}:${relationProperty.property.id}`]
              : ""
          ),
          relatedDatabasePayload,
        })
      : null
  const displayContent =
    pageLinks && pageLinks.length > 0 ? (
      pageLinks
    ) : result.kind === "empty" && result.displayValue ? (
      <span className="text-content-secondary">{result.displayValue}</span>
    ) : (
      value
    )

  if (!editable || !databaseId) {
    return pageLinks && pageLinks.length > 0 ? (
      <span className="database-relation-cell-trigger">{pageLinks}</span>
    ) : (
      <span className="database-input-cell-trigger">{value}</span>
    )
  }

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div
          className={
            pageLinks && pageLinks.length > 0
              ? "database-relation-cell-trigger"
              : "database-input-cell-trigger"
          }
          role="button"
          tabIndex={0}
        >
          {displayContent}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 gap-1 p-1"
        onCloseAutoFocus={(event) => event.preventDefault()}
        sideOffset={0}
      >
        <DatabaseRollupPropertySettings
          config={propertyConfig}
          databaseId={databaseId}
          onUpdateConfig={(config) => {
            void onPropertyConfigChange?.(config)
          }}
          surface="popover"
        />
      </PopoverContent>
    </Popover>
  )
}

function getRollupPageLinks({
  onOpen,
  openMode,
  pageIds,
  relatedDatabasePayload,
}: {
  onOpen?: (pageId: string) => void
  openMode: "button" | "title"
  pageIds: string[]
  relatedDatabasePayload: DatabasePayload | null | undefined
}) {
  if (!relatedDatabasePayload) {
    return []
  }

  const rowsByPageId = new Map(
    relatedDatabasePayload.rows.map((relatedRow) => [relatedRow.pageId, relatedRow])
  )

  return pageIds.flatMap((pageId) => {
    const relatedRow = rowsByPageId.get(pageId)

    if (!relatedRow) {
      return []
    }

    return (
      <DatabasePageLink
        editable={false}
        key={pageId}
        onOpen={onOpen}
        openMode={openMode}
        pageId={pageId}
        pageSummary={{
          id: relatedRow.page.id,
          metadata: relatedRow.page.metadata,
          name: relatedRow.page.name,
        }}
        showPageIcon
      />
    )
  })
}

export function DatabaseRelationPropertyValue({
  editable,
  emptyLabel,
  label,
  onOpenChange,
  onOpen,
  onPropertyConfigChange,
  onSelect,
  propertyConfig,
  row,
  value,
  wrapContent,
}: {
  editable: boolean
  emptyLabel?: string
  label: string
  onOpenChange?: (open: boolean) => void
  onOpen?: (pageId: string) => void
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown
  onSelect: (value: string | string[]) => void
  propertyConfig: unknown
  row: DatabaseRow
  value: DatabasePropertyValue
  wrapContent: boolean
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
  const pageOptions = (relatedDatabasePayload?.rows ?? []).filter(
    (candidate) => candidate.pageId !== row.pageId
  )
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

  const selectedLinks = selectedPageIds.map((pageId) => {
    const relatedPage = relatedDatabasePayload?.rows.find(
      (candidate) => candidate.pageId === pageId
    )?.page

    return (
      <DatabasePageLink
        editable={false}
        key={pageId}
        onOpen={onOpen}
        openMode={wrapContent ? "button" : "title"}
        pageId={pageId}
        pageSummary={relatedPage ?? getRelationPageSummary(propertyConfig, pageId)}
        showPageIcon
      />
    )
  })

  if (!editable) {
    return selectedLinks.length > 0 ? (
      <span className="database-relation-cell-trigger gap-1">
        {selectedLinks}
      </span>
    ) : emptyLabel ? (
      <span className="database-select-cell-trigger text-content-secondary">
        {emptyLabel}
      </span>
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
            <span className="text-content-secondary">{emptyLabel ?? "Empty"}</span>
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
            <div className="px-2 py-1.5 text-sm text-content-secondary">
              Configure a relation database first.
            </div>
          ) : isLoading ? (
            <div className="px-2 py-1.5 text-sm text-content-secondary">
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
            <div className="px-2 py-1.5 text-sm text-content-secondary">
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

  return emoji ? <PageIconDisplay size="sm" value={emoji} /> : <DefaultPageIcon />
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
