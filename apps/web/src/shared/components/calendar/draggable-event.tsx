import type { ReactNode } from "react";
import { useCalendarInteraction } from "./calendar-interactions";
import type { CalendarItem } from "./types";

/** The stable surface owns the gesture; this cell only starts it. */
export function DraggableEvent({
  event,
  zone,
  hourHeight = 48,
  disabled,
  resizable = true,
  onChange,
  onError,
  children,
}: {
  event: CalendarItem;
  zone: string;
  hourHeight?: number;
  disabled: boolean;
  resizable?: boolean;
  onChange: (event: CalendarItem) => void;
  onError?: (error: Error) => void;
  children: ReactNode;
}) {
  const begin = useCalendarInteraction();
  const allDay = Boolean(event.start.date);
  return (
    <div
      className="relative h-full touch-none"
      onPointerDown={(pointer) => {
        if (disabled || pointer.button !== 0) return;
        const edge = (pointer.target as HTMLElement).closest<HTMLElement>("[data-resize]")?.dataset
          .resize;
        begin?.(pointer, {
          event,
          zone,
          hourHeight,
          resize: edge === "start" || edge === "end" ? edge : null,
          content: children,
          onChange,
          onError,
        });
      }}
    >
      {!disabled && resizable && (
        <div
          data-resize="start"
          className={
            allDay
              ? "absolute inset-y-0 left-0 z-10 w-1 cursor-ew-resize"
              : "absolute inset-x-0 top-0 z-10 h-1 cursor-ns-resize"
          }
        />
      )}
      {children}
      {!disabled && resizable && (
        <div
          data-resize="end"
          className={
            allDay
              ? "absolute inset-y-0 right-0 z-10 w-1 cursor-ew-resize"
              : "absolute inset-x-0 bottom-0 z-10 h-1 cursor-ns-resize"
          }
        />
      )}
    </div>
  );
}
