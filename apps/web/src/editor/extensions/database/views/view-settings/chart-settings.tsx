import {
  ArrowDownUp,
  BarChart3,
  ChartLine,
  ChartPie,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Gauge,
  MoreHorizontal,
  Palette,
  Plus,
  Radar as RadarIcon,
  Rows3,
  Trash2,
  Type,
  X,
  Zap,
} from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";
import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  cyclingColorTokens,
  getColorToken,
  getPaletteColor,
} from "@/shared/lib/color-tokens";
import { cn } from "@/shared/lib/utils";

import { getDatabasePropertyType } from "../../core/database-property-types";
import { NameColumnGlyph } from "../../interactions/name-column-glyph";
import type {
  DatabaseChartReferenceLine,
  DatabaseChartSettings,
  DatabaseChartType,
} from "../chart/database-chart-config";
import type { DatabaseViewProperty } from "./types";
import {
  chartDateIntervalOptions,
  createDatabaseChartReferenceLine,
  getChartAxisGroups,
  getChartDateIntervalLabel,
  getChartRangeLabel,
  getChartSortOptions,
  isChartDateProperty,
  parseOptionalChartNumber,
} from "./chart-settings-model";
import { ViewSettingsRow } from "./view-settings-row";

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

const referenceLineStyleOptions: Array<{
  label: string;
  value: DatabaseChartReferenceLine["style"];
}> = [
  { label: "Solid", value: "solid" },
  { label: "Dash", value: "dashed" },
  { label: "Dot", value: "dotted" },
];

export function DatabaseChartSettingsSection({
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
  const supportsCartesianControls = ["bar", "horizontal-bar", "line"].includes(
    settings.type,
  );
  const selectedColorToken =
    settings.color === "auto" ? null : getColorToken(settings.color);
  const colorLabel = selectedColorToken?.name ?? "Auto";
  const colorSwatch = selectedColorToken
    ? (getPaletteColor(selectedColorToken.value) ?? "var(--primary)")
    : "linear-gradient(90deg, var(--editor-blue), var(--editor-purple), var(--editor-pink), var(--editor-orange))";
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
              settings.type === option.value && "border-primary text-primary",
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
      <DropDrawerSub title="What to show">
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
      <DropDrawerSub title="Sort by">
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
                          getPaletteColor(group.color) ??
                          "var(--muted-foreground)",
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
      <DropDrawerSub title="What to show">
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<ChartLine />}
            label="What to show"
            right={measureProperty?.property.name ?? "Task count"}
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem
            onSelect={() => onChange({ measurePropertyId: "count" })}
          >
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

      <DropDrawerSub title="Group by">
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
                <DropDrawerSub key={property.id} title={property.property.name}>
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
          <DropDrawerSub title="Range">
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
            <CollapsibleContent className="mx-2 space-y-2 rounded-lg border bg-subtle-surface p-2">
              {referenceLines.map((line) => (
                <div
                  className="space-y-2 rounded-md bg-subtle-surface p-2"
                  key={line.id}
                >
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
      <DropDrawerSub title="Color">
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
              <span
                className={cn("size-3 rounded-sm border", color.swatchClass)}
              />
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
