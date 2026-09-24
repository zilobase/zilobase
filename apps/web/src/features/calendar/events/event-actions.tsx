import { RecurrenceScope } from "./recurrence-controls";
import { useState } from "react";
import { calendarCapability, type CalendarEvent, type CalendarRecord } from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/shared/ui/alert-dialog";
import { runCalendarMutation, type EventAction } from "./calendar-mutations";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/platform/network/api";
export function EventActions({ event, database, calendars, online, onEdit, onDuplicate, onDone, section = "manage" }: { event: CalendarEvent; database: CalendarDatabase; calendars: CalendarRecord[]; online: boolean; onEdit: () => void; onDuplicate: () => void; onDone: () => void; section?: "manage" | "rsvp" }) {
  const [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [destination, setDestination] = useState("");
  const [scope, setScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const disabled = !online || busy;
  const permissions = calendars.find(c => c.id === event.calendarId && c.bindingId === event.bindingId)?.permissions;
  const edit = calendarCapability("update", permissions, event);
  const writable = edit.allowed;
  const act = async (action: EventAction, responseStatus?: "accepted" | "declined" | "tentative") => {
    setBusy(true); try { const result = await runCalendarMutation({ database, event, action, responseStatus, destination: destination || undefined, write: { operationId: crypto.randomUUID(), etag: event.etag, sendUpdates: "all", recurrenceScope: action === "delete" ? scope : undefined, event: {} } }); if (result.status === "succeeded") onDone(); else toast.info("Change pending. Zilobase is checking delivery.") } catch (error) { toast.error(getApiErrorMessage(error)) } finally { setBusy(false) }
  };
  if (section === "rsvp") return <EventRsvpActions event={event} permissions={permissions} disabled={disabled} act={act} />;
  return <div className="grid gap-2">{!edit.allowed && <p className="text-xs text-content-secondary">{edit.reason}</p>}<div className="flex flex-wrap items-center gap-2">{writable && <><ButtonGroup aria-label="Event actions" variant="connected"><Button variant="outline" disabled={disabled} onClick={onEdit}>Edit</Button><Button variant="outline" disabled={disabled} onClick={onDuplicate}>Duplicate</Button></ButtonGroup><Button className="ml-auto text-action-danger-text hover:bg-feedback-error-subtle hover:text-action-danger-text" variant="ghost" disabled={disabled} onClick={() => setDeleting(true)}>Delete</Button></>}</div>
    {calendarCapability("move", permissions, event).allowed && <div className="flex min-w-0 gap-2"><Select value={destination} onValueChange={setDestination}><SelectTrigger className="min-w-0 flex-1" aria-label="Move to calendar"><SelectValue placeholder="Move to calendar" /></SelectTrigger><SelectContent>{calendars.filter(c => c.bindingId === event.bindingId && c.id !== event.calendarId && c.permissions.write).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!destination || disabled} onClick={() => void act("move")}>Move</Button></div>}
    <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogTitle>Delete event?</AlertDialogTitle><AlertDialogDescription>Guests will receive a cancellation update.</AlertDialogDescription>{event.recurringEventId && <RecurrenceScope allowFollowing={calendarCapability("following", permissions, event).allowed} value={scope} onChange={setScope} />}<AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void act("delete")}>Delete event</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
function EventRsvpActions({ event, permissions, disabled, act }: { event: CalendarEvent; permissions: CalendarRecord["permissions"] | undefined; disabled: boolean; act: (action: EventAction, responseStatus?: "accepted" | "declined" | "tentative") => Promise<void> }) {
  if (!calendarCapability("rsvp", permissions, event).allowed) return null;
  const current = event.attendees.find(a => a.self)?.responseStatus;
  return <ButtonGroup aria-label="Your response" variant="connected" width="full">{(["accepted", "declined", "tentative"] as const).map(status => <Button className="flex-1 border-stroke-default" key={status} variant={current === status ? "secondary" : "outline"} aria-pressed={current === status} disabled={disabled} onClick={() => void act("rsvp", status)}>{status === "accepted" ? "Yes" : status === "declined" ? "No" : "Maybe"}</Button>)}</ButtonGroup>;
}
