import { Schema, SchemaTransformation } from "effect";
import type { CalendarScope, CalendarRecord } from "@zilobase/features/calendar";
import { CalendarProviderError, normalizeEvent, type CalendarGateway } from "../provider/gateway";

const IsoDateTime = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
      message: "Invalid date-time format",
    }),
  ),
);

export const CalendarSearch = Schema.Struct({
  calendarId: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(1024))),
  q: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
  ),
  start: Schema.optionalKey(IsoDateTime),
  end: Schema.optionalKey(IsoDateTime),
  pageToken: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(4096)))),
}).check(
  Schema.makeFilter((value) =>
    !value.start || !value.end || Date.parse(value.end) > Date.parse(value.start)
      ? undefined
      : "End must follow start",
  ),
);

export type CalendarSearch = typeof CalendarSearch.Type;

export const calendarSearchSchema = {
  parse: (input: unknown) => Schema.decodeUnknownSync(CalendarSearch)(input),
  safeParse: (input: unknown) => {
    try {
      const data = Schema.decodeUnknownSync(CalendarSearch)(input);
      return { success: true as const, data };
    } catch (error) {
      return { success: false as const, error };
    }
  },
};

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
