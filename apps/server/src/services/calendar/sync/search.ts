import type { CalendarRecord, CalendarScope } from "@zilobase/features/runtime";
import { z } from "zod";
import { CalendarProviderError, normalizeEvent, type CalendarGateway } from "../provider/gateway";

const IsoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "Invalid date-time format",
  );

export const calendarSearchSchema = z
  .object({
    calendarId: z.string().min(1).max(1024),
    q: z.string().trim().min(1).max(500),
    start: IsoDateTime.optional(),
    end: IsoDateTime.optional(),
    pageToken: z.string().max(4096).optional(),
  })
  .refine(
    (value) => !value.start || !value.end || Date.parse(value.end) > Date.parse(value.start),
    "End must follow start",
  );

export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

export async function searchCalendarEvents(
  input: CalendarSearch,
  scope: CalendarScope,
  calendar: CalendarRecord | undefined,
  gateway: Pick<CalendarGateway, "events">,
) {
  if (!calendar?.permissions.read || calendar.permissions.freeBusyOnly)
    throw new CalendarProviderError(403, "calendar_unavailable");
  const response = await gateway.events(input.calendarId, {
    q: input.q,
    singleEvents: "true",
    maxResults: "100",
    orderBy: "startTime",
    ...(input.start ? { timeMin: input.start } : {}),
    ...(input.end ? { timeMax: input.end } : {}),
    ...(input.pageToken ? { pageToken: input.pageToken } : {}),
  });
  return {
    events: (response.items ?? []).map((raw) =>
      normalizeEvent(raw, { ...scope, calendarId: input.calendarId }, calendar.timeZone),
    ),
    nextPageToken: response.nextPageToken ?? null,
  };
}
