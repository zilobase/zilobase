import { calendarMetric, type CalendarMetricName } from "@zilobase/features/calendar";
export function recordCalendarMetric(
  name: CalendarMetricName,
  value: number,
  outcome: "success" | "failure" = "success",
) {
  const metric = calendarMetric(name, value, outcome);
  if (metric) console.info(JSON.stringify(metric));
}
