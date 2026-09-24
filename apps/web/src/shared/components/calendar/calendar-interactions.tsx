import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { shiftEventGeometry, calendarDragDisplacement } from "./event-geometry";
import type { CalendarItem } from "./types";

type Begin = {
  event: CalendarItem;
  zone: string;
  hourHeight: number;
  resize: "start" | "end" | null;
  content: ReactNode;
  onChange: (item: CalendarItem) => void;
  onError?: (error: Error) => void;
};
const InteractionContext = createContext<
  ((pointer: PointerEvent<HTMLElement>, input: Begin) => void) | null
>(null);
export const useCalendarInteraction = () => useContext(InteractionContext);
type Session = Begin & {
  pointer: number;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  scroll: HTMLElement;
  scrollX: number;
  scrollY: number;
  width: number;
  rect: DOMRect;
  day: string;
  moved: boolean;
  weekends: boolean;
  month: boolean;
};
export function CalendarInteractionHost({
  children,
  ready,
  weekends,
  items,
}: {
  children: ReactNode;
  items: ReadonlyMap<string, CalendarItem>;
  ready: (first: string, last?: string) => boolean;
  weekends: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    session = useRef<Session | null>(null),
    frame = useRef<number | null>(null);
  const [preview, setPreview] = useState<{ session: Session; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const cancel = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    session.current = null;
    setPreview(null);
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const geometry = (s: Session) => {
    const dx = s.clientX - s.x + s.scroll.scrollLeft - s.scrollX,
      dy = s.clientY - s.y + s.scroll.scrollTop - s.scrollY;
    return calendarDragDisplacement(s.day, s.width, dx, dy, s.weekends, s.month, s.hourHeight);
  };
  const tick = () => {
    const s = session.current;
    if (!s?.moved) {
      frame.current = null;
      return;
    }
    const box = s.scroll.getBoundingClientRect();
    s.scroll.scrollLeft += s.clientX > box.right - 40 ? 12 : s.clientX < box.left + 40 ? -12 : 0;
    s.scroll.scrollTop += s.clientY > box.bottom - 40 ? 12 : s.clientY < box.top + 40 ? -12 : 0;
    setPreview({ session: s, x: s.clientX - s.x, y: s.clientY - s.y });
    frame.current = requestAnimationFrame(tick);
  };
  const begin = (pointer: PointerEvent<HTMLElement>, input: Begin) => {
    if (pointer.button !== 0) return;
    const column = pointer.currentTarget.closest<HTMLElement>("[data-calendar-day-column]"),
      scroll = pointer.currentTarget.closest<HTMLElement>(
        "[data-calendar-timeline-scroll], [data-calendar-month-scroll]",
      );
    const month = pointer.currentTarget.closest<HTMLElement>("[data-calendar-week]");
    const columns = pointer.currentTarget.closest<HTMLElement>("[data-calendar-columns]");
    if ((!column && !month) || !scroll || !root.current) return;
    const day = column?.dataset.calendarDayColumn ?? month!.dataset.calendarWeek!;
    const width =
      column?.clientWidth ?? columns!.clientWidth / Number(columns!.dataset.calendarColumns);
    const rect = pointer.currentTarget.getBoundingClientRect();
    session.current = {
      ...input,
      pointer: pointer.pointerId,
      x: pointer.clientX,
      y: pointer.clientY,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      scroll,
      scrollX: scroll.scrollLeft,
      scrollY: scroll.scrollTop,
      width,
      rect,
      day,
      moved: false,
      weekends,
      month: Boolean(month),
    };
  };
  return (
    <InteractionContext.Provider value={begin}>
      <div
        ref={root}
        className="flex min-h-0 flex-1 flex-col"
        onPointerMove={(pointer) => {
          const s = session.current;
          if (!s || s.pointer !== pointer.pointerId) return;
          s.clientX = pointer.clientX;
          s.clientY = pointer.clientY;
          if (!s.moved && Math.abs(s.clientX - s.x) + Math.abs(s.clientY - s.y) > 4) {
            s.moved = true;
            root.current?.setPointerCapture(pointer.pointerId);
            suppressClick.current = true;
          }
          if (s.moved && frame.current === null) frame.current = requestAnimationFrame(tick);
        }}
        onPointerUp={(pointer) => {
          const s = session.current;
          if (!s || s.pointer !== pointer.pointerId) return;
          s.clientX = pointer.clientX;
          s.clientY = pointer.clientY;
          if (s.moved) commitCalendarDrag(s, geometry(s), itemsRef.current, readyRef.current);
          cancel();
        }}
        onPointerCancel={cancel}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
        {preview && (
          <div
            data-calendar-drag-preview
            aria-hidden="true"
            inert
            className="pointer-events-none fixed z-50"
            style={{
              left: preview.session.rect.left + preview.x,
              top: preview.session.rect.top + (preview.session.event.start.date ? 0 : preview.y),
              width: preview.session.rect.width,
              height: preview.session.rect.height,
            }}
          >
            {preview.session.content}
          </div>
        )}
      </div>
    </InteractionContext.Provider>
  );
}
function dropInsideCalendar(session: Session) {
  const box = session.scroll.getBoundingClientRect(),
    rail = Number(session.scroll.dataset.calendarRailWidth ?? 0);
  return (
    session.clientX >= box.left + rail &&
    session.clientX <= box.right &&
    session.clientY >= box.top &&
    session.clientY <= box.bottom
  );
}
function commitCalendarDrag(
  session: Session,
  move: { days: number; minutes: number; target: string },
  items: ReadonlyMap<string, CalendarItem>,
  ready: (first: string, last?: string) => boolean,
) {
  try {
    applyCalendarDrag(session, move, items, ready);
  } catch (error) {
    session.onError?.(error instanceof Error ? error : new Error("Invalid event time"));
  }
}
function applyCalendarDrag(
  session: Session,
  move: { days: number; minutes: number; target: string },
  items: ReadonlyMap<string, CalendarItem>,
  ready: (first: string, last?: string) => boolean,
) {
  if (!dropInsideCalendar(session))
    throw new Error("Drop the event inside the calendar to move it.");
  if (!items.get(session.event.id)?.editable) throw new Error("This event is no longer editable.");
  const next = shiftEventGeometry(
    session.event,
    session.zone,
    move.days,
    session.event.start.date || session.month ? 0 : move.minutes,
    session.resize,
  );
  if (!ready(move.target))
    throw new Error("Those dates are still loading. The event was not moved.");
  session.onChange(next);
}
