import { calendarMetric, type CalendarMetricName } from "@zilobase/features/calendar";
export function emitCalendarMetric(
  name: CalendarMetricName,
  value: number,
  outcome: "success" | "failure" = "success",
) {
  const metric = calendarMetric(name, value, outcome);
  if (metric && typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("zilobase:calendar:metric", { detail: metric }));
}
