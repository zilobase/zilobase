import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Checkbox } from "@/shared/ui/checkbox";
import { TimePicker } from "@/shared/ui/time-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { EventEditorDraft } from "./event-editor-model";
import { RecurrenceControls, RecurrenceScope } from "./recurrence-controls";
import type { CalendarEvent } from "@zilobase/features/calendar";
export type UpdateEditorDraft = <K extends keyof EventEditorDraft>(
  key: K,
  value: EventEditorDraft[K],
) => void;
export function EventTimingFields({
  draft,
  update,
}: {
  draft: EventEditorDraft;
  update: UpdateEditorDraft;
}) {
  return (
    <>
      <Label className="flex items-center gap-2">
        <Checkbox checked={draft.allDay} onCheckedChange={(v) => update("allDay", v === true)} />
        All day
      </Label>
      <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
        <Label className="grid gap-2">
          Start date
          <Input
            type="date"
            required
            value={draft.startDate}
            onChange={(e) => update("startDate", e.target.value)}
          />
        </Label>
        <Label className="grid gap-2">
          End date
          <Input
            type="date"
            required
            value={draft.endDate}
            onChange={(e) => update("endDate", e.target.value)}
          />
        </Label>
        {!draft.allDay && (
          <>
            <TimePicker
              aria-label="Start time"
              value={draft.startTime}
              onValueChange={(value) => update("startTime", value)}
            />
            <TimePicker
              aria-label="End time"
              value={draft.endTime}
              onValueChange={(value) => update("endTime", value)}
            />
          </>
        )}
      </div>
      {!draft.allDay && (
        <>
          <Label className="grid min-w-0 gap-2">
            Time zone
            <Input value={draft.timeZone} onChange={(e) => update("timeZone", e.target.value)} />
          </Label>
          <Label className="grid min-w-0 gap-2">
            Repeated clock time
            <Select
              value={draft.disambiguation}
              onValueChange={(v) =>
                update("disambiguation", v as EventEditorDraft["disambiguation"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reject">Ask when ambiguous</SelectItem>
                <SelectItem value="earlier">Earlier offset</SelectItem>
                <SelectItem value="later">Later offset</SelectItem>
              </SelectContent>
            </Select>
          </Label>
        </>
      )}
    </>
  );
}
export function EventRecurrenceFields({
  event,
  scope,
  setScope,
  onChange,
}: {
  event: CalendarEvent;
  scope: "occurrence" | "following" | "series";
  setScope: (scope: "occurrence" | "following" | "series") => void;
  onChange: (rules: string[] | undefined) => void;
}) {
  return (
    <>
      {event.recurringEventId && (
        <RecurrenceScope
          allowFollowing={event.organizer?.self === true}
          value={scope}
          onChange={setScope}
        />
      )}
      {(!event.recurringEventId || scope !== "occurrence") && (
        <RecurrenceControls
          initial={event.recurrence ?? (event.recurringEventId ? ["preserve"] : undefined)}
          onChange={onChange}
        />
      )}
    </>
  );
}
