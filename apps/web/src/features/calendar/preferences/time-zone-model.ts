import type { CalendarPreferences, CalendarTimeZoneColumn } from "@zilobase/features/calendar";
export const canonicalZone = (zone: string) => new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
const cityAliases: Record<string, string> = { "Asia/Calcutta": "Kolkata", "Europe/Kiev": "Kyiv" };
export const zoneCity = (zone: string) => cityAliases[zone] ?? zone.split("/").at(-1)!.replaceAll("_", " ");
export function zoneDescription(zone: string, date: Date) {
  const part = (timeZoneName: "long" | "longOffset") => new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName }).formatToParts(date).find(p => p.type === "timeZoneName")!.value;
  return { offset: part("longOffset"), name: part("long"), city: zoneCity(zone) };
}
export function zoneColumns(value: CalendarPreferences): CalendarTimeZoneColumn[] {
  return value.timeZoneColumns;
}
export function withZoneColumns(value: CalendarPreferences, columns: CalendarTimeZoneColumn[]): CalendarPreferences {
  if (!columns.length || columns.length > 4) throw new Error("Display one to four time zones. Remove a zone before adding another.");
  if (new Set(columns.map(c => canonicalZone(c.zone))).size !== columns.length) throw new Error("That time zone is already displayed.");
  return { ...value, timeZoneColumns: columns, timeZone: columns[0]!.zone };
}
export function saveTravelZone(value: CalendarPreferences, zone: string, primary: boolean) {
  const columns = zoneColumns(value), existing = columns.find(c => canonicalZone(c.zone) === canonicalZone(zone));
  const entry = existing ?? { zone: canonicalZone(zone), label: zoneCity(zone) };
  const rest = columns.filter(c => c !== existing);
  return withZoneColumns(value, primary ? [entry, ...rest] : [...rest, entry]);
}
