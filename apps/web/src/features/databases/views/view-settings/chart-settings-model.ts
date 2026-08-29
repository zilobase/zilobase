import type {
  DatabaseChartDateInterval,
  DatabaseChartReferenceLine,
  DatabaseChartSettings,
  DatabaseChartSort,
} from "../chart/database-chart-config";
import type { DatabaseViewProperty } from "./types";

export const chartDateIntervalOptions: Array<{
  label: string;
  value: DatabaseChartDateInterval;
}> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
];

export function getChartSortOptions(axisLabel: string, measureLabel: string) {
  return [
    { label: "Manual", value: "manual" },
    { label: `${axisLabel} ascending`, value: "axis-asc" },
    { label: `${axisLabel} descending`, value: "axis-desc" },
    { label: `${measureLabel} low → high`, value: "value-asc" },
    { label: `${measureLabel} high → low`, value: "value-desc" },
  ] satisfies Array<{ label: string; value: DatabaseChartSort }>;
}

export function isChartDateProperty(property: DatabaseViewProperty) {
  return ["date", "created_time", "edited_time"].includes(
    property.property.type,
  );
}

export function getChartAxisGroups(
  property: DatabaseViewProperty | undefined,
) {
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

export function getChartDateIntervalLabel(
  interval: DatabaseChartDateInterval,
) {
  return (
    chartDateIntervalOptions.find((option) => option.value === interval)
      ?.label ?? "Day"
  );
}

export function getChartRangeLabel(settings: DatabaseChartSettings) {
  if (settings.rangeMin === undefined && settings.rangeMax === undefined) {
    return "Auto";
  }

  return `${settings.rangeMin ?? "Auto"} – ${settings.rangeMax ?? "Auto"}`;
}

export function parseOptionalChartNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function createDatabaseChartReferenceLine(): DatabaseChartReferenceLine {
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
