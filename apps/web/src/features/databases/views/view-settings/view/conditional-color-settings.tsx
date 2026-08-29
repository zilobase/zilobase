import { Reorder } from "framer-motion";
import { Plus, Search, Trash2 } from "@/shared/components/icons";
import { useMemo, useState } from "react";

import { Button } from "@/shared/ui/button";
import {
  DropDrawerSeparator,
} from "@/shared/ui/dropdrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cyclingColorTokens, getColorToken } from "@/shared/lib/color-tokens";
import { cn } from "@/shared/lib/utils";

import { DatabaseConditionEditor } from "../../view/database-condition-editor";
import {
  getDatabaseFilterOperatorsForType,
  type DatabaseConditionalColorConfig,
} from "../../model/database-view-config";
import type { DatabaseActiveConditionalColor } from "../../model/database-view-context";
import type { DatabaseFilterUpdatePatch } from "../../view/database-filter-menu";
import type { DatabaseSearchableMenuOption } from "../../view/database-searchable-menu-items";
import type { DatabaseViewProperty } from "../model/types";

const DEFAULT_CONDITIONAL_COLOR = "green";

const conditionalColorApplyTargetOptions: {
  label: string;
  value: DatabaseConditionalColorConfig["applyTo"];
}[] = [
  { label: "Entire row", value: "entire-row" },
  { label: "This property", value: "this-property" },
];

function createConditionalColorId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getPlainConditionalColorSettings(
  settings: DatabaseActiveConditionalColor[],
): DatabaseConditionalColorConfig[] {
  return settings.map(({ applyTo, color, filter, id, style }) => ({
    applyTo,
    color,
    filter: {
      id: filter.id,
      operator: filter.operator,
      propertyId: filter.propertyId,
      values: filter.values,
    },
    id,
    style,
  }));
}

function getFilterPropertyType(
  propertyId: string,
  properties: DatabaseViewProperty[],
) {
  if (propertyId === "name") {
    return "text";
  }

  return (
    properties.find((property) => property.id === propertyId)?.property.type ??
    "text"
  );
}

function getConditionalColorLabel(value: string) {
  return getColorToken(value).name;
}

function ConditionalColorPreview() {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-3 border-b text-[11px] text-content-secondary">
        <div className="px-2 py-1.5">Aa Name</div>
        <div className="border-l px-2 py-1.5">Office</div>
        <div className="border-l px-2 py-1.5 text-right"># Units</div>
      </div>
      {[
        ["Keesha", "Miami", "160", "bg-feedback-success-subtle"],
        ["Rahul", "Orlando", "120", ""],
        ["Jackson", "Tampa", "140", "bg-feedback-success-subtle"],
        ["Marcus", "Tampa", "100", "bg-feedback-warning-subtle"],
        ["John", "Miami", "100", "bg-feedback-error-subtle"],
      ].map(([name, office, units, colorClass]) => (
        <div
          className={cn("grid grid-cols-3 text-xs text-content-primary", colorClass)}
          key={name}
        >
          <div className="px-2 py-1.5">{name}</div>
          <div className="border-l border-stroke-default px-2 py-1.5">{office}</div>
          <div className="border-l border-stroke-default px-2 py-1.5 text-right">
            {units}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionalColorPropertyPicker({
  filterFieldOptions,
  onSelect,
}: {
  filterFieldOptions: DatabaseSearchableMenuOption[];
  onSelect: (propertyId: string) => void;
}) {
  const [propertySearch, setPropertySearch] = useState("");
  const filteredOptions = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();

    if (!query) {
      return filterFieldOptions;
    }

    return filterFieldOptions.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [filterFieldOptions, propertySearch]);

  return (
    <div>
      <div className="flex h-8 items-center gap-2 px-2 text-sm">
        <Search className="size-4 shrink-0 text-content-secondary" />
        <input
          aria-label="Search for a property"
          autoFocus
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-content-secondary"
          onChange={(event) => setPropertySearch(event.target.value)}
          placeholder="Search for a property..."
          value={propertySearch}
        />
      </div>
      <DropDrawerSeparator />
      <div className="max-h-64 overflow-y-auto py-1">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <button
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:bg-action-neutral-hover focus-visible:text-action-on-neutral focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-content-secondary"
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          ))
        ) : (
          <div className="px-2 py-1.5 text-sm text-content-secondary">
            No properties found
          </div>
        )}
      </div>
    </div>
  );
}

function ConditionalColorRuleItem({
  filterFieldOptions,
  filterValueOptionsByField,
  isDragging,
  properties,
  setting,
  onDragEnd,
  onDragStart,
  onRemove,
  onUpdateFilter,
  onUpdateSetting,
}: {
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  isDragging: boolean;
  properties: DatabaseViewProperty[];
  setting: DatabaseActiveConditionalColor;
  onDragEnd: () => void;
  onDragStart: () => void;
  onRemove: () => void;
  onUpdateFilter: (patch: DatabaseFilterUpdatePatch) => void;
  onUpdateSetting: (patch: Partial<DatabaseConditionalColorConfig>) => void;
}) {
  const filter = setting.filter;
  const color = getColorToken(setting.color);
  const applyTarget =
    conditionalColorApplyTargetOptions.find(
      (option) => option.value === setting.applyTo,
    ) ?? conditionalColorApplyTargetOptions[0];

  return (
    <DatabaseConditionEditor
      condition={filter}
      drag={{
        ariaLabel: "Drag conditional color setting",
        isDragging,
        onDragEnd,
        onDragStart,
        value: setting.id,
      }}
      fieldOptions={filterFieldOptions}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2 pl-6">
            <Select
              onValueChange={(value) => onUpdateSetting({ color: value })}
              value={setting.color}
            >
              <SelectTrigger className="h-8 text-xs">
                <span
                  className={cn(
                    "size-3 rounded-sm border",
                    color.swatchClass,
                  )}
                />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {cyclingColorTokens.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value ?? "default"}
                  >
                    <span
                      className={cn(
                        "mr-2 inline-flex size-3 rounded-sm border align-middle",
                        option.swatchClass,
                      )}
                    />
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) =>
                onUpdateSetting({
                  applyTo: value as DatabaseConditionalColorConfig["applyTo"],
                })
              }
              value={setting.applyTo}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {conditionalColorApplyTargetOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-1.5 pl-6 text-[11px] text-content-secondary">
            {getConditionalColorLabel(setting.color)} - {applyTarget.label}
          </div>
        </>
      }
      layout="stacked"
      removeIcon={<Trash2 className="size-3.5" />}
      removeLabel="Delete conditional color setting"
      valueOptions={filterValueOptionsByField[filter.propertyId] ?? []}
      onFieldChange={(field) => {
        const propertyType = getFilterPropertyType(field, properties);

        onUpdateFilter({
          operator:
            getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
          propertyId: field,
          values: [],
        });
      }}
      onRemove={onRemove}
      onUpdate={onUpdateFilter}
    />
  );
}

export function ConditionalColorPanel({
  filterFieldOptions,
  filterValueOptionsByField,
  properties,
  settings,
  onSettingsChange,
}: {
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  properties: DatabaseViewProperty[];
  settings: DatabaseActiveConditionalColor[];
  onSettingsChange: (settings: DatabaseConditionalColorConfig[]) => void;
}) {
  const [isChoosingProperty, setIsChoosingProperty] = useState(false);
  const [draggingSettingId, setDraggingSettingId] = useState<string | null>(
    null,
  );

  const saveSettings = (nextSettings: DatabaseConditionalColorConfig[]) => {
    onSettingsChange(nextSettings);
  };

  const addSetting = (propertyId: string) => {
    const propertyType = getFilterPropertyType(propertyId, properties);

    saveSettings([
      ...getPlainConditionalColorSettings(settings),
      {
        applyTo: "entire-row",
        color: DEFAULT_CONDITIONAL_COLOR,
        filter: {
          id: createConditionalColorId("conditional-filter"),
          operator:
            getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
          propertyId,
          values: [],
        },
        id: createConditionalColorId("conditional-color"),
        style: "page-background",
      },
    ]);
    setIsChoosingProperty(false);
  };

  const updateSetting = (
    settingId: string,
    updates: Partial<DatabaseConditionalColorConfig>,
  ) => {
    saveSettings(
      getPlainConditionalColorSettings(settings).map((setting) =>
        setting.id === settingId ? { ...setting, ...updates } : setting,
      ),
    );
  };

  const updateFilter = (
    settingId: string,
    updates: DatabaseFilterUpdatePatch,
  ) => {
    saveSettings(
      getPlainConditionalColorSettings(settings).map((setting) =>
        setting.id === settingId
          ? { ...setting, filter: { ...setting.filter, ...updates } }
          : setting,
      ),
    );
  };

  const removeSetting = (settingId: string) => {
    saveSettings(
      getPlainConditionalColorSettings(settings).filter(
        (setting) => setting.id !== settingId,
      ),
    );
  };

  const reorderSettings = (settingIds: string[]) => {
    const settingsById = new Map(
      getPlainConditionalColorSettings(settings).map((setting) => [
        setting.id,
        setting,
      ]),
    );
    const reorderedSettings = settingIds.flatMap((settingId) => {
      const setting = settingsById.get(settingId);

      return setting ? [setting] : [];
    });
    const remainingSettings = getPlainConditionalColorSettings(settings).filter(
      (setting) => !settingIds.includes(setting.id),
    );

    saveSettings([...reorderedSettings, ...remainingSettings]);
  };

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      {settings.length === 0 && !isChoosingProperty ? (
        <div className="mb-2 px-1">
          <ConditionalColorPreview />
        </div>
      ) : null}
      <Reorder.Group
        as="div"
        axis="y"
        className="space-y-2 px-1"
        layoutScroll
        values={settings.map((setting) => setting.id)}
        onReorder={reorderSettings}
      >
        {settings.map((setting) => (
          <ConditionalColorRuleItem
            filterFieldOptions={filterFieldOptions}
            filterValueOptionsByField={filterValueOptionsByField}
            isDragging={draggingSettingId === setting.id}
            key={setting.id}
            properties={properties}
            setting={setting}
            onDragEnd={() => setDraggingSettingId(null)}
            onDragStart={() => setDraggingSettingId(setting.id)}
            onRemove={() => removeSetting(setting.id)}
            onUpdateFilter={(updates) => updateFilter(setting.id, updates)}
            onUpdateSetting={(updates) => updateSetting(setting.id, updates)}
          />
        ))}
      </Reorder.Group>
      <div className={cn(!isChoosingProperty && "mt-2 px-1")}>
        {isChoosingProperty ? (
          <ConditionalColorPropertyPicker
            filterFieldOptions={filterFieldOptions}
            onSelect={addSetting}
          />
        ) : (
          <Button
            className="h-8 w-full justify-start gap-2 text-xs"
            disabled={filterFieldOptions.length === 0}
            onClick={() => setIsChoosingProperty(true)}
            type="button"
            variant="secondary"
          >
            <Plus className="size-4" />
            <span>
              {settings.length > 0 ? "Add another" : "New color setting"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
