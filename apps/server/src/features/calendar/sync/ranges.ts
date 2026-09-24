import { recordCalendarMetric } from "../metrics";
import { and, eq } from "drizzle-orm";
import { Schema } from "effect";
import { db } from "../../../infrastructure/database";
import { calendarRangeSnapshot } from "../../../infrastructure/database/schema";
import type { CalendarRangeResponse } from "@zilobase/features/calendar";
import { CalendarGateway, CalendarProviderError, normalizeEvent } from "../provider/gateway";

const IsoDateTime = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
      message: "Invalid date-time format",
    }),
  ),
);

export const CalendarRange = Schema.Struct({
  calendarId: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(1024))),
  start: IsoDateTime,
  end: IsoDateTime,
  pageToken: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(4096)))),
}).check(
  Schema.makeFilter((r) =>
    Date.parse(r.end) > Date.parse(r.start) &&
    Date.parse(r.end) - Date.parse(r.start) <= 62 * 86400_000
      ? undefined
      : "Range must be positive and at most 62 days",
  ),
);

export type CalendarRange = typeof CalendarRange.Type;

export const calendarRangeSchema = {
  parse: (input: unknown) => Schema.decodeUnknownSync(CalendarRange)(input),
  safeParse: (input: unknown) => {
    try {
      const data = Schema.decodeUnknownSync(CalendarRange)(input);
      return { success: true as const, data };
    } catch (error) {
      return { success: false as const, error };
    }
  },
};

type RangeInput = CalendarRange & {
  accountId: string;
  bindingId: string;
  workspaceId: string;
  timeZone: string;
  generation: number;
  revision: number;
};
type Snapshot = typeof calendarRangeSnapshot.$inferSelect;
async function loadSnapshot(input: RangeInput) {
  if (!input.pageToken) return null;
  const [prior] = await db
    .select()
    .from(calendarRangeSnapshot)
    .where(
      and(
        eq(calendarRangeSnapshot.id, input.pageToken),
        eq(calendarRangeSnapshot.accountId, input.accountId),
        eq(calendarRangeSnapshot.calendarId, input.calendarId),
      ),
    );
  if (
    !prior ||
    prior.start !== input.start ||
    prior.end !== input.end ||
    prior.expiresAt.getTime() < Date.now()
  )
    throw new CalendarProviderError(400, "expired_range_cursor");
  return prior;
}
async function storeSnapshot(row: Snapshot, prior: Snapshot | null) {
  if (!prior) {
    await db.insert(calendarRangeSnapshot).values(row);
    return;
  }
  const [saved] = await db
    .update(calendarRangeSnapshot)
    .set(row)
    .where(
      and(
        eq(calendarRangeSnapshot.id, prior.id),
        eq(calendarRangeSnapshot.pageToken, prior.pageToken!),
      ),
    )
    .returning();
  if (!saved) throw new CalendarProviderError(409, "range_cursor_advanced");
}
export async function readCalendarRange(
  input: RangeInput,
  gateway: CalendarGateway,
  signal?: AbortSignal,
): Promise<CalendarRangeResponse> {
  const prior = await loadSnapshot(input);
  if (prior && !prior.pageToken) return result(prior, input);
  const began = performance.now();
  const response = await gateway.events(
    input.calendarId,
    {
      timeMin: input.start,
      timeMax: input.end,
      singleEvents: "true",
      maxResults: "1000",
      ...(prior?.pageToken ? { pageToken: prior.pageToken } : {}),
    },
    signal,
  );
  recordCalendarMetric("range_latency", performance.now() - began);
  const incoming = (response.items ?? []).map((raw) =>
    normalizeEvent(
      raw,
      { workspaceId: input.workspaceId, bindingId: input.bindingId, calendarId: input.calendarId },
      input.timeZone,
    ),
  );
  const base = prior ?? {
    id: crypto.randomUUID(),
    accountId: input.accountId,
    calendarId: input.calendarId,
    start: input.start,
    end: input.end,
    generation: input.generation,
    revision: input.revision,
    events: [],
  };
  const events = [
    ...new Map([...base.events, ...incoming].map((event) => [event.eventId, event])).values(),
  ];
  const row = {
    ...base,
    events,
    pageToken: response.nextPageToken ?? null,
    expiresAt: new Date(Date.now() + 600_000),
  };
  await storeSnapshot(row, prior);
  return result(row, input);
}
function result(
  row: Snapshot,
  input: { bindingId: string; workspaceId: string },
): CalendarRangeResponse {
  return {
    calendarId: row.calendarId,
    start: row.start,
    end: row.end,
    generation: row.generation,
    revision: row.revision,
    events: row.pageToken
      ? []
      : row.events.map((event) => ({
          ...event,
          bindingId: input.bindingId,
          workspaceId: input.workspaceId,
        })),
    complete: !row.pageToken,
    nextPageToken: row.pageToken ? row.id : null,
  };
}
