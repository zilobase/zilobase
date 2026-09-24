import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEventTime } from "@zilobase/features/calendar";
import { CalendarProviderError } from "../provider/gateway";
/** Shift a series anchor by the edited occurrence's wall-clock delta, not its elapsed UTC delta. */
export function shiftSeriesTime(
  master: CalendarEventTime,
  occurrence: CalendarEventTime,
  edited: CalendarEventTime,
): CalendarEventTime {
  if (master.date && occurrence.date && edited.date)
    return {
      date: Temporal.PlainDate.from(master.date)
        .add(Temporal.PlainDate.from(occurrence.date).until(Temporal.PlainDate.from(edited.date)))
        .toString(),
    };
  if (!master.dateTime || !occurrence.dateTime || !edited.dateTime)
    throw new CalendarProviderError(400, "series_date_type_change_unsupported");
  const zone = master.timeZone ?? "UTC";
  const local = (value: string) =>
    Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime();
  const shifted = local(master.dateTime).add(
    local(occurrence.dateTime).until(local(edited.dateTime), { largestUnit: "days" }),
  );
  return {
    dateTime: shifted.toZonedDateTime(zone, { disambiguation: "reject" }).toInstant().toString(),
    timeZone: zone,
  };
}
export function splitRecurrence(
  rules: string[],
  originalStart: CalendarEventTime,
  precedingCount: number,
) {
  // Imported multi-rule/RDATE sets stay intact until a provider editor can split them safely.
  if (rules.length !== 1 || !rules[0]!.startsWith("RRULE:"))
    throw new CalendarProviderError(400, "complex_recurrence_split_unsupported");
  const parts = rules[0]!.slice(6).split(";");
  const until = originalStart.date
    ? Temporal.PlainDate.from(originalStart.date)
        .subtract({ days: 1 })
        .toString()
        .replaceAll("-", "")
    : Temporal.Instant.from(originalStart.dateTime!)
        .subtract({ seconds: 1 })
        .toString({ smallestUnit: "second" })
        .replaceAll(/[-:]/g, "");
  const count = parts.find((p) => p.startsWith("COUNT="));
  const remaining = count ? Number(count.slice(6)) - precedingCount : null;
  if (remaining !== null && remaining < 1)
    throw new CalendarProviderError(409, "series_occurrence_changed");
  return {
    head: [
      `RRULE:${parts
        .filter((p) => !p.startsWith("COUNT=") && !p.startsWith("UNTIL="))
        .concat(`UNTIL=${until}`)
        .join(";")}`,
    ],
    tail: [
      `RRULE:${parts.map((p) => (p.startsWith("COUNT=") ? `COUNT=${remaining}` : p)).join(";")}`,
    ],
  };
}
