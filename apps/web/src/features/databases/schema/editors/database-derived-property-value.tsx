import { useMemo, useState } from "react";
import {
  type DatabasePropertyEntity,
  type DatabaseRecordEntity,
} from "@zilobase/features/databases";
import {
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases/react";
import { getPageEmoji, type PageMetadata } from "@zilobase/features/pages";
import { DefaultPageIcon, PageIconDisplay } from "@/features/pages/index";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { DatabasePageLink } from "../../interactions/database-page-link";
import { DatabaseRollupPropertySettings } from "../configuration";
import {
  getRelationConfigWithPageSummary,
  getRelationConfigWithSyncStatus,
  getRelationLimit,
  getRelationReciprocalUpdates,
  getRelationTargetDatabaseId,
  relationPayloadFromViewData,
} from "../relations/model/database-relation-sync";
import { evaluateDatabaseRollup, getRollupRelationProperty } from "../rollup/model/rollup-engine";
import { getRollupConfig } from "../rollup/model/rollup-config";
import { getNumberDisplayValue } from "./database-property-input";
import { toStringArray, type DatabasePropertyValue } from "../property-values";
import { useDatabaseSecondaryPayload } from "../../records/use-database-secondary-payload";
import {
  PageDatabasePicker,
  type PageDatabasePickerOption,
} from "../../components/page-database-picker";

type DatabaseRow = {
  createdAt: string;
  id: string;
  page: {
    createdAt?: string;
    id?: string;
    metadata?: unknown;
    name?: string;
    updatedAt?: string;
  };
  pageId: string;
  updatedAt: string;
};

type RelationPageSummary = {
  iconKind?: "database" | "page";
  id?: string;
  metadata?: unknown;
  name?: string;
};

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
  databaseId: string | null | undefined;
  editable: boolean;
  onOpen?: (pageId: string) => void;
  onOpenChange?: (open: boolean) => void;
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown;
  properties: DatabasePropertyEntity[];
  propertyConfig: unknown;
  propertyValuesByKey: Record<string, DatabasePropertyValue>;
  row: DatabaseRow;
  wrapContent: boolean;
}) {
  const config = getRollupConfig(propertyConfig);
  const relationProperty = getRollupRelationProperty(properties, config.relationPropertyId);
  const relatedDatabaseId = relationProperty
    ? getRelationTargetDatabaseId(relationProperty.property.config)
    : null;
  const { data: relatedViewData } = useDatabaseSecondaryPayload(relatedDatabaseId, {
    loadAll: true,
  });
  const relatedRollupData = relatedViewData
    ? {
        properties: relatedViewData.bootstrap.properties.filter(
          (property) => property.dataSourceId === relatedViewData.dataSourceId,
        ),
        rows: relatedViewData.records,
        values: relatedViewData.records.flatMap((record) =>
          Object.values(record.valuesByPropertyId),
        ),
      }
    : null;
  const result = evaluateDatabaseRollup({
    currentRow: row,
    propertyConfig,
    propertyValuesByKey,
    relatedDatabasePayload: relatedRollupData,
    relationProperty,
  });
  const numberDisplayConfig = config.calculation?.startsWith("percent_")
    ? { ...config, numberFormat: "percent" }
    : config;
  const value =
    result.kind === "number" && typeof result.value === "number"
      ? getNumberDisplayValue(String(result.value), numberDisplayConfig)
      : result.displayValue || <span className="text-content-secondary">Empty</span>;
  const shouldShowRelationLinks =
    config.targetPropertyId === "name" &&
    (!config.calculation || config.calculation === "show_original");
  const pageLinks = shouldShowRelationLinks
    ? getRollupPageLinks({
        onOpen,
        openMode: wrapContent ? "button" : "title",
        pageIds: toStringArray(
          relationProperty
            ? propertyValuesByKey[`${row.pageId}:${relationProperty.property.id}`]
            : "",
        ),
        relatedRows: relatedViewData?.records,
      })
    : null;
  const displayContent =
    pageLinks && pageLinks.length > 0 ? (
      pageLinks
    ) : result.kind === "empty" && result.displayValue ? (
      <span className="text-content-secondary">{result.displayValue}</span>
    ) : (
      value
    );

  if (!editable || !databaseId) {
    return pageLinks && pageLinks.length > 0 ? (
      <span className="database-relation-cell-trigger">{pageLinks}</span>
    ) : (
      <span className="database-input-cell-trigger">{value}</span>
    );
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
            void onPropertyConfigChange?.(config);
          }}
          surface="popover"
        />
      </PopoverContent>
    </Popover>
  );
}

function getRollupPageLinks({
  onOpen,
  openMode,
  pageIds,
  relatedRows,
}: {
  onOpen?: (pageId: string) => void;
  openMode: "button" | "title";
  pageIds: string[];
  relatedRows: DatabaseRecordEntity[] | null | undefined;
}) {
  if (!relatedRows) {
    return [];
  }

  const rowsByPageId = new Map(relatedRows.map((relatedRow) => [relatedRow.pageId, relatedRow]));

  return pageIds.flatMap((pageId) => {
    const relatedRow = rowsByPageId.get(pageId);

    if (!relatedRow) {
      return [];
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
    );
  });
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
  editable: boolean;
  emptyLabel?: string;
  label: string;
  onOpenChange?: (open: boolean) => void;
  onOpen?: (pageId: string) => void;
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown;
  onSelect: (value: string | string[]) => void;
  propertyConfig: unknown;
  row: DatabaseRow;
  value: DatabasePropertyValue;
  wrapContent: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const updateProperty = useUpdateDatabaseProperty();
  const updateValue = useUpdateDatabasePropertyValue();
  const relatedDatabaseId = getRelationTargetDatabaseId(propertyConfig);
  const multiple = getRelationLimit(propertyConfig) !== "one_page";
  const selectedPageIds = toStringArray(value);
  const {
    data: relatedViewData,
    fetchNextPage,
    hasMore,
    isFetchingNextPage,
    isLoading,
  } = useDatabaseSecondaryPayload(relatedDatabaseId, { loadAll: isOpen && Boolean(query.trim()) });
  const pageOptions = useMemo(
    () =>
      (relatedViewData?.records ?? [])
        .filter((candidate) => candidate.pageId !== row.pageId)
        .map(
          (candidate) =>
            ({
              icon: <RelationPageOptionIcon page={candidate.page} />,
              label: candidate.page.name || "Untitled",
              page: candidate.page,
              searchText: candidate.page.name || "Untitled",
              value: candidate.page.id,
            }) satisfies PageDatabasePickerOption & {
              page: DatabaseRecordEntity["page"];
            },
        ),
    [relatedViewData?.records, row.pageId],
  );

  const setOpen = (open: boolean) => {
    onOpenChange?.(open);

    if (open) {
      setIsOpen(true);
      return;
    }

    setIsOpen(false);
    setQuery("");
  };

  const selectPage = (page: DatabaseRecordEntity["page"]) => {
    const wasSelected = selectedPageIds.includes(page.id);
    const nextValue = multiple
      ? wasSelected
        ? selectedPageIds.filter((pageId) => pageId !== page.id)
        : [...selectedPageIds, page.id]
      : page.id;
    const nextPageIds = toStringArray(nextValue);
    const relationChanged =
      nextPageIds.length !== selectedPageIds.length ||
      nextPageIds.some((pageId, index) => pageId !== selectedPageIds[index]);

    const reciprocalUpdates = getRelationReciprocalUpdates({
      nextPageIds,
      propertyConfig,
      relatedDatabasePayload: relationPayloadFromViewData(relatedViewData),
      selectedPageIds,
      sourcePage: {
        id: row.pageId,
        metadata: row.page.metadata,
        name: row.page.name,
      },
    });
    const nextConfig = getRelationConfigWithPageSummary(propertyConfig, page);

    void onPropertyConfigChange?.(
      reciprocalUpdates.length > 0
        ? nextConfig
        : relationChanged
          ? getRelationConfigWithSyncStatus(nextConfig, "not_synced")
          : nextConfig,
    );
    onSelect(nextValue);

    reciprocalUpdates.forEach((update) => {
      if (update.config && update.databasePropertyId) {
        updateProperty.mutate({
          config: update.config,
          databaseId: update.databaseId,
          databasePropertyId: update.databasePropertyId,
        });
      }

      updateValue.mutate({
        databaseId: update.databaseId,
        propertyId: update.propertyId,
        rowId: update.rowId,
        value: update.value,
      });
    });

    if (!multiple) {
      setOpen(false);
    }
  };

  const selectedLinks = selectedPageIds.map((pageId) => {
    const relatedPage = relatedViewData?.records.find(
      (candidate) => candidate.pageId === pageId,
    )?.page;

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
    );
  });

  if (!editable) {
    return selectedLinks.length > 0 ? (
      <span className="database-relation-cell-trigger gap-1">{selectedLinks}</span>
    ) : emptyLabel ? (
      <span className="database-select-cell-trigger text-content-secondary">{emptyLabel}</span>
    ) : null;
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
              event.preventDefault();
              setOpen(true);
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
      <PopoverContent align="start" className="w-80 overflow-hidden p-0" sideOffset={0}>
        <PageDatabasePicker
          ariaLabel="Search relation pages"
          emptyMessage={
            relatedDatabaseId ? "No pages found." : "Configure a relation database first."
          }
          heading={multiple ? "Select pages" : "Select a page"}
          isLoading={Boolean(relatedDatabaseId && isLoading && !relatedViewData)}
          isSearching={Boolean(query.trim() && (hasMore || isFetchingNextPage))}
          loadingMessage="Loading pages..."
          onQueryChange={setQuery}
          onSelect={(option) => selectPage(option.page)}
          options={pageOptions}
          placeholder="Search for a page..."
          query={query}
          selectedValues={selectedPageIds}
          trailingContent={
            hasMore && !query.trim() ? (
              <button
                className="flex w-full items-center justify-center px-3 py-2 text-xs text-content-secondary hover:bg-action-neutral-hover disabled:opacity-50"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                type="button"
              >
                {isFetchingNextPage ? "Loading..." : "Load more pages"}
              </button>
            ) : null
          }
        />
      </PopoverContent>
    </Popover>
  );
}

function RelationPageOptionIcon({ page }: { page: DatabaseRecordEntity["page"] }) {
  const emoji = getPageEmoji({
    metadata: page.metadata as PageMetadata | null | undefined,
  });

  return emoji ? <PageIconDisplay size="sm" value={emoji} /> : <DefaultPageIcon />;
}

function getRelationPageSummary(
  propertyConfig: unknown,
  pageId: string,
): RelationPageSummary | null {
  if (!propertyConfig || typeof propertyConfig !== "object" || Array.isArray(propertyConfig)) {
    return null;
  }

  const pageSummaries = (propertyConfig as { pageSummaries?: unknown }).pageSummaries;

  if (!pageSummaries || typeof pageSummaries !== "object" || Array.isArray(pageSummaries)) {
    return null;
  }

  const pageSummary = (pageSummaries as Record<string, unknown>)[pageId];

  if (!pageSummary || typeof pageSummary !== "object" || Array.isArray(pageSummary)) {
    return null;
  }

  return pageSummary as RelationPageSummary;
}
