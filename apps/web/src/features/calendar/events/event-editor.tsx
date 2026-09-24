import { EventTimingFields, EventRecurrenceFields } from "./event-timing-fields";
import {
  eventEditorDefaults,
  eventEditorZone,
  editorWrite,
  type EventEditorDraft,
} from "./event-editor-model";
import { useState } from "react";
import {
  calendarCapability,
  dayInstant,
  wallTime,
  type CalendarEvent,
  type CalendarRecord,
} from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import { Checkbox } from "@/shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { getApiErrorMessage } from "@/platform/network/api";
import { runCalendarMutation, reconcileCalendarMutations } from "./calendar-mutations";
import type { CalendarDatabase } from "../storage/calendar-database";
export function EventEditor({
  event,
  calendars,
  database,
  online,
  isNew,
  onSaved,
}: {
  event: CalendarEvent;
  calendars: CalendarRecord[];
  database: CalendarDatabase;
  online: boolean;
  isNew: boolean;
  onSaved: () => void;
}) {
  const zone = eventEditorZone(event, calendars);
  const [draft, setDraft] = useState(() => eventEditorDefaults(event, zone));
  const {
    title,
    description,
    location,
    guests,
    sendUpdates,
    calendarId,
    colorId,
    busy,
    visibility,
    defaultReminders,
    reminder,
    meet,
  } = draft;
  const setTitle = (value: EventEditorDraft["title"]) =>
    setDraft((current) => ({ ...current, title: value }));
  const setDescription = (value: EventEditorDraft["description"]) =>
    setDraft((current) => ({ ...current, description: value }));
  const setLocation = (value: EventEditorDraft["location"]) =>
    setDraft((current) => ({ ...current, location: value }));
  const setGuests = (value: EventEditorDraft["guests"]) =>
    setDraft((current) => ({ ...current, guests: value }));
  const setSendUpdates = (value: EventEditorDraft["sendUpdates"]) =>
    setDraft((current) => ({ ...current, sendUpdates: value }));
  const setCalendarId = (value: EventEditorDraft["calendarId"]) =>
    setDraft((current) => ({ ...current, calendarId: value }));
  const setColorId = (value: EventEditorDraft["colorId"]) =>
    setDraft((current) => ({ ...current, colorId: value }));
  const setBusy = (value: EventEditorDraft["busy"]) =>
    setDraft((current) => ({ ...current, busy: value }));
  const setVisibility = (value: EventEditorDraft["visibility"]) =>
    setDraft((current) => ({ ...current, visibility: value }));
  const setDefaultReminders = (value: EventEditorDraft["defaultReminders"]) =>
    setDraft((current) => ({ ...current, defaultReminders: value }));
  const setReminder = (value: EventEditorDraft["reminder"]) =>
    setDraft((current) => ({ ...current, reminder: value }));
  const setMeet = (value: EventEditorDraft["meet"]) =>
    setDraft((current) => ({ ...current, meet: value }));
  const [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [recurrence, setRecurrence] = useState<string[] | undefined>(),
    [scope, setScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const capability = eventEditorCapability(isNew, scope, calendars, event, calendarId);
  const save = async () => {
    await saveEventEditor({
      online,
      capability,
      setPending,
      setError,
      setUncertain,
      event,
      draft,
      isNew,
      recurrence,
      scope,
      database,
      calendarId,
      onSaved,
    });
  };
  return (
    <form
      className="grid gap-4 text-xs/relaxed"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset
        className="grid gap-4"
        disabled={!online || pending || uncertain || !capability.allowed}
      >
        <Label className="grid min-w-0 gap-2">
          Title
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Label>
        <Label className="grid min-w-0 gap-2">
          Calendar
          <Select value={calendarId} disabled={!isNew} onValueChange={setCalendarId}>
            <SelectTrigger aria-label="Calendar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {calendars
                .filter(
                  (c) =>
                    c.bindingId === event.bindingId &&
                    calendarCapability("create", c.permissions).allowed,
                )
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Label>
        <EventTimingFields
          draft={draft}
          update={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        />
        <EventRecurrenceFields
          event={event}
          scope={scope}
          setScope={setScope}
          onChange={setRecurrence}
        />
        <Label className="grid min-w-0 gap-2">
          Guests
          <Input
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            placeholder="Emails separated by commas"
          />
        </Label>
        <Label className="grid min-w-0 gap-2">
          Location
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Label>
        <Label className="grid min-w-0 gap-2">
          Description
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Label>
        <Label className="flex items-center gap-2">
          <Checkbox checked={meet} onCheckedChange={(v) => setMeet(v === true)} />
          Create Google Meet link
        </Label>
        <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
          <Label className="grid min-w-0 gap-2">
            Show as
            <Select value={busy} onValueChange={(v) => setBusy(v as typeof busy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opaque">Busy</SelectItem>
                <SelectItem value="transparent">Free</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid min-w-0 gap-2">
            Visibility
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as typeof visibility)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </Label>
        </div>
        <Label className="grid min-w-0 gap-2">
          Event color
          <Select value={colorId} onValueChange={setColorId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["default", ...Array.from({ length: 11 }, (_, i) => String(i + 1))].map((id) => (
                <SelectItem key={id} value={id}>
                  {id === "default" ? "Calendar color" : `Color ${id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <Label className="flex items-center gap-2">
          <Checkbox
            checked={defaultReminders}
            onCheckedChange={(v) => setDefaultReminders(v === true)}
          />
          Use calendar reminders
        </Label>
        {!defaultReminders && (
          <Label className="grid min-w-0 gap-2">
            Remind me before (minutes)
            <Input
              type="number"
              min={0}
              max={40320}
              value={reminder}
              onChange={(e) => setReminder(Number(e.target.value))}
            />
          </Label>
        )}
        <Label className="flex items-center gap-2">
          <Checkbox
            checked={sendUpdates === "all"}
            onCheckedChange={(v) => setSendUpdates(v ? "all" : "none")}
          />
          Send updates to guests
        </Label>
        <Button type="submit">{pending ? "Saving…" : "Save event"}</Button>
      </fieldset>
      <EventEditorAlerts
        capability={capability}
        online={online}
        error={error}
        uncertain={uncertain}
        database={database}
        onSaved={onSaved}
      />
    </form>
  );
}
function EventEditorAlerts({
  capability,
  online,
  error,
  uncertain,
  database,
  onSaved,
}: {
  capability: ReturnType<typeof calendarCapability>;
  online: boolean;
  error: unknown;
  uncertain: boolean;
  database: CalendarDatabase;
  onSaved: () => void;
}) {
  return (
    <>
      {!capability.allowed && <p role="status">{capability.reason}</p>}
      {!online && <p>Reconnect to edit events.</p>}
      {error ? (
        <p role="alert" className="text-feedback-danger-text">
          {getApiErrorMessage(error)}
        </p>
      ) : null}
      {uncertain && (
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await reconcileCalendarMutations(database);
            if (!(await database.pending.count())) onSaved();
          }}
        >
          Check delivery status
        </Button>
      )}
    </>
  );
}
function eventEditorCapability(
  isNew: boolean,
  scope: "occurrence" | "following" | "series",
  calendars: CalendarRecord[],
  event: CalendarEvent,
  calendarId: string,
) {
  const operation = isNew ? "create" : scope === "following" ? "following" : "update";
  return calendarCapability(
    operation,
    calendars.find((c) => c.id === calendarId && c.bindingId === event.bindingId)?.permissions,
    event,
  );
}
async function saveEventEditor(input: {
  online: boolean;
  capability: ReturnType<typeof calendarCapability>;
  setPending: (value: boolean) => void;
  setError: (value: unknown) => void;
  setUncertain: (value: boolean) => void;
  event: CalendarEvent;
  draft: EventEditorDraft;
  isNew: boolean;
  recurrence: string[] | undefined;
  scope: "occurrence" | "following" | "series";
  database: CalendarDatabase;
  calendarId: string;
  onSaved: () => void;
}) {
  if (!input.online || !input.capability.allowed) return;
  input.setPending(true);
  input.setError(undefined);
  try {
    const write = editorWrite(input.event, input.draft, input.isNew, input.recurrence, input.scope);
    const result = await runCalendarMutation({
      database: input.database,
      event: { ...input.event, calendarId: input.calendarId },
      action: input.isNew ? "create" : "update",
      write,
    });
    if (result.status === "succeeded") input.onSaved();
    else {
      input.setUncertain(true);
      input.setError(new Error("Delivery is being checked. Do not create another copy."));
    }
  } catch (cause) {
    input.setError(cause);
    input.setUncertain((await input.database.pending.count()) > 0);
  } finally {
    input.setPending(false);
  }
}
export function newCalendarEvent(input: {
  workspaceId: string;
  bindingId: string;
  calendarId: string;
  date: string;
  timeZone: string;
  hour?: number;
}): CalendarEvent {
  const start =
    input.hour === undefined
      ? dayInstant(input.date, input.timeZone)
      : wallTime(
          input.date,
          `${String(Math.floor(input.hour)).padStart(2, "0")}:${String(Math.round((input.hour % 1) * 60)).padStart(2, "0")}`,
          input.timeZone,
        );
  return {
    workspaceId: input.workspaceId,
    bindingId: input.bindingId,
    calendarId: input.calendarId,
    eventId: `local-${crypto.randomUUID()}`,
    etag: "",
    title: "New event",
    description: "",
    location: "",
    start: { dateTime: start, timeZone: input.timeZone },
    end: {
      dateTime: new Date(Date.parse(start) + 1800_000).toISOString(),
      timeZone: input.timeZone,
    },
    status: "confirmed",
    eventType: "default",
    attendees: [],
    reminders: { useDefault: true },
    transparency: "opaque",
    visibility: "default",
    colorId: null,
    htmlLink: "",
  };
}
