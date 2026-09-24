import { recordCalendarMetric } from "../metrics";
import { Effect, Schema } from "effect";
import type {
  CalendarEvent,
  CalendarEventTime,
  CalendarIdentity,
  CalendarRecord,
} from "@zilobase/features/calendar";
export class CalendarProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterMs = 0,
  ) {
    super(code);
  }
}
const GoogleTime = Schema.Struct({
  date: Schema.optionalKey(Schema.String),
  dateTime: Schema.optionalKey(Schema.String),
  timeZone: Schema.optionalKey(Schema.String),
});

type GoogleTime = typeof GoogleTime.Type;

export const GoogleEvent = Schema.Struct({
  id: Schema.String,
  etag: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  location: Schema.optionalKey(Schema.String),
  start: Schema.optionalKey(GoogleTime),
  end: Schema.optionalKey(GoogleTime),
  status: Schema.optionalKey(Schema.Literals(["confirmed", "tentative", "cancelled"])),
  eventType: Schema.optionalKey(Schema.String),
  recurringEventId: Schema.optionalKey(Schema.String),
  originalStartTime: Schema.optionalKey(GoogleTime),
  recurrence: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.String))),
  attendees: Schema.optionalKey(
    Schema.mutable(
      Schema.Array(
        Schema.Struct({
          email: Schema.String,
          displayName: Schema.optionalKey(Schema.String),
          optional: Schema.optionalKey(Schema.Boolean),
          self: Schema.optionalKey(Schema.Boolean),
          organizer: Schema.optionalKey(Schema.Boolean),
          responseStatus: Schema.Literals([
            "needsAction",
            "declined",
            "tentative",
            "accepted",
          ]).pipe(Schema.withDecodingDefault(Effect.succeed("needsAction" as const))),
        }),
      ),
    ),
  ),
  organizer: Schema.optionalKey(
    Schema.Struct({
      email: Schema.String,
      self: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  reminders: Schema.optionalKey(
    Schema.Struct({
      useDefault: Schema.Boolean,
      overrides: Schema.optionalKey(
        Schema.mutable(
          Schema.Array(
            Schema.Struct({
              method: Schema.Literals(["email", "popup"]),
              minutes: Schema.Number,
            }),
          ),
        ),
      ),
    }),
  ),
  transparency: Schema.optionalKey(Schema.Literals(["opaque", "transparent"])),
  visibility: Schema.optionalKey(Schema.Literals(["default", "public", "private", "confidential"])),
  conferenceData: Schema.optionalKey(
    Schema.Struct({
      createRequest: Schema.optionalKey(
        Schema.Struct({
          status: Schema.optionalKey(
            Schema.Struct({
              statusCode: Schema.optionalKey(Schema.Literals(["pending", "success", "failure"])),
            }),
          ),
        }),
      ),
    }),
  ),
  colorId: Schema.optionalKey(Schema.String),
  htmlLink: Schema.optionalKey(Schema.String),
  hangoutLink: Schema.optionalKey(Schema.String),
});

export type GoogleCalendarEvent = typeof GoogleEvent.Type & {
  extendedProperties?: unknown;
  [key: string]: unknown;
};

export const googleEventSchema = {
  ...GoogleEvent,
  parse: (input: unknown): GoogleCalendarEvent => {
    const parsed = Schema.decodeUnknownSync(GoogleEvent)(input);
    return typeof input === "object" && input !== null
      ? ({ ...input, ...parsed } as GoogleCalendarEvent)
      : (parsed as GoogleCalendarEvent);
  },
  safeParse: (input: unknown) => {
    try {
      return { success: true as const, data: googleEventSchema.parse(input) };
    } catch (error) {
      return { success: false as const, error };
    }
  },
};
export class CalendarGateway {
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    return this.deliver<T>(path, options, 0);
  }
  private async deliver<T>(path: string, options: RequestInit, attempt: number): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid Calendar provider path");
    const response = await this.fetcher(`https://www.googleapis.com/calendar/v3${path}`, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
      headers: {
        "content-type": "application/json",
        ...options.headers,
        authorization: `Bearer ${this.token}`,
      },
    });
    if (response.status === 429) recordCalendarMetric("throttling", 1, "failure");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { errors?: { reason?: string }[] };
      };
      const reason = body.error?.errors?.[0]?.reason ?? "provider_error";
      const header = response.headers.get("retry-after");
      const retryAfterMs = header
        ? Math.max(
            0,
            Number.isFinite(Number(header))
              ? Number(header) * 1000
              : Date.parse(header) - Date.now(),
          )
        : 0;
      const transient =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 &&
          ["rateLimitExceeded", "userRateLimitExceeded", "usageLimits"].includes(reason));
      if (
        (!options.method || options.method === "GET") &&
        transient &&
        attempt < 3 &&
        retryAfterMs <= 32_000
      ) {
        await waitForRetry(
          Math.max(retryAfterMs, Math.min(32_000, 1000 * 2 ** attempt + Math.random() * 1000)),
          options.signal,
        );
        return this.deliver<T>(path, options, attempt + 1);
      }
      throw new CalendarProviderError(response.status, reason, retryAfterMs);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
  async calendars(bindingId: string): Promise<CalendarRecord[]> {
    const records: CalendarRecord[] = [];
    let pageToken: string | undefined;
    do {
      const response = await this.request<{
        items?: {
          id: string;
          summary?: string;
          timeZone?: string;
          colorId?: string;
          primary?: boolean;
          accessRole?: string;
          defaultReminders?: CalendarRecord["defaultReminders"];
        }[];
        nextPageToken?: string;
      }>(
        `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      for (const item of response.items ?? [])
        records.push({
          id: item.id,
          bindingId,
          name: item.summary ?? item.id,
          timeZone: item.timeZone ?? "UTC",
          colorId: item.colorId ?? null,
          primary: item.primary ?? false,
          defaultReminders: item.defaultReminders ?? [],
          permissions: {
            read: item.accessRole !== "none",
            write: ["writer", "owner"].includes(item.accessRole ?? ""),
            owner: item.accessRole === "owner",
            freeBusyOnly: item.accessRole === "freeBusyReader",
          },
        });
      pageToken = response.nextPageToken;
    } while (pageToken);
    return records;
  }
  events(calendarId: string, params: Record<string, string>, signal?: AbortSignal) {
    return this.request<{
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(`/calendars/${encodeURIComponent(calendarId)}/events?${new URLSearchParams(params)}`, {
      signal,
    });
  }
}
export function normalizeEvent(
  raw: unknown,
  scope: Omit<CalendarIdentity, "eventId">,
  zone: string,
): CalendarEvent {
  const event = googleEventSchema.parse(raw);
  const normalizeTime = (value: GoogleTime | undefined): CalendarEventTime => {
    if (value?.date) return { date: value.date };
    if (value?.dateTime) return { dateTime: value.dateTime, timeZone: value.timeZone ?? zone };
    if (event.status === "cancelled") return { date: "1970-01-01" };
    throw new CalendarProviderError(502, "invalid_event_time");
  };
  return {
    ...scope,
    eventId: event.id,
    etag: event.etag ?? "",
    title: event.summary ?? "Untitled event",
    description: event.description ?? "",
    location: event.location ?? "",
    start: normalizeTime(event.start),
    end: normalizeTime(event.end),
    status: event.status ?? "confirmed",
    eventType: event.eventType ?? "default",
    recurringEventId: event.recurringEventId,
    originalStartTime: event.originalStartTime ? normalizeTime(event.originalStartTime) : undefined,
    recurrence: event.recurrence,
    attendees: event.attendees ?? [],
    organizer: event.organizer,
    reminders: event.reminders ?? { useDefault: true },
    transparency: event.transparency ?? "opaque",
    visibility: event.visibility ?? "default",
    colorId: event.colorId ?? null,
    htmlLink: event.htmlLink ?? "",
    conferenceUrl: event.hangoutLink,
    conferenceStatus: conferenceStatus(event),
  };
}

function conferenceStatus(event: GoogleCalendarEvent) {
  return event.conferenceData?.createRequest?.status?.statusCode;
}

function waitForRetry(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Calendar read cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
