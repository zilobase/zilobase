import { CurrentTimeLabel } from "./current-time";
import { memo } from "react";
import { eventClock, wallTime } from "@zilobase/features/calendar";
import type { CalendarDisplayPreferences } from "./types";
export const TimeAxis = memo(function TimeAxis({ day, days, preferences }: { day: string; days: string[]; preferences: CalendarDisplayPreferences }) {
  const zones = preferences.timeZoneColumns.map((column) => column.zone).reverse();
  return <div className="relative">{Array.from({ length: 24 }, (_, hour) => <div key={hour} style={{ height: preferences.hourHeight }} className="flex text-[10px] text-content-secondary">{zones.map(zone => <div className="w-14 pr-2 text-right" key={zone}>{eventClock({ dateTime: wallTime(day, `${String(hour).padStart(2, "0")}:00`, preferences.timeZone, "earlier"), timeZone: zone }, zone, preferences.timeFormat)}</div>)}</div>)}<CurrentTimeLabel hourHeight={preferences.hourHeight} days={days} zone={preferences.timeZone} secondaryZones={preferences.timeZoneColumns.slice(1).map((column) => column.zone)} timeFormat={preferences.timeFormat} /></div>;
});
