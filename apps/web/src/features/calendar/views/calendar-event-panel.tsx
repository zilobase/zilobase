import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { Button } from "@/shared/ui/button";
import type { CalendarEvent, CalendarRecord } from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "@/shared/components/icons";
import { EventEditor } from "../events/event-editor";
import { CalendarEventDetails } from "./calendar-event-details";
type PanelProps = {
  preview?: ReactNode;
  selected: CalendarEvent | null;
  database: CalendarDatabase | null;
  calendars: CalendarRecord[];
  mapsProvider?: "google" | "apple";
  online: boolean;
  editing: boolean;
  creating: boolean;
  zone: string;
  timeFormat: "12" | "24";
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
};
export function CalendarEventPanel(props: PanelProps) {
  const workspace = useCalendarWorkspace();
  const heading = useRef<HTMLHeadingElement>(null);
  const event = props.selected;
  useEffect(() => {
    if (!workspace.panelOpen) return;
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [workspace.panelOpen, event?.eventId]);
  return createPortal(
    <div
      data-calendar-event-panel
      className="flex h-full min-h-0 flex-col"
      aria-hidden={!workspace.panelOpen}
      inert={!workspace.panelOpen || undefined}
      onKeyDown={(key) => {
        if (key.key === "Escape" && !key.defaultPrevented) {
          key.preventDefault();
          props.onClose();
        }
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-stroke-default px-3">
        <h2
          ref={heading}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-xs/relaxed font-medium outline-none"
        >
          {eventPanelHeading(event, props.editing)}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close calendar event panel"
          onClick={props.onClose}
        >
          <XIcon />
        </Button>
      </header>
      <div
        className={`@container min-h-0 flex-1 overflow-y-auto ${props.editing || !event ? "p-3" : ""}`}
      >
        {eventPanelBody(event, props, workspace.create)}
      </div>
    </div>,
    workspace.panelElement,
  );
}
function eventPanelHeading(event: CalendarEvent | null, editing: boolean) {
  if (!event) return "Calendar event";
  return editing ? "Edit event" : "Event";
}
function eventPanelBody(event: CalendarEvent | null, props: PanelProps, create: () => void) {
  if (!event)
    return (
      <div className="grid gap-3 text-xs/relaxed">
        {props.preview}
        <p className="text-content-secondary">Select an event to see its details.</p>
        <Button onClick={create}>Create event</Button>
      </div>
    );
  if (props.editing && props.database)
    return (
      <EventEditor
        key={event.eventId}
        event={event}
        database={props.database}
        calendars={props.calendars}
        online={props.online}
        isNew={props.creating}
        onSaved={props.onClose}
      />
    );
  return <CalendarEventDetails key={event.eventId} {...props} selected={event} />;
}
