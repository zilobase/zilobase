import { memo, useMemo, useRef, type ReactNode } from "react";
import { timedLayoutByKey } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { CalendarDateLabel } from "./current-time";
import { DraggableEvent } from "./draggable-event";
import { calendarItemKey, type CalendarItem, type CalendarDisplayPreferences } from "./types";
export type CalendarColumnActions = {
  preferences: CalendarDisplayPreferences;
  canCreate: boolean;
  writable: (item: CalendarItem) => boolean;
  card: (item: CalendarItem) => ReactNode;
  onDay: (day: string) => void;
  onCreate: (day: string, hour: number, duration: number) => void;
  onChange: (item: CalendarItem) => void;
  onError?: (error: Error) => void;
};
type Props = CalendarColumnActions & {
  day: string;
  items: CalendarItem[];
  prepared?: boolean;
  viewportTop?: number;
  viewportHeight?: number;
  allDayCollapsed: boolean;
  onExpandAllDay: () => void;
};
/** A stable date column in the shared timeline coordinate plane. */
export const CalendarDayColumn = memo(function CalendarDayColumn({ day, items, preferences, prepared = true, canCreate, card, writable, onDay, onCreate, onChange, onError, allDayCollapsed, onExpandAllDay, viewportTop = 0, viewportHeight = 800 }: Props) {
  const hourHeight = preferences.hourHeight, pixelsPerMinute = hourHeight / 60;
  const header = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
  const slot = useRef<{ y: number; hour: number } | null>(null);
  const allDay = useMemo(() => items.filter(item => item.start.date), [items]);
  const layout = useMemo(() => prepared ? timedLayoutByKey(items, day, preferences.timeZone, calendarItemKey) : [], [items, day, preferences.timeZone, prepared]);
  return <section inert={!prepared} data-calendar-day-column={day} data-calendar-columns={1} className="flex h-full min-h-0 min-w-0 flex-col border-l border-stroke-default">
    <header data-calendar-column-header ref={header} className="sticky top-0 z-20 shrink-0 bg-surface-canvas">
      <div data-calendar-date-header={day} className="flex h-8 items-center px-1"><Button size="sm" variant="ghost" className="w-full" onClick={() => onDay(day)}><CalendarDateLabel day={day} zone={preferences.timeZone} /></Button></div>
      <div data-calendar-all-day={day} className="min-w-0 border-y border-stroke-default" style={{ height: allDayCollapsed ? 24 : 96 }}>
        {allDayCollapsed ? allDay.length > 0 && <button type="button" className="w-full truncate px-1 text-left text-xs text-content-secondary" aria-label={`Expand ${allDay.length} all-day ${allDay.length === 1 ? "event" : "events"} on ${day}`} onClick={onExpandAllDay}>{allDay.length} {allDay.length === 1 ? "event" : "events"}</button> : <div data-calendar-all-day-events className="grid max-h-full gap-px overflow-x-hidden overflow-y-auto overscroll-y-none">{allDay.map(item => <DraggableEvent key={item.id} event={item} zone={preferences.timeZone} hourHeight={hourHeight} disabled={!writable(item)} onChange={onChange} onError={onError}>{card(item)}</DraggableEvent>)}</div>}
      </div>
    </header>
    <div data-calendar-scroll ref={body} className="relative shrink-0">
      <div data-calendar-time-content className="relative" style={{ height: hourHeight * 24, backgroundImage: "linear-gradient(to bottom, var(--color-data-grid) 1px, transparent 1px)", backgroundSize: `100% ${hourHeight}px` }}>
        {prepared && <>{Array.from({ length: 24 }, (_, hour) => <button key={hour} type="button" disabled={!canCreate} aria-label={`Create event ${day} ${hour}:00`} style={{ height: hourHeight }} className="block w-full border-t border-data-grid text-left" onPointerDown={event => {
          slot.current = { y: event.clientY, hour: hour + Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / (hourHeight / 4)) / 4 }; event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerCancel={() => { slot.current = null; }} onPointerUp={event => {
          const start = slot.current; slot.current = null;
          if (start) onCreate(day, start.hour, Math.max(30, Math.round(Math.max(0, event.clientY - start.y) / pixelsPerMinute / 15) * 15));
        }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCreate(day, hour, 30); } }} />)}
        {layout.filter(item => item.bottom * pixelsPerMinute >= viewportTop - viewportHeight && item.top * pixelsPerMinute <= viewportTop + viewportHeight * 2).map(item => <div key={item.event.id} className="absolute rounded-md" style={{ top: item.top * pixelsPerMinute, height: Math.max(18, (item.bottom - item.top) * pixelsPerMinute), left: `${item.column / item.columns * 100}%`, width: `${100 / item.columns}%` }}><DraggableEvent event={item.event} zone={preferences.timeZone} hourHeight={hourHeight} disabled={!writable(item.event)} onChange={onChange} onError={onError}>{card(item.event)}</DraggableEvent></div>)}
        </>}
      </div>
    </div>
  </section>;
});
