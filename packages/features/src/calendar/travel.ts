import type { CalendarPreferences } from "./contracts";
/** Display-only projection; event timestamps and provider settings are not inputs. */
export function calendarTravelPreferences(value: CalendarPreferences, zone: string | null): CalendarPreferences {
  if (!zone || zone === value.timeZone) return value;
  const canonical = (name: string) => new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
  const target = canonical(zone);
  if (canonical(value.timeZone) === target) return value;
  const columns = value.timeZoneColumns;
  const primary = columns.find(column => canonical(column.zone) === target) ?? { zone, label: zone.split("/").at(-1)!.replaceAll("_", " ") };
  const timeZoneColumns = [primary, ...columns.filter(column => canonical(column.zone) !== target)].slice(0, 4);
  return { ...value, timeZone: primary.zone, timeZoneColumns };
}
