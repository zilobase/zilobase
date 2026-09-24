export type CalendarMetricName =
  | "retained_bytes"
  | "foreground_latency"
  | "edge_stall"
  | "range_pages"
  | "mounted_columns"
  | "duplicate_read"
  | "layout_duration"
  | "sync_lag"
  | "cache_hit"
  | "range_latency"
  | "watch_expiry"
  | "reconnect"
  | "throttling"
  | "ambiguous_write"
  | "reminder";
export function calendarMetric(
  name: CalendarMetricName,
  value: number,
  outcome: "success" | "failure" = "success",
) {
  if (!Number.isFinite(value) || value < 0) return null;
  return { event: `calendar.${name}`, value: Math.round(value), outcome };
}
