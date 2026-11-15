import type {
  CalendarEvent,
  CalendarEventTime,
  CalendarIdentity,
  CalendarRecord,
} from "@zilobase/features/runtime";
import { z } from "zod";
import { recordCalendarMetric } from "../metrics";
export class CalendarProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterMs = 0,
  ) {
    super(code);
  }
}
const GoogleTime = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
});

type GoogleTime = z.infer<typeof GoogleTime>;

/** Known Google event fields are validated; unrecognized top-level fields are preserved for writes. */
export const googleEventSchema = z.looseObject({
  id: z.string(),
  etag: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: GoogleTime.optional(),
  end: GoogleTime.optional(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
  eventType: z.string().optional(),
  recurringEventId: z.string().optional(),
  originalStartTime: GoogleTime.optional(),
  recurrence: z.array(z.string()).optional(),
  attendees: z
    .array(
      z.object({
        email: z.string(),
        displayName: z.string().optional(),
        optional: z.boolean().optional(),
        self: z.boolean().optional(),
        organizer: z.boolean().optional(),
        responseStatus: z
          .enum(["needsAction", "declined", "tentative", "accepted"])
          .default("needsAction"),
      }),
    )
    .optional(),
  organizer: z
    .object({
      email: z.string(),
      self: z.boolean().optional(),
    })
    .optional(),
  reminders: z
    .object({
      useDefault: z.boolean(),
      overrides: z
        .array(
          z.object({
            method: z.enum(["email", "popup"]),
            minutes: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
  transparency: z.enum(["opaque", "transparent"]).optional(),
  visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
  conferenceData: z
    .object({
      createRequest: z
        .object({
          status: z
            .object({
              statusCode: z.enum(["pending", "success", "failure"]).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  colorId: z.string().nullable().optional(),
  htmlLink: z.string().optional(),
  hangoutLink: z.string().optional(),
});

export type GoogleCalendarEvent = z.infer<typeof googleEventSchema> & {
  extendedProperties?: unknown;
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
