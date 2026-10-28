import { ContentVerificationValue } from "@/sections/pages/header/components/content-verification";
import { useCallback, useEffect, useRef, type FormEvent } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "@/components/icons";
import { type DatabasePropertyEntity } from "@zilobase/features/databases";

import { getEffectiveStatusValue, defaultStatusOptions } from "@zilobase/features/databases";
import { DatabasePropertyButton } from "./database-property-button";
import { DatabasePropertyDate } from "./database-property-date";
import { DatabasePropertyFiles } from "./database-property-files";
import { DatabasePropertyInput } from "./database-property-input";
import { DatabasePropertySelect } from "./database-property-select";
import { getDatabasePropertyCellKind } from "../../lib/property-catalog";
import { DatabaseFormulaValue } from "../../formula/components/database-formula-value";
import { type DatabasePropertyValue } from "@zilobase/features/databases";
import { formatDatabaseDateValue } from "@zilobase/features/databases";
import { getReadOnlyTimePropertyRawValue } from "@zilobase/features/databases";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../../views/state/components/database-view-context";
import {
  useDatabaseCellDraft,
  useSetActiveDatabaseCell,
  useUpdateDatabaseCellDraft,
} from "../../../views/state/components/database-cell-state";
import { areSerializedPropertyValuesEqual } from "@zilobase/features/databases";
import { getPersonLimit, getPropertyWrapContent } from "@zilobase/features/databases";
import { type DatabasePropertyListItem } from "@zilobase/features/databases";
import {
  DatabaseRelationPropertyValue,
  DatabaseRollupPropertyValue,
} from "./database-derived-property-value";
export { DatabaseRelationPropertyValue } from "./database-derived-property-value";

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
  valuesByPropertyId?: Record<string, { value: unknown }>;
};

type PersonOption = {
  id: string;
  name: string;
  suffix?: string;
};

type DatabasePropertyValueProps = {
  preview?: boolean;
  disabledSelect?: boolean;
  editable: boolean;
  properties: DatabasePropertyEntity[];
  propertyValuesByKey: Record<string, DatabasePropertyValue>;
  onPropertyConfigChange: (databasePropertyId: string, config: unknown) => Promise<unknown>;
  onSaveValue: (
    rowId: string,
    propertyId: string,
    propertyType: string,
    currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue,
  ) => void;
  persistedValue: DatabasePropertyValue;
  personOptions: PersonOption[];
  property: DatabasePropertyListItem;
  row: DatabaseRow;
  titlePropertyLabel: string;
  wrapContent?: boolean;
};

function formatReadOnlyTimePropertyValue(row: DatabaseRow, config: unknown, type: string) {
  return formatDatabaseDateValue(getReadOnlyTimePropertyRawValue(row, type), config);
}

function resizeCellEditor(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function handleCellInput(event: FormEvent<HTMLTextAreaElement>) {
  resizeCellEditor(event.currentTarget);
}

export function DatabasePropertyValue({
  preview = false,
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
  const { layoutSettings } = useDatabaseUiContext();
  const { databaseId, databaseWorkspaceId, hostDatabaseWorkspaceId, workspaceId } =
    useDatabaseDataContext();
  const { onOpenPage } = useDatabaseActionsContext();
  const pageProperty = property.property;
  const key = `${row.pageId}:${pageProperty.id}`;
  const draftValue = useDatabaseCellDraft(key);
  const setActiveCell = useSetActiveDatabaseCell();
  const updateDraft = useUpdateDatabaseCellDraft();
  const previousPropertyTypeRef = useRef(pageProperty.type);
  // Server value observed when the current draft was committed. The draft is
  // cleared once the server catches up to it, or when the server value moves
  // on independently (normalization, another writer), so a draft can never
  // stick forever and the UI keeps showing the attempted edit until then.
  const commitBaseRef = useRef<{
    key: string;
    value: DatabasePropertyValue;
  } | null>(null);

  useEffect(() => {
    if (previousPropertyTypeRef.current === pageProperty.type) {
      return;
    }

    previousPropertyTypeRef.current = pageProperty.type;
    commitBaseRef.current = null;
    updateDraft(key, () => undefined);
  }, [key, pageProperty.type, updateDraft]);

  useEffect(() => {
    if (draftValue === undefined || !commitBaseRef.current) {
      return;
    }

    if (commitBaseRef.current.key !== key) {
      commitBaseRef.current = null;
      return;
    }

    if (
      areSerializedPropertyValuesEqual(pageProperty.type, persistedValue, draftValue) ||
      !areSerializedPropertyValuesEqual(
        pageProperty.type,
        persistedValue,
        commitBaseRef.current.value,
      )
    ) {
      commitBaseRef.current = null;
      updateDraft(key, () => undefined);
    }
  }, [draftValue, key, pageProperty.type, persistedValue, updateDraft]);

  const draftValues = draftValue === undefined ? {} : { [key]: draftValue };
  const value = draftValue ?? persistedValue;
  const onActiveValueChange = useCallback(
    (activeKey: string | null) => setActiveCell(activeKey),
    [setActiveCell],
  );
  const onDraftValuesChange = useCallback(
    (
      updater: (
        drafts: Record<string, DatabasePropertyValue>,
      ) => Record<string, DatabasePropertyValue>,
    ) => {
      updateDraft(key, (currentValue) => {
        const currentDrafts = currentValue === undefined ? {} : { [key]: currentValue };

        return updater(currentDrafts)[key];
      });
    },
    [key, updateDraft],
  );
  // Keep the attempted value visible as a draft until the server catches up.
  // The catch-up effect above clears it once refetched data confirms it (or
  // moves on), so the cell never snaps back to the stale value after commit.
  const commitValue = useCallback(
    (nextValue: DatabasePropertyValue) => {
      if (areSerializedPropertyValuesEqual(pageProperty.type, persistedValue, nextValue)) {
        commitBaseRef.current = null;
        updateDraft(key, () => undefined);
        return;
      }

      commitBaseRef.current = { key, value: persistedValue };
      updateDraft(key, () => nextValue);
      onSaveValue(row.id, pageProperty.id, pageProperty.type, persistedValue, nextValue);
    },
    [key, onSaveValue, pageProperty.id, pageProperty.type, persistedValue, row.id, updateDraft],
  );
  const cellKind = getDatabasePropertyCellKind(pageProperty.type);
  const isMultiSelectProperty =
    pageProperty.type === "multi_select" ||
    (cellKind === "person" && getPersonLimit(pageProperty.config) !== "one_person");
  const wrapContent =
    wrapContentOverride ??
    (layoutSettings.wrapAllContent || getPropertyWrapContent(pageProperty.config));
  const displayValue =
    pageProperty.type === "status" ? getEffectiveStatusValue(value, pageProperty.config) : value;
  const content =
    cellKind === "verification" ? (
      (databaseWorkspaceId ?? hostDatabaseWorkspaceId ?? workspaceId) ? (
        <ContentVerificationValue
          resource={{
            workspaceId: (databaseWorkspaceId ?? hostDatabaseWorkspaceId ?? workspaceId)!,
            type: "page",
            id: row.pageId,
          }}
          editable={editable}
          preview={preview}
          value={row.valuesByPropertyId?.[pageProperty.id]?.value}
        />
      ) : (
        <span className="database-input-cell-trigger text-content-secondary">
          Verification unavailable
        </span>
      )
    ) : cellKind === "read_only_time" ? (
      <span className="database-input-cell-trigger">
        {formatReadOnlyTimePropertyValue(row, pageProperty.config, pageProperty.type) || (
          <span className="text-content-secondary">Empty</span>
        )}
      </span>
    ) : cellKind === "checkbox" && preview ? (
      <span
        aria-label={value === "true" ? "Checked" : "Unchecked"}
        className="flex size-4 items-center justify-center rounded-sm border border-stroke-default"
      >
        {value === "true" && <Check className="size-3" />}
      </span>
    ) : cellKind === "checkbox" ? (
      <div className="database-checkbox-cell">
        <Checkbox
          aria-label={`${pageProperty.name} value`}
          checked={value === "true"}
          disabled={!editable}
          onBlur={() => onActiveValueChange(null)}
          onCheckedChange={(nextChecked) => commitValue(nextChecked === true ? "true" : "false")}
          onFocus={() => onActiveValueChange(key)}
        />
      </div>
    ) : cellKind === "button" && preview ? (
      <span className="truncate rounded-sm border border-stroke-default px-1">
        {(Array.isArray(value) ? value.find((item) => item.trim()) : value) || pageProperty.name}
      </span>
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
        onSelect={(optionValue) => commitValue(optionValue)}
        onOpenChange={(open) => onActiveValueChange(open ? key : null)}
        onPropertyConfigChange={(config) => onPropertyConfigChange(property.id, config)}
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
        onPropertyConfigChange={(config) => onPropertyConfigChange(property.id, config)}
        onSelect={(nextValue) => commitValue(nextValue)}
        propertyConfig={pageProperty.config}
        value={value}
      />
    ) : cellKind === "files" ? (
      <DatabasePropertyFiles
        preview={preview}
        databaseId={databaseId}
        editable={editable}
        label={pageProperty.name}
        onOpenChange={(open) => onActiveValueChange(open ? key : null)}
        onSelect={(nextValue) => commitValue(nextValue)}
        workspaceId={workspaceId ?? databaseWorkspaceId ?? hostDatabaseWorkspaceId}
        propertyConfig={pageProperty.config}
        value={value}
        pageId={row.pageId}
      />
    ) : cellKind === "relation" ? (
      <DatabaseRelationPropertyValue
        preview={preview}
        editable={editable}
        label={pageProperty.name}
        onOpen={onOpenPage}
        onOpenChange={(open) => onActiveValueChange(open ? key : null)}
        onPropertyConfigChange={(config) => onPropertyConfigChange(property.id, config)}
        onSelect={(nextValue) => commitValue(nextValue)}
        propertyConfig={pageProperty.config}
        row={row}
        value={value}
        wrapContent={wrapContent}
      />
    ) : cellKind === "rollup" ? (
      <DatabaseRollupPropertyValue
        preview={preview}
        databaseId={databaseId}
        editable={editable}
        onOpen={onOpenPage}
        onOpenChange={(open) => onActiveValueChange(open ? key : null)}
        onPropertyConfigChange={(config) => onPropertyConfigChange(property.id, config)}
        properties={properties}
        propertyConfig={pageProperty.config}
        propertyValuesByKey={propertyValuesByKey}
        row={row}
        wrapContent={wrapContent}
      />
    ) : (
      <DatabasePropertyInput
        preview={preview}
        editable={editable}
        label={pageProperty.name}
        onActivate={(element) => {
          onActiveValueChange(key);
          resizeCellEditor(element);
        }}
        onChange={(nextValue) =>
          onDraftValuesChange((drafts) => ({
            ...drafts,
            [key]: nextValue,
          }))
        }
        onCommit={() => {
          commitValue(draftValues[key] ?? persistedValue);
        }}
        onDeactivate={() => onActiveValueChange(null)}
        onInput={handleCellInput}
        propertyConfig={pageProperty.config}
        type={pageProperty.type}
        value={Array.isArray(value) ? value.join(", ") : value}
      />
    );

  return content;
}
