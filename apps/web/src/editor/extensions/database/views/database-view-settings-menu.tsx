import {
  ArrowDownUp,
  ArrowUpRightIcon,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Check,
  Database,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  Gauge,
  Image as ImageIcon,
  CalendarRange,
  ChartLine,
  ChartPie,
  GalleryThumbnails,
  Kanban,
  List,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  Palette,
  Plus,
  Radar as RadarIcon,
  Rows3,
  Search,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
  Type,
  X,
  Zap,
} from "lucide-react";
import { Reorder } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDatabase } from "@notelab/features/databases";
import { usePageNavigation } from "@notelab/features/pages";
import {
  cyclingColorTokens,
  getColorToken,
  getPaletteColor,
} from "@/lib/color-tokens";

import { getDatabasePropertyType } from "../core/database-property-types";
import {
  getDatabaseLinkedViewKey,
  getPropertyHiddenForView,
  getDatabaseFilterOperatorsForType,
  type DatabaseConditionalColorConfig,
  type DatabaseLinkedViewConfig,
  type DatabaseLayoutSettings,
} from "./database-view-config";
import { DatabasePropertyEditSubmenu } from "../properties/database-property-menu";
import { hasDatabasePropertyEditSettings } from "../properties/database-property-edit-submenu";
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "./database-searchable-menu-items";
import {
  DatabaseFilterSubmenu,
  type DatabaseActiveFilter,
  type DatabaseFilterUpdatePatch,
} from "./database-filter-menu";
import { DatabaseConditionEditor } from "./database-condition-editor";
import {
  DatabaseSortSubmenu,
  type DatabaseActiveSort,
  type DatabaseSortUpdatePatch,
} from "./database-sort-menu";
import { NameColumnGlyph } from "../interactions/name-column-glyph";
import type { DatabaseActiveConditionalColor } from "./database-view-context";
import type {
  DatabaseChartDateInterval,
  DatabaseChartReferenceLine,
  DatabaseChartSettings,
  DatabaseChartSort,
  DatabaseChartType,
} from "./chart/database-chart-config";

type DatabaseViewProperty = {
  id: string;
  property: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  };
};

type DatabaseSourceMenuItem = {
  id: string;
  name: string;
  viewCount: number;
};

type LinkableDatabaseOption = DatabaseSearchableMenuOption & {
  pageName: string;
};

type LinkableDatabaseViewOption = DatabaseSearchableMenuOption & {
  viewType: string;
};

const DEFAULT_CONDITIONAL_COLOR = "green";

const conditionalColorApplyTargetOptions: {
  label: string;
  value: DatabaseConditionalColorConfig["applyTo"];
}[] = [
  { label: "Entire row", value: "entire-row" },
  { label: "This property", value: "this-property" },
];

function ViewSettingsRow({
  icon,
  label,
  right,
}: {
  icon: ReactNode;
  label: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon}
      <span className="truncate">{label}</span>
      {right ? (
        <span className="ml-auto shrink-0 text-muted-foreground">{right}</span>
      ) : null}
    </div>
  );
}

const chartTypeOptions: Array<{
  icon: typeof BarChart3;
  label: string;
  value: DatabaseChartType;
}> = [
  { icon: BarChart3, label: "Bar", value: "bar" },
  { icon: Rows3, label: "Horizontal bar", value: "horizontal-bar" },
  { icon: ChartLine, label: "Line", value: "line" },
  { icon: ChartPie, label: "Pie", value: "pie" },
  { icon: RadarIcon, label: "Radar", value: "radar" },
  { icon: Gauge, label: "Radial", value: "radial" },
  { icon: Type, label: "Count", value: "count" },
];

const chartDateIntervalOptions: Array<{
  label: string;
  value: DatabaseChartDateInterval;
}> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
];

const referenceLineStyleOptions: Array<{
  label: string;
  value: DatabaseChartReferenceLine["style"];
}> = [
  { label: "Solid", value: "solid" },
  { label: "Dash", value: "dashed" },
  { label: "Dot", value: "dotted" },
];

function DatabaseChartSettingsSection({
  properties,
  settings,
  titlePropertyLabel,
  onChange,
}: {
  properties: DatabaseViewProperty[];
  settings: DatabaseChartSettings;
  titlePropertyLabel: string;
  onChange: (settings: Partial<DatabaseChartSettings>) => void;
}) {
  const defaultAxisProperty =
    properties.find((property) =>
      ["select", "status", "checkbox", "person"].includes(
        property.property.type,
      ),
    ) ??
    properties.find((property) => property.property.type !== "number") ??
    null;
  const axisPropertyId =
    settings.groupByPropertyId ?? defaultAxisProperty?.property.id ?? "name";
  const axisProperty = properties.find(
    (property) => property.property.id === axisPropertyId,
  );
  const measurePropertyId = settings.measurePropertyId ?? "count";
  const measureProperty = properties.find(
    (property) => property.property.id === measurePropertyId,
  );
  const splitProperty = properties.find(
    (property) => property.property.id === settings.splitByPropertyId,
  );
  const splitDateInterval = settings.splitByDateInterval ?? "day";
  const splitPropertyLabel = splitProperty
    ? isChartDateProperty(splitProperty)
      ? `${splitProperty.property.name} (${getChartDateIntervalLabel(splitDateInterval)})`
      : splitProperty.property.name
    : "None";
  const sort = settings.sort ?? "value-desc";
  const sortOptions = getChartSortOptions(
    axisProperty?.property.name ?? titlePropertyLabel,
    measureProperty?.property.name ?? "Task count",
  );
  const sortLabel =
    sortOptions.find((option) => option.value === sort)?.label ??
    sortOptions.at(-1)?.label;
  const axisGroups = getChartAxisGroups(axisProperty);
  const hiddenGroupNames = settings.hiddenGroupNames ?? [];
  const referenceLines = settings.referenceLines ?? [];
  const supportsCartesianControls = [
    "bar",
    "horizontal-bar",
    "line",
  ].includes(settings.type);
  const selectedColorToken =
    settings.color === "auto" ? null : getColorToken(settings.color);
  const colorLabel = selectedColorToken?.name ?? "Auto";
  const colorSwatch = selectedColorToken
    ? getPaletteColor(selectedColorToken.value) ?? "var(--primary)"
    : "linear-gradient(90deg, var(--chart-1), var(--chart-2), var(--chart-3), var(--chart-4))";
  const updateReferenceLine = (
    id: string,
    patch: Partial<DatabaseChartReferenceLine>,
  ) =>
    onChange({
      referenceLines: referenceLines.map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    });

  return (
    <>
      <DropDrawerSeparator />
      <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        Chart type
      </DropDrawerLabel>
      <div className="grid grid-cols-7 gap-1.5 px-2 pb-2">
        {chartTypeOptions.map((option) => (
          <button
            aria-label={option.label}
            aria-pressed={settings.type === option.value}
            className={cn(
              "flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              settings.type === option.value &&
                "border-primary text-primary",
            )}
            key={option.value}
            onClick={(event) => {
              event.preventDefault();
              onChange({ type: option.value });
            }}
            title={option.label}
            type="button"
          >
            <option.icon className="size-4" />
          </button>
        ))}
      </div>

      <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        X axis
      </DropDrawerLabel>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<Zap />}
            label="What to show"
            right={axisProperty?.property.name ?? titlePropertyLabel}
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem
            onSelect={() =>
              onChange({
                groupByPropertyId: "name",
                hiddenGroupNames: undefined,
              })
            }
          >
            <NameColumnGlyph />
            <span>{titlePropertyLabel}</span>
            {axisPropertyId === "name" ? (
              <Check className="ml-auto text-foreground" />
            ) : null}
          </DropDrawerItem>
          {properties.map((property) => {
            const PropertyIcon = getDatabasePropertyType(
              property.property.type,
            ).icon;
            const selected = property.property.id === axisPropertyId;

            return (
              <DropDrawerItem
                key={property.id}
                onSelect={() =>
                  onChange({
                    groupByPropertyId: property.property.id,
                    hiddenGroupNames: undefined,
                  })
                }
              >
                <PropertyIcon />
                <span>{property.property.name}</span>
                {selected ? (
                  <Check className="ml-auto text-foreground" />
                ) : null}
              </DropDrawerItem>
            );
          })}
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<ArrowDownUp />}
            label="Sort by"
            right={sortLabel}
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          {sortOptions.map((option) => (
            <DropDrawerItem
              key={option.value}
              onSelect={() => onChange({ sort: option.value })}
            >
              <span>{option.label}</span>
              {sort === option.value ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
          ))}
          {axisGroups.length > 0 ? (
            <>
              <DropDrawerSeparator />
              <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>Groups</span>
                <button
                  className="text-primary hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    onChange({
                      hiddenGroupNames:
                        hiddenGroupNames.length === axisGroups.length
                          ? []
                          : axisGroups.map((group) => group.name),
                    });
                  }}
                  type="button"
                >
                  {hiddenGroupNames.length === axisGroups.length
                    ? "Show all"
                    : "Hide all"}
                </button>
              </div>
              {axisGroups.map((group) => {
                const hidden = hiddenGroupNames.includes(group.name);

                return (
                  <DropDrawerItem
                    key={group.name}
                    onSelect={(event) => {
                      event.preventDefault();
                      onChange({
                        hiddenGroupNames: hidden
                          ? hiddenGroupNames.filter(
                              (name) => name !== group.name,
                            )
                          : [...hiddenGroupNames, group.name],
                      });
                    }}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          getPaletteColor(group.color) ?? "var(--muted-foreground)",
                      }}
                    />
                    <span>{group.name}</span>
                    {hidden ? (
                      <EyeOff className="ml-auto" />
                    ) : (
                      <Eye className="ml-auto" />
                    )}
                  </DropDrawerItem>
                );
              })}
            </>
          ) : null}
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerItem
        aria-pressed={settings.omitZeroValues}
        onSelect={(event) => {
          event.preventDefault();
          onChange({ omitZeroValues: !settings.omitZeroValues });
        }}
      >
        <EyeOff />
        <span>Omit zero values</span>
        <Switch
          checked={settings.omitZeroValues}
          className="ml-auto pointer-events-none"
          size="sm"
          tabIndex={-1}
        />
      </DropDrawerItem>

      <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        Y axis
      </DropDrawerLabel>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<ChartLine />}
            label="What to show"
            right={measureProperty?.property.name ?? "Task count"}
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem onSelect={() => onChange({ measurePropertyId: "count" })}>
            <ChartLine />
            <span>Task count</span>
            {measurePropertyId === "count" ? (
              <Check className="ml-auto text-foreground" />
            ) : null}
          </DropDrawerItem>
          {properties.map((property) => {
            const PropertyIcon = getDatabasePropertyType(
              property.property.type,
            ).icon;
            const selected = property.property.id === measurePropertyId;

            return (
              <DropDrawerItem
                key={property.id}
                onSelect={() =>
                  onChange({ measurePropertyId: property.property.id })
                }
              >
                <PropertyIcon />
                <span>{property.property.name}</span>
                {selected ? (
                  <Check className="ml-auto text-foreground" />
                ) : null}
              </DropDrawerItem>
            );
          })}
        </DropDrawerSubContent>
      </DropDrawerSub>

      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<Rows3 />}
            label="Group by"
            right={splitPropertyLabel}
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="max-h-80 w-72 overflow-y-auto">
          <DropDrawerItem
            onSelect={() =>
              onChange({
                splitByDateInterval: undefined,
                splitByPropertyId: undefined,
              })
            }
          >
            <X />
            <span>None</span>
            {!settings.splitByPropertyId ? (
              <Check className="ml-auto text-foreground" />
            ) : null}
          </DropDrawerItem>
          {properties.map((property) => {
            const PropertyIcon = getDatabasePropertyType(
              property.property.type,
            ).icon;
            const selected =
              property.property.id === settings.splitByPropertyId;

            if (isChartDateProperty(property)) {
              return (
                <DropDrawerSub key={property.id}>
                  <DropDrawerSubTrigger>
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                    {selected ? (
                      <Check className="ml-auto text-foreground" />
                    ) : null}
                  </DropDrawerSubTrigger>
                  <DropDrawerSubContent className="w-56">
                    {chartDateIntervalOptions.map((option) => (
                      <DropDrawerItem
                        key={option.value}
                        onSelect={() =>
                          onChange({
                            splitByDateInterval: option.value,
                            splitByPropertyId: property.property.id,
                          })
                        }
                      >
                        <span>{option.label}</span>
                        {selected && splitDateInterval === option.value ? (
                          <Check className="ml-auto text-foreground" />
                        ) : null}
                      </DropDrawerItem>
                    ))}
                  </DropDrawerSubContent>
                </DropDrawerSub>
              );
            }

            return (
              <DropDrawerItem
                key={property.id}
                onSelect={() =>
                  onChange({
                    splitByDateInterval: undefined,
                    splitByPropertyId: property.property.id,
                  })
                }
              >
                <PropertyIcon />
                <span>{property.property.name}</span>
                {selected ? (
                  <Check className="ml-auto text-foreground" />
                ) : null}
              </DropDrawerItem>
            );
          })}
        </DropDrawerSubContent>
      </DropDrawerSub>

      {supportsCartesianControls ? (
        <>
          <DropDrawerSub>
            <DropDrawerSubTrigger>
              <ViewSettingsRow
                icon={<ArrowDownUp />}
                label="Range"
                right={getChartRangeLabel(settings)}
              />
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-72 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Set custom range
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Minimum chart value"
                  defaultValue={settings.rangeMin ?? ""}
                  key={`range-min-${settings.rangeMin ?? "auto"}`}
                  onBlur={(event) =>
                    onChange({
                      rangeMin: parseOptionalChartNumber(event.target.value),
                    })
                  }
                  placeholder="Min"
                  type="number"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  aria-label="Maximum chart value"
                  defaultValue={settings.rangeMax ?? ""}
                  key={`range-max-${settings.rangeMax ?? "auto"}`}
                  onBlur={(event) =>
                    onChange({
                      rangeMax: parseOptionalChartNumber(event.target.value),
                    })
                  }
                  placeholder="Max"
                  type="number"
                />
              </div>
            </DropDrawerSubContent>
          </DropDrawerSub>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-popover-foreground outline-none hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                type="button"
              >
                <MoreHorizontal />
                <span>Reference line</span>
                <span className="ml-auto text-muted-foreground">
                  {referenceLines.length === 1
                    ? "1 line"
                    : `${referenceLines.length} lines`}
                </span>
                <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mx-2 space-y-2 rounded-lg border bg-muted/20 p-2">
              {referenceLines.map((line) => (
                <div className="space-y-2 rounded-md bg-muted/30 p-2" key={line.id}>
                  <div className="flex items-end gap-2">
                    <label className="grid flex-1 gap-1 text-xs font-medium text-muted-foreground">
                      Value
                      <Input
                        defaultValue={line.value}
                        key={`${line.id}-${line.value}`}
                        onBlur={(event) => {
                          const value = Number(event.target.value);

                          if (Number.isFinite(value)) {
                            updateReferenceLine(line.id, { value });
                          }
                        }}
                        type="number"
                      />
                    </label>
                    <Button
                      aria-label="Delete reference line"
                      onClick={(event) => {
                        event.preventDefault();
                        onChange({
                          referenceLines: referenceLines.filter(
                            (item) => item.id !== line.id,
                          ),
                        });
                      }}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                    Label
                    <Input
                      defaultValue={line.label}
                      key={`${line.id}-${line.label}`}
                      onBlur={(event) =>
                        updateReferenceLine(line.id, {
                          label: event.target.value,
                        })
                      }
                      placeholder="Label"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                      Style
                      <Select
                        onValueChange={(value) =>
                          updateReferenceLine(line.id, {
                            style: value as DatabaseChartReferenceLine["style"],
                          })
                        }
                        value={line.style}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {referenceLineStyleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                      Color
                      <Select
                        onValueChange={(value) =>
                          updateReferenceLine(line.id, {
                            color: value as DatabaseChartReferenceLine["color"],
                          })
                        }
                        value={line.color}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="black">Black</SelectItem>
                          {cyclingColorTokens.flatMap((color) =>
                            color.value ? (
                              <SelectItem key={color.value} value={color.value}>
                                {color.name}
                              </SelectItem>
                            ) : (
                              []
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                </div>
              ))}
              <Button
                className="w-full"
                onClick={(event) => {
                  event.preventDefault();
                  onChange({
                    referenceLines: [
                      ...referenceLines,
                      createDatabaseChartReferenceLine(),
                    ],
                  });
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus />
                Add reference line
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : null}

      <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        Style
      </DropDrawerLabel>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<Palette />}
            label="Color"
            right={colorLabel}
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-64">
          <DropDrawerItem onSelect={() => onChange({ color: "auto" })}>
            <span
              className="size-3 rounded-sm border"
              style={{ background: colorSwatch }}
            />
            <span>Auto</span>
            {settings.color === "auto" ? (
              <Check className="ml-auto text-foreground" />
            ) : null}
          </DropDrawerItem>
          {cyclingColorTokens.map((color) => (
            <DropDrawerItem
              key={color.value}
              onSelect={() =>
                color.value &&
                onChange({
                  color: color.value as DatabaseChartSettings["color"],
                })
              }
            >
              <span className={cn("size-3 rounded-sm border", color.backgroundClass)} />
              <span>{color.name}</span>
              {settings.color === color.value ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
          ))}
        </DropDrawerSubContent>
      </DropDrawerSub>
    </>
  );
}

function getChartSortOptions(axisLabel: string, measureLabel: string) {
  return [
    { label: "Manual", value: "manual" },
    { label: `${axisLabel} ascending`, value: "axis-asc" },
    { label: `${axisLabel} descending`, value: "axis-desc" },
    { label: `${measureLabel} low → high`, value: "value-asc" },
    { label: `${measureLabel} high → low`, value: "value-desc" },
  ] satisfies Array<{ label: string; value: DatabaseChartSort }>;
}

function isChartDateProperty(property: DatabaseViewProperty) {
  return ["date", "created_time", "edited_time"].includes(
    property.property.type,
  );
}

function getChartAxisGroups(property: DatabaseViewProperty | undefined) {
  if (property?.property.type === "checkbox") {
    return [
      { color: "green", name: "True" },
      { color: "gray", name: "False" },
    ];
  }

  const config = property?.property.config;

  if (!config || typeof config !== "object" || !("options" in config)) {
    return [];
  }

  const options = (config as { options?: unknown }).options;

  return Array.isArray(options)
    ? options.flatMap((option) =>
        option &&
        typeof option === "object" &&
        typeof (option as { name?: unknown }).name === "string"
          ? [
              {
                color:
                  typeof (option as { color?: unknown }).color === "string"
                    ? (option as { color: string }).color
                    : undefined,
                name: (option as { name: string }).name,
              },
            ]
          : [],
      )
    : [];
}

function getChartDateIntervalLabel(interval: DatabaseChartDateInterval) {
  return (
    chartDateIntervalOptions.find((option) => option.value === interval)
      ?.label ?? "Day"
  );
}

function getChartRangeLabel(settings: DatabaseChartSettings) {
  if (settings.rangeMin === undefined && settings.rangeMax === undefined) {
    return "Auto";
  }

  return `${settings.rangeMin ?? "Auto"} – ${settings.rangeMax ?? "Auto"}`;
}

function parseOptionalChartNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function createDatabaseChartReferenceLine(): DatabaseChartReferenceLine {
  return {
    color: "black",
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `reference-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: "",
    style: "dashed",
    value: 0,
  };
}

function DataSourceSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function DataSourceAddGlyph() {
  return (
    <span className="inline-flex size-4 items-center justify-center text-base leading-none text-muted-foreground">
      +
    </span>
  );
}

function DataSourceMenuItem({ item }: { item: DatabaseSourceMenuItem }) {
  const viewLabel = `${item.viewCount} view${item.viewCount === 1 ? "" : "s"}`;

  return (
    <DropDrawerItem disabled>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Database className="text-muted-foreground" />
        <span className="truncate">{item.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {viewLabel}
        </span>
        <MoreHorizontal className="text-muted-foreground" />
      </div>
    </DropDrawerItem>
  );
}

function LinkedDataSourceMenuItem({
  view,
}: {
  view: DatabaseLinkedViewConfig;
}) {
  const ViewIcon =
    view.viewType === "kanban"
      ? Kanban
      : view.viewType === "timeline"
        ? CalendarRange
        : view.viewType === "chart"
          ? ChartPie
          : view.viewType === "gallery"
            ? GalleryThumbnails
            : view.viewType === "list"
              ? List
              : Table2;

  return (
    <DropDrawerItem disabled>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ViewIcon className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate">{view.viewName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {view.databaseName}
          </div>
        </div>
        <ArrowUpRightIcon
          aria-label="Linked from another database"
          className="size-3 text-muted-foreground"
        />
      </div>
    </DropDrawerItem>
  );
}

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
      <div className="grid grid-cols-3 border-b text-[11px] text-muted-foreground">
        <div className="px-2 py-1.5">Aa Name</div>
        <div className="border-l px-2 py-1.5">Office</div>
        <div className="border-l px-2 py-1.5 text-right"># Units</div>
      </div>
      {[
        ["Keesha", "Miami", "160", "bg-emerald-100 dark:bg-emerald-700/55"],
        ["Rahul", "Orlando", "120", ""],
        ["Jackson", "Tampa", "140", "bg-emerald-100 dark:bg-emerald-700/55"],
        ["Marcus", "Tampa", "100", "bg-amber-100 dark:bg-amber-700/50"],
        ["John", "Miami", "100", "bg-rose-100 dark:bg-rose-700/55"],
      ].map(([name, office, units, colorClass]) => (
        <div
          className={cn("grid grid-cols-3 text-xs text-foreground", colorClass)}
          key={name}
        >
          <div className="px-2 py-1.5">{name}</div>
          <div className="border-l border-border/40 px-2 py-1.5">{office}</div>
          <div className="border-l border-border/40 px-2 py-1.5 text-right">
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
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="Search for a property"
          autoFocus
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
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
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          ))
        ) : (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
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
                    color.backgroundClass,
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
                        option.backgroundClass,
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
          <div className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
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

function ConditionalColorPanel({
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

export function DatabaseViewSettingsMenu({
  activeConditionalColors,
  allContentWrapped,
  activeDatabaseFilters,
  activeDatabaseSorts,
  activeViewType,
  dateProperties = [],
  datePropertyId = null,
  addableFilterFieldOptions,
  addableSortFieldOptions,
  canAddDatabaseFilter,
  canAddDatabaseSort,
  chartSettings,
  layoutSettings,
  databaseId,
  databaseName,
  dataSources,
  draftViewTitle,
  filterFieldOptions,
  filterValueOptionsByField,
  groupProperties,
  groupPropertyId,
  linkedViews = [],
  titlePropertyLabel,
  open: controlledOpen,
  workspaceId,
  onAddLinkedDatabaseView,
  onCopyDatabaseViewLink,
  onOpenChange,
  onClearDatabaseFilter,
  onClearDatabaseSort,
  onCreateDatabaseFilter,
  onCreateDatabaseSort,
  onDraftViewTitleChange,
  onRemoveDatabaseFilter,
  onRemoveDatabaseSort,
  onReorderDatabaseFilters,
  onSaveDatabaseConditionalColors,
  onSaveDatabaseViewTitle,
  onSetAllContentWrapped,
  onSetViewDateProperty,
  onSetViewGroupProperty,
  onSetViewType,
  onShowPageIconChange,
  onShowTitleChange,
  onTogglePropertyTitles,
  onTogglePropertyVisibility,
  onUpdateDatabaseFilter,
  onUpdateDatabaseChartSettings,
  onUpdateDatabaseLayoutSettings,
  onUpdateDatabaseSort,
  properties,
  presentation = "menu",
  portalTarget,
  sortFieldOptions,
  sourceDatabaseId,
  viewConfig,
  visiblePropertyCount,
  showPropertyTitles,
  showPageIcon,
  showTitle,
}: {
  activeConditionalColors: DatabaseActiveConditionalColor[];
  allContentWrapped: boolean;
  activeDatabaseFilters: DatabaseActiveFilter[];
  activeDatabaseSorts: DatabaseActiveSort[];
  activeViewType?: string;
  dateProperties?: DatabaseViewProperty[];
  datePropertyId?: string | null;
  addableFilterFieldOptions: DatabaseSearchableMenuOption[];
  addableSortFieldOptions: DatabaseSearchableMenuOption[];
  canAddDatabaseFilter: boolean;
  canAddDatabaseSort: boolean;
  chartSettings: DatabaseChartSettings;
  layoutSettings: DatabaseLayoutSettings;
  databaseId?: string;
  databaseName?: string;
  dataSources: DatabaseSourceMenuItem[];
  draftViewTitle: string;
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  groupProperties: DatabaseViewProperty[];
  groupPropertyId: string | null;
  linkedViews?: DatabaseLinkedViewConfig[];
  titlePropertyLabel: string;
  open?: boolean;
  workspaceId?: string;
  onAddLinkedDatabaseView: (view: DatabaseLinkedViewConfig) => void;
  onCopyDatabaseViewLink: () => void;
  onOpenChange?: (open: boolean) => void;
  onClearDatabaseFilter: () => void;
  onClearDatabaseSort: () => void;
  onCreateDatabaseFilter: (field: string) => void;
  onCreateDatabaseSort: (field: string) => void;
  onDraftViewTitleChange: (title: string) => void;
  onRemoveDatabaseFilter: (index: number) => void;
  onRemoveDatabaseSort: (index: number) => void;
  onReorderDatabaseFilters: (filterIds: string[]) => void;
  onSaveDatabaseConditionalColors: (
    settings: DatabaseConditionalColorConfig[],
  ) => void;
  onSaveDatabaseViewTitle: (title: string) => void;
  onSetAllContentWrapped: (wrapContent: boolean) => void;
  onSetViewDateProperty: (datePropertyId: string | null) => void;
  onSetViewGroupProperty: (groupPropertyId: string | null) => void;
  onSetViewType: (
    type: "table" | "kanban" | "timeline" | "chart" | "gallery" | "list",
  ) => void;
  onShowPageIconChange: (showPageIcon: boolean) => void;
  onShowTitleChange?: (showTitle: boolean) => void;
  onTogglePropertyTitles: () => void;
  onTogglePropertyVisibility: (propertyId: string) => void;
  onUpdateDatabaseFilter: (
    index: number,
    patch: DatabaseFilterUpdatePatch,
  ) => void;
  onUpdateDatabaseChartSettings: (
    settings: Partial<DatabaseChartSettings>,
  ) => void;
  onUpdateDatabaseLayoutSettings: (
    settings: Partial<DatabaseLayoutSettings>,
  ) => void;
  onUpdateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void;
  properties: DatabaseViewProperty[];
  presentation?: "menu" | "sidebar";
  portalTarget?: HTMLElement | null;
  sortFieldOptions: DatabaseSearchableMenuOption[];
  sourceDatabaseId?: string;
  viewConfig?: unknown;
  visiblePropertyCount: number;
  showPropertyTitles: boolean;
  showPageIcon: boolean;
  showTitle: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };
  const [manageDataSourcesOpen, setManageDataSourcesOpen] = useState(false);
  const [showLinkExistingPicker, setShowLinkExistingPicker] = useState(false);
  const [selectedLinkDatabaseId, setSelectedLinkDatabaseId] = useState<
    string | null
  >(null);
  const {
    data: selectedLinkDatabasePayload,
    isLoading: isLoadingSelectedLinkDatabase,
  } = useDatabase(selectedLinkDatabaseId);
  const { data: navigation, isLoading: isLoadingPages } = usePageNavigation(
    workspaceId,
    {
      enabled: manageDataSourcesOpen || showLinkExistingPicker,
    },
  );
  const isKanbanView = activeViewType === "kanban";
  const isTimelineView = activeViewType === "timeline";
  const isChartView = activeViewType === "chart";
  const isGalleryView = activeViewType === "gallery";
  const isListView = activeViewType === "list";
  const isTableView = !activeViewType || activeViewType === "table";
  const ViewTypeIcon = isKanbanView
    ? Kanban
    : isTimelineView
      ? CalendarRange
      : isChartView
        ? ChartPie
        : isGalleryView
          ? GalleryThumbnails
          : isListView
            ? List
            : Table2;
  const viewTypeLabel = isKanbanView
    ? "Kanban"
    : isTimelineView
      ? "Timeline"
      : isChartView
        ? "Chart"
        : isGalleryView
          ? "Gallery"
          : isListView
            ? "List"
            : "Table";
  const activeDateProperty = dateProperties.find(
    (property) => property.property.id === datePropertyId,
  );
  const activeGroupProperty = groupProperties.find(
    (property) => property.property.id === groupPropertyId,
  );
  const visibleCardProperties = properties.filter(
    (property) =>
      !getPropertyHiddenForView(
        property.id,
        property.property.config,
        viewConfig,
      ),
  );
  const pagesById = new Map(
    (navigation?.pages ?? []).map((page) => [page.id, page]),
  );
  const linkableDatabaseOptions = (navigation?.databases ?? [])
    .filter((database) => database.id !== sourceDatabaseId)
    .map<LinkableDatabaseOption>((database) => {
      const pageName = database.pageId
        ? pagesById.get(database.pageId)?.name || "Untitled"
        : "Standalone";

      return {
        icon: <Database />,
        label: database.name,
        searchText: `${database.name} ${pageName}`.trim(),
        value: database.id,
        pageName,
      };
    });
  const selectedDatabaseOption = selectedLinkDatabaseId
    ? linkableDatabaseOptions.find(
        (option) => option.value === selectedLinkDatabaseId,
      )
    : null;
  const linkedViewKeys = new Set(
    linkedViews.map((linkedView) => getDatabaseLinkedViewKey(linkedView)),
  );
  const linkableDatabaseViewOptions =
    selectedLinkDatabasePayload?.views.map<LinkableDatabaseViewOption>(
      (view) => {
        const ViewIcon =
          view.type === "kanban"
            ? Kanban
            : view.type === "timeline"
              ? CalendarRange
              : view.type === "chart"
                ? ChartPie
                : view.type === "gallery"
                  ? GalleryThumbnails
                  : view.type === "list"
                    ? List
                    : Table2;

        return {
          icon: <ViewIcon />,
          label: view.name,
          searchText:
            `${view.name} ${selectedLinkDatabasePayload.database.name}`.trim(),
          value: view.id,
          viewType: view.type,
        };
      },
    ) ?? [];

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      setManageDataSourcesOpen(false);
      setShowLinkExistingPicker(false);
      setSelectedLinkDatabaseId(null);
    }
  };

  useEffect(() => {
    if (presentation !== "sidebar" || !open) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") handleOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, presentation]);

  useEffect(() => {
    if (open) return;

    setManageDataSourcesOpen(false);
    setShowLinkExistingPicker(false);
    setSelectedLinkDatabaseId(null);
  }, [open]);

  const settingsContent = (
    <>
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="text-sm font-semibold text-foreground">
            View settings
          </div>
          <Button
            aria-label="Close view settings"
            className="text-muted-foreground"
            onClick={() => setOpen(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <ViewTypeIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="View name"
            className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            defaultValue={draftViewTitle}
            key={draftViewTitle}
            onBlur={(event) => {
              const nextTitle = event.target.value.trim();

              if (nextTitle !== draftViewTitle) {
                onDraftViewTitleChange(nextTitle);
                onSaveDatabaseViewTitle(nextTitle);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            placeholder="Untitled view"
          />
        </div>
        <DropDrawerSeparator />
        <DropDrawerSub displayMode="inline" title="Layout">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<ViewTypeIcon />}
              label="Layout"
              right={viewTypeLabel}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="max-h-[min(46rem,calc(100vh-2rem))] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto p-1">
            <div className="grid grid-cols-3 gap-1.5 px-1 pb-1">
              {[
                { icon: Table2, label: "Table", type: "table" as const },
                { icon: Kanban, label: "Board", type: "kanban" as const },
                {
                  icon: CalendarRange,
                  label: "Timeline",
                  type: "timeline" as const,
                },
                { icon: List, label: "List", type: "list" as const },
                {
                  icon: GalleryThumbnails,
                  label: "Gallery",
                  type: "gallery" as const,
                },
                { icon: ChartPie, label: "Chart", type: "chart" as const },
              ].map((option) => {
                const selected = activeViewType === option.type;

                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "flex h-20 flex-col items-center justify-center gap-1.5 rounded-md border text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                      selected &&
                        "border-primary bg-primary/10 text-primary",
                    )}
                    key={option.type}
                    onClick={(event) => {
                      event.preventDefault();
                      onSetViewType(option.type);
                    }}
                    type="button"
                  >
                    <option.icon className="size-5" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <DropDrawerSeparator />
            <DropDrawerItem
              aria-pressed={showTitle}
              disabled={!onShowTitleChange}
              onSelect={(event) => {
                event.preventDefault();
                onShowTitleChange?.(!showTitle);
              }}
            >
              <span>Show data source titles</span>
              <Switch
                checked={showTitle}
                className="pointer-events-none ml-auto"
                size="sm"
                tabIndex={-1}
              />
            </DropDrawerItem>
            {!isChartView ? (
              <DropDrawerItem
                aria-pressed={showPageIcon}
                onSelect={(event) => {
                  event.preventDefault();
                  onShowPageIconChange(!showPageIcon);
                }}
              >
                <span>Show page icon</span>
                <Switch
                  checked={showPageIcon}
                  className="pointer-events-none ml-auto"
                  size="sm"
                  tabIndex={-1}
                />
              </DropDrawerItem>
            ) : null}
            {isTableView ? (
              <DropDrawerItem
                aria-pressed={allContentWrapped}
                onSelect={(event) => {
                  event.preventDefault();
                  onSetAllContentWrapped(!allContentWrapped);
                }}
              >
                <span>
                  {allContentWrapped
                    ? "Unwrap all content"
                    : "Wrap all content"}
                </span>
              </DropDrawerItem>
            ) : !isChartView && !isTimelineView ? (
              <DropDrawerItem
                aria-pressed={layoutSettings.wrapAllContent}
                onSelect={(event) => {
                  event.preventDefault();
                  onUpdateDatabaseLayoutSettings({
                    wrapAllContent: !layoutSettings.wrapAllContent,
                  });
                }}
              >
                <span>Wrap all content</span>
                <Switch
                  checked={layoutSettings.wrapAllContent}
                  className="pointer-events-none ml-auto"
                  size="sm"
                  tabIndex={-1}
                />
              </DropDrawerItem>
            ) : null}
            {!isKanbanView &&
            !isTimelineView &&
            !isChartView &&
            !isGalleryView &&
            !isListView ? (
              <DropDrawerItem
                aria-pressed={layoutSettings.showVerticalLines}
                onSelect={(event) => {
                  event.preventDefault();
                  onUpdateDatabaseLayoutSettings({
                    showVerticalLines: !layoutSettings.showVerticalLines,
                  });
                }}
              >
                <span>Show vertical lines</span>
                <Switch
                  checked={layoutSettings.showVerticalLines}
                  className="pointer-events-none ml-auto"
                  size="sm"
                  tabIndex={-1}
                />
              </DropDrawerItem>
            ) : null}
            {isKanbanView || isGalleryView ? (
              <DropDrawerSub>
                <DropDrawerSubTrigger>
                  <ViewSettingsRow
                    icon={<GripVertical />}
                    label="Group by"
                    right={activeGroupProperty?.property.name ?? "None"}
                  />
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-72">
                  <DropDrawerItem onSelect={() => onSetViewGroupProperty(null)}>
                    <GripVertical />
                    <span>No grouping</span>
                    {groupPropertyId === null ? (
                      <Check className="ml-auto text-foreground" />
                    ) : null}
                  </DropDrawerItem>
                  {groupProperties.map((property) => {
                    const PropertyIcon = getDatabasePropertyType(
                      property.property.type,
                    ).icon;

                    return (
                      <DropDrawerItem
                        key={property.id}
                        onSelect={() =>
                          onSetViewGroupProperty(property.property.id)
                        }
                      >
                        <PropertyIcon />
                        <span>{property.property.name}</span>
                        {property.property.id === groupPropertyId ? (
                          <Check className="ml-auto text-foreground" />
                        ) : null}
                      </DropDrawerItem>
                    );
                  })}
                </DropDrawerSubContent>
              </DropDrawerSub>
            ) : null}
            {isKanbanView ? (
              <DropDrawerItem
                aria-pressed={showPropertyTitles}
                onSelect={(event) => {
                  event.preventDefault();
                  onTogglePropertyTitles();
                }}
              >
                <span>Show property titles</span>
                <Switch
                  checked={showPropertyTitles}
                  className="pointer-events-none ml-auto"
                  size="sm"
                  tabIndex={-1}
                />
              </DropDrawerItem>
            ) : null}
            {isTimelineView ? (
              <DropDrawerSub>
                <DropDrawerSubTrigger>
                  <ViewSettingsRow
                    icon={<CalendarRange />}
                    label="Show timeline by"
                    right={activeDateProperty?.property.name ?? "None"}
                  />
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-72">
                  {dateProperties.length > 0 ? (
                    dateProperties.map((property) => {
                      const PropertyIcon = getDatabasePropertyType(
                        property.property.type,
                      ).icon;

                      return (
                        <DropDrawerItem
                          key={property.id}
                          onSelect={() =>
                            onSetViewDateProperty(property.property.id)
                          }
                        >
                          <PropertyIcon />
                          <span>{property.property.name}</span>
                          {property.property.id === datePropertyId ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                      );
                    })
                  ) : (
                    <DropDrawerItem disabled>No date properties yet</DropDrawerItem>
                  )}
                </DropDrawerSubContent>
              </DropDrawerSub>
            ) : null}
            {isGalleryView ? (
              <>
                <DropDrawerSub>
                  <DropDrawerSubTrigger>
                    <ViewSettingsRow
                      icon={<ImageIcon />}
                      label="Card preview"
                      right={
                        layoutSettings.cardPreview === "page-cover"
                          ? "Page cover"
                          : "None"
                      }
                    />
                  </DropDrawerSubTrigger>
                  <DropDrawerSubContent className="w-72">
                    <DropDrawerItem
                      onSelect={() =>
                        onUpdateDatabaseLayoutSettings({
                          cardPreview: "page-cover",
                        })
                      }
                    >
                      <ImageIcon />
                      <span>Page cover</span>
                      {layoutSettings.cardPreview === "page-cover" ? (
                        <Check className="ml-auto text-foreground" />
                      ) : null}
                    </DropDrawerItem>
                    <DropDrawerItem
                      onSelect={() =>
                        onUpdateDatabaseLayoutSettings({
                          cardPreview: "none",
                        })
                      }
                    >
                      <EyeOff />
                      <span>None</span>
                      {layoutSettings.cardPreview === "none" ? (
                        <Check className="ml-auto text-foreground" />
                      ) : null}
                    </DropDrawerItem>
                  </DropDrawerSubContent>
                </DropDrawerSub>
                <div className="flex min-h-8 items-center gap-2 px-2 py-1 text-sm">
                  <span>Card size</span>
                  <div className="ml-auto flex rounded-md bg-muted p-0.5">
                    {(["small", "medium", "large"] as const).map((size) => (
                      <button
                        className={cn(
                          "rounded px-2 py-1 text-xs capitalize text-muted-foreground",
                          layoutSettings.cardSize === size &&
                            "bg-background text-foreground shadow-sm",
                        )}
                        key={size}
                        onClick={() =>
                          onUpdateDatabaseLayoutSettings({ cardSize: size })
                        }
                        type="button"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1 rounded-md bg-muted/40 p-2">
                  <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                    Card layout
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["compact", "list"] as const).map((cardLayout) => (
                      <button
                        className={cn(
                          "rounded-md border p-1.5 text-xs font-medium capitalize text-muted-foreground",
                          layoutSettings.cardLayout === cardLayout &&
                            "border-primary text-primary ring-1 ring-primary",
                        )}
                        key={cardLayout}
                        onClick={() =>
                          onUpdateDatabaseLayoutSettings({ cardLayout })
                        }
                        type="button"
                      >
                        <span className="mb-1.5 block h-12 rounded bg-background p-2">
                          <span className="mb-2 block size-3 rounded-full bg-current opacity-60" />
                          {cardLayout === "compact" ? (
                            <span className="flex flex-wrap gap-1">
                              <span className="block h-1.5 w-8 rounded bg-current opacity-30" />
                              <span className="block h-1.5 w-5 rounded bg-current opacity-30" />
                              <span className="block h-1.5 w-7 rounded bg-current opacity-30" />
                            </span>
                          ) : (
                            <span className="flex flex-col gap-1">
                              <span className="block h-1.5 w-3/4 rounded bg-current opacity-30" />
                              <span className="block h-1.5 w-1/2 rounded bg-current opacity-30" />
                              <span className="block h-1.5 w-2/3 rounded bg-current opacity-30" />
                            </span>
                          )}
                        </span>
                        {cardLayout}
                      </button>
                    ))}
                  </div>
                </div>
                {layoutSettings.cardLayout === "compact" ? (
                  <DropDrawerSub>
                    <DropDrawerSubTrigger>
                      <Settings2 />
                      <span>Compact card settings</span>
                    </DropDrawerSubTrigger>
                    <DropDrawerSubContent className="w-72">
                      <div className="px-2 pb-2 pt-1">
                        <div className="rounded-md bg-muted/40 p-3">
                          <div className="rounded-md border bg-background p-3">
                            <div className="mb-3 h-2.5 w-24 rounded bg-muted-foreground/30" />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="size-3 rounded-full bg-muted-foreground/25" />
                              <span className="h-2 w-14 rounded bg-muted-foreground/20" />
                              <span className="h-2 w-9 rounded bg-muted-foreground/20" />
                              <span className="h-3 w-3 rounded-sm bg-muted-foreground/20" />
                              <span className="h-2 w-12 rounded bg-muted-foreground/20" />
                            </div>
                          </div>
                        </div>
                        <p className="px-1 pt-2 text-xs leading-5 text-muted-foreground">
                          Enabled properties appear on their own line instead
                          of wrapping with other properties.
                        </p>
                      </div>
                      <DropDrawerLabel>Full line display</DropDrawerLabel>
                      <DropDrawerItem
                        aria-pressed="true"
                        onSelect={(event) => event.preventDefault()}
                      >
                        <NameColumnGlyph />
                        <span>{titlePropertyLabel}</span>
                        <Switch
                          checked
                          className="pointer-events-none ml-auto"
                          disabled
                          size="sm"
                          tabIndex={-1}
                        />
                      </DropDrawerItem>
                      {visibleCardProperties.length > 0 ? (
                        visibleCardProperties.map((property) => {
                          const PropertyIcon = getDatabasePropertyType(
                            property.property.type,
                          ).icon;
                          const fullLine =
                            layoutSettings.fullLinePropertyIds.includes(
                              property.id,
                            );

                          return (
                            <DropDrawerItem
                              aria-pressed={fullLine}
                              key={property.id}
                              onSelect={(event) => {
                                event.preventDefault();
                                onUpdateDatabaseLayoutSettings({
                                  fullLinePropertyIds: fullLine
                                    ? layoutSettings.fullLinePropertyIds.filter(
                                        (propertyId) =>
                                          propertyId !== property.id,
                                      )
                                    : [
                                        ...layoutSettings.fullLinePropertyIds,
                                        property.id,
                                      ],
                                });
                              }}
                            >
                              <PropertyIcon />
                              <span>{property.property.name}</span>
                              <Switch
                                checked={fullLine}
                                className="pointer-events-none ml-auto"
                                size="sm"
                                tabIndex={-1}
                              />
                            </DropDrawerItem>
                          );
                        })
                      ) : (
                        <DropDrawerItem disabled>
                          No visible properties
                        </DropDrawerItem>
                      )}
                      <DropDrawerSeparator />
                      <DropDrawerSub>
                        <DropDrawerSubTrigger>
                          <Eye />
                          <span>Show properties</span>
                        </DropDrawerSubTrigger>
                        <DropDrawerSubContent className="w-72">
                          <DropDrawerItem disabled>
                            <NameColumnGlyph />
                            <span>{titlePropertyLabel}</span>
                            <Eye className="ml-auto text-muted-foreground" />
                          </DropDrawerItem>
                          {properties.map((property) => {
                            const PropertyIcon = getDatabasePropertyType(
                              property.property.type,
                            ).icon;
                            const visible = visibleCardProperties.some(
                              (candidate) => candidate.id === property.id,
                            );

                            return (
                              <DropDrawerItem
                                aria-pressed={visible}
                                key={property.id}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  onTogglePropertyVisibility(property.id);
                                }}
                              >
                                <PropertyIcon />
                                <span>{property.property.name}</span>
                                {visible ? (
                                  <Eye className="ml-auto text-muted-foreground" />
                                ) : (
                                  <EyeOff className="ml-auto text-muted-foreground" />
                                )}
                              </DropDrawerItem>
                            );
                          })}
                        </DropDrawerSubContent>
                      </DropDrawerSub>
                    </DropDrawerSubContent>
                  </DropDrawerSub>
                ) : null}
              </>
            ) : null}
            {isChartView ? (
              <DatabaseChartSettingsSection
                onChange={onUpdateDatabaseChartSettings}
                properties={properties}
                settings={chartSettings}
                titlePropertyLabel={titlePropertyLabel}
              />
            ) : null}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub displayMode="inline" title="Property visibility">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<Eye />}
              label="Property visibility"
              right={visiblePropertyCount}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DropDrawerItem disabled>
              <NameColumnGlyph />
              <span>{titlePropertyLabel}</span>
              <Eye className="ml-auto text-muted-foreground" />
            </DropDrawerItem>
            {properties.map((property) => {
              const PropertyIcon = getDatabasePropertyType(
                property.property.type,
              ).icon;
              const visible = !getPropertyHiddenForView(
                property.id,
                property.property.config,
                viewConfig,
              );

              return (
                <DropDrawerItem
                  aria-pressed={visible}
                  key={property.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    onTogglePropertyVisibility(property.id);
                  }}
                >
                  <PropertyIcon />
                  <span>{property.property.name}</span>
                  {visible ? (
                    <Eye className="ml-auto text-muted-foreground" />
                  ) : (
                    <EyeOff className="ml-auto text-muted-foreground" />
                  )}
                </DropDrawerItem>
              );
            })}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DatabaseFilterSubmenu
          activeDatabaseFilters={activeDatabaseFilters}
          addableFilterFieldOptions={addableFilterFieldOptions}
          canAddDatabaseFilter={canAddDatabaseFilter}
          filterFieldOptions={filterFieldOptions}
          filterValueOptionsByField={filterValueOptionsByField}
          onClearDatabaseFilter={onClearDatabaseFilter}
          onCreateDatabaseFilter={onCreateDatabaseFilter}
          onRemoveDatabaseFilter={onRemoveDatabaseFilter}
          onReorderDatabaseFilters={onReorderDatabaseFilters}
          onUpdateDatabaseFilter={onUpdateDatabaseFilter}
          displayMode="inline"
          title="Filter"
        >
          <ViewSettingsRow
            icon={<Filter />}
            label="Filter"
            right={
              activeDatabaseFilters.length > 0
                ? activeDatabaseFilters.length
                : undefined
            }
          />
        </DatabaseFilterSubmenu>
        <DatabaseSortSubmenu
          activeDatabaseSorts={activeDatabaseSorts}
          addableSortFieldOptions={addableSortFieldOptions}
          canAddDatabaseSort={canAddDatabaseSort}
          onClearDatabaseSort={onClearDatabaseSort}
          onCreateDatabaseSort={onCreateDatabaseSort}
          onRemoveDatabaseSort={onRemoveDatabaseSort}
          onUpdateDatabaseSort={onUpdateDatabaseSort}
          sortFieldOptions={sortFieldOptions}
          displayMode="inline"
          title="Sort"
        >
          <ViewSettingsRow
            icon={<ArrowDownUp />}
            label="Sort"
            right={
              activeDatabaseSorts.length > 0
                ? activeDatabaseSorts.length
                : undefined
            }
          />
        </DatabaseSortSubmenu>
        <DropDrawerSub displayMode="inline" title="Group">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<GripVertical />}
              label="Group"
              right={activeGroupProperty?.property.name ?? "None"}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DropDrawerItem onSelect={() => onSetViewGroupProperty(null)}>
              <GripVertical />
              <span>No grouping</span>
              {groupPropertyId === null ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
            {groupProperties.length > 0 ? (
              groupProperties.map((property) => {
                const PropertyIcon = getDatabasePropertyType(
                  property.property.type,
                ).icon;
                const isSelected = property.property.id === groupPropertyId;

                return (
                  <DropDrawerItem
                    key={property.id}
                    onSelect={() =>
                      onSetViewGroupProperty(property.property.id)
                    }
                  >
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                    {isSelected ? (
                      <Check className="ml-auto text-foreground" />
                    ) : null}
                  </DropDrawerItem>
                );
              })
            ) : (
              <DropDrawerItem disabled>
                No groupable properties yet
              </DropDrawerItem>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub displayMode="inline" title="Conditional color">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<Palette />}
              label="Conditional color"
              right={
                activeConditionalColors.length > 0
                  ? activeConditionalColors.length
                  : undefined
              }
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-80">
            <ConditionalColorPanel
              filterFieldOptions={filterFieldOptions}
              filterValueOptionsByField={filterValueOptionsByField}
              properties={properties}
              settings={activeConditionalColors}
              onSettingsChange={onSaveDatabaseConditionalColors}
            />
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerItem onSelect={onCopyDatabaseViewLink}>
          <LinkIcon />
          <span>Copy link to view</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Data source settings
        </DropDrawerLabel>
        <DropDrawerItem disabled>
          <ViewSettingsRow
            icon={<Database />}
            label="Source"
            right={
              <span className="block max-w-28 truncate">
                {databaseName || "Untitled database"}
              </span>
            }
          />
        </DropDrawerItem>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Settings2 />
            <span>Edit properties</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DatabaseSearchableMenuItems
              emptyMessage="No properties yet."
              inputAriaLabel="Edit properties"
              inputIcon={<Settings2 className="size-4" />}
              inputPlaceholder="Edit property..."
              open={open}
              options={properties
                .filter((property) =>
                  hasDatabasePropertyEditSettings(property.property.type),
                )
                .map((property) => {
                  const PropertyIcon = getDatabasePropertyType(
                    property.property.type,
                  ).icon;

                  return {
                    icon: <PropertyIcon />,
                    label: property.property.name,
                    value: property.id,
                  };
                })}
              renderOption={(option) => {
                const property = properties.find(
                  (candidate) => candidate.id === option.value,
                );

                if (!property || !databaseId) {
                  return (
                    <DropDrawerItem disabled>
                      {option.icon}
                      <span>{option.label}</span>
                    </DropDrawerItem>
                  );
                }

                return (
                  <DatabasePropertyEditSubmenu
                    config={property.property.config}
                    databaseId={databaseId}
                    databasePropertyId={property.id}
                    sourceDatabaseId={sourceDatabaseId}
                    sourceDatabaseName={databaseName}
                    sourcePropertyId={property.property.id}
                    type={property.property.type}
                    workspaceId={workspaceId}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </DatabasePropertyEditSubmenu>
                );
              }}
            />
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Sparkles />
            <span>Automations</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Automation settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Sparkles />
            <span>AI Autofill</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>AI Autofill settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <FileText />
            <span>View archived pages</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Archived pages</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <MoreHorizontal />
            <span>More settings</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>More database settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSeparator />
        <DropDrawerSub
          onOpenChange={(nextOpen) => {
            setManageDataSourcesOpen(nextOpen);

            if (!nextOpen) {
              setShowLinkExistingPicker(false);
              setSelectedLinkDatabaseId(null);
            }
          }}
          open={manageDataSourcesOpen}
        >
          <DropDrawerSubTrigger>
            <Database />
            <span>Manage data sources</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-80 overflow-hidden">
            {showLinkExistingPicker ? (
              <div className="h-96 overflow-y-auto overscroll-contain">
                <DropDrawerItem
                  onSelect={(event) => {
                    event.preventDefault();
                    if (selectedLinkDatabaseId) {
                      setSelectedLinkDatabaseId(null);
                    } else {
                      setShowLinkExistingPicker(false);
                    }
                  }}
                >
                  <ChevronLeft />
                  <span>Back</span>
                </DropDrawerItem>
                <DropDrawerSeparator />
                {selectedLinkDatabaseId ? (
                  isLoadingSelectedLinkDatabase ? (
                    <DropDrawerItem disabled>Loading views...</DropDrawerItem>
                  ) : selectedLinkDatabasePayload ? (
                    <DatabaseSearchableMenuItems
                      emptyMessage="No views available."
                      inputAriaLabel="Search database views"
                      inputIcon={<Search className="size-4" />}
                      inputPlaceholder="Search views..."
                      open={
                        manageDataSourcesOpen &&
                        showLinkExistingPicker &&
                        Boolean(selectedLinkDatabaseId)
                      }
                      options={linkableDatabaseViewOptions}
                      renderOption={(option) => {
                        const viewOption = option as LinkableDatabaseViewOption;
                        const linkedView = {
                          databaseId: selectedLinkDatabasePayload.database.id,
                          databaseName:
                            selectedLinkDatabasePayload.database.name ||
                            selectedDatabaseOption?.label ||
                            "Untitled database",
                          viewId: viewOption.value,
                          viewName: viewOption.label,
                          viewType: viewOption.viewType,
                        };
                        const alreadyLinked = linkedViewKeys.has(
                          getDatabaseLinkedViewKey(linkedView),
                        );

                        return (
                          <DropDrawerItem
                            key={viewOption.value}
                            onSelect={(event) => {
                              event.preventDefault();
                              onAddLinkedDatabaseView(linkedView);
                              setOpen(false);
                            }}
                          >
                            {viewOption.icon}
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{viewOption.label}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {selectedLinkDatabasePayload.database.name ||
                                  selectedDatabaseOption?.label ||
                                  "Untitled database"}
                              </div>
                            </div>
                            {alreadyLinked ? (
                              <Check className="ml-auto text-foreground" />
                            ) : null}
                          </DropDrawerItem>
                        );
                      }}
                    />
                  ) : (
                    <DropDrawerItem disabled>
                      Database unavailable.
                    </DropDrawerItem>
                  )
                ) : isLoadingPages ? (
                  <DropDrawerItem disabled>Loading databases...</DropDrawerItem>
                ) : (
                  <DatabaseSearchableMenuItems
                    emptyMessage="No databases available."
                    inputAriaLabel="Search databases"
                    inputIcon={<Search className="size-4" />}
                    inputPlaceholder="Search databases..."
                    open={
                      manageDataSourcesOpen &&
                      showLinkExistingPicker &&
                      !selectedLinkDatabaseId
                    }
                    options={linkableDatabaseOptions}
                    renderOption={(option) => {
                      const databaseOption = option as LinkableDatabaseOption;

                      return (
                        <DropDrawerItem
                          key={databaseOption.value}
                          onSelect={(event) => {
                            event.preventDefault();
                            setSelectedLinkDatabaseId(databaseOption.value);
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            {databaseOption.icon}
                            <div className="min-w-0">
                              <div className="truncate">
                                {databaseOption.label}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {databaseOption.pageName}
                              </div>
                            </div>
                          </div>
                        </DropDrawerItem>
                      );
                    }}
                  />
                )}
              </div>
            ) : (
              <>
                <DataSourceSectionLabel>Source</DataSourceSectionLabel>
                {dataSources.length > 0 ? (
                  dataSources.map((source) => (
                    <DataSourceMenuItem item={source} key={source.id} />
                  ))
                ) : (
                  <DropDrawerItem disabled>
                    <Database />
                    <span>No data sources</span>
                  </DropDrawerItem>
                )}
                <DropDrawerItem disabled>
                  <DataSourceAddGlyph />
                  <span>Add data source</span>
                </DropDrawerItem>
                <DropDrawerSeparator />
                <DataSourceSectionLabel>Linked</DataSourceSectionLabel>
                {linkedViews.length > 0
                  ? linkedViews.map((view) => (
                      <LinkedDataSourceMenuItem
                        key={getDatabaseLinkedViewKey(view)}
                        view={view}
                      />
                    ))
                  : null}
                <DropDrawerItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setShowLinkExistingPicker(true);
                  }}
                >
                  <DataSourceAddGlyph />
                  <span>Link existing data source</span>
                </DropDrawerItem>
                <DropDrawerSeparator />
                <DropDrawerItem disabled>
                  <CircleHelp />
                  <span>Learn about data sources</span>
                </DropDrawerItem>
              </>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Lock />
            <span>Lock database</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Database lock settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
    </>
  );

  const trigger = (
    <Button
      aria-label="Open view settings"
      aria-expanded={open}
      className="text-muted-foreground"
      onClick={
        presentation === "sidebar" ? () => handleOpenChange(!open) : undefined
      }
      size="icon"
      type="button"
      variant="ghost"
    >
      <Settings2 />
    </Button>
  );

  if (presentation === "sidebar") {
    return (
      <>
        {trigger}
        {open && portalTarget
          ? createPortal(
              <DropDrawer inline>
                <DropDrawerContent className="h-full w-full">
                  {settingsContent}
                </DropDrawerContent>
              </DropDrawer>,
              portalTarget,
            )
          : null}
      </>
    );
  }

  return (
    <DropDrawer open={open} onOpenChange={handleOpenChange}>
      <DropDrawerTrigger asChild>{trigger}</DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {settingsContent}
      </DropDrawerContent>
    </DropDrawer>
  );
}
