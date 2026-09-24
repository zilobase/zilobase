import { Effect, Schema, SchemaTransformation } from "effect";

const TimeZone = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(100)),
  Schema.check(
    Schema.makeFilter((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return undefined;
      } catch {
        return "Invalid time zone";
      }
    }),
  ),
);

const IsoDate = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format" })),
);

const IsoDateTime = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
      message: "Invalid date-time format",
    }),
  ),
);

export const EventTime = Schema.Union([
  Schema.Struct({ date: IsoDate }),
  Schema.Struct({
    dateTime: IsoDateTime,
    timeZone: TimeZone,
  }),
]);

export type EventTime = typeof EventTime.Type;

export const CalendarEventWrite = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
    ),
  ),
  description: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(100_000)))),
  location: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(4096)))),
  start: Schema.optionalKey(EventTime),
  end: Schema.optionalKey(EventTime),
  colorId: Schema.optionalKey(
    Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:[1-9]|10|11)$/)))),
  ),
  recurrence: Schema.optionalKey(
    Schema.Array(Schema.String.pipe(Schema.check(Schema.isMaxLength(2000)))).pipe(
      Schema.check(Schema.isMaxLength(20)),
    ),
  ),
  attendees: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        email: Schema.String.pipe(
          Schema.check(
            Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "Invalid email" }),
          ),
        ),
        displayName: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))),
        optional: Schema.optionalKey(Schema.Boolean),
        responseStatus: Schema.Literals(["needsAction", "declined", "tentative", "accepted"]).pipe(
          Schema.withDecodingDefault(Effect.succeed("needsAction" as const)),
        ),
      }),
    ).pipe(Schema.check(Schema.isMaxLength(200))),
  ),
  reminders: Schema.optionalKey(
    Schema.Struct({
      useDefault: Schema.Boolean,
      overrides: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            method: Schema.Literals(["email", "popup"]),
            minutes: Schema.Int.pipe(
              Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(40320)),
            ),
          }),
        ).pipe(Schema.check(Schema.isMaxLength(5))),
      ),
    }),
  ),
  transparency: Schema.optionalKey(Schema.Literals(["opaque", "transparent"])),
  visibility: Schema.optionalKey(Schema.Literals(["default", "public", "private"])),
});

export const CalendarWrite = Schema.Struct({
  operationId: Schema.String.check(Schema.isUUID()),
  etag: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(1024)))),
  sendUpdates: Schema.Literals(["all", "externalOnly", "none"]),
  recurrenceScope: Schema.optionalKey(Schema.Literals(["occurrence", "following", "series"])),
  createMeet: Schema.optionalKey(Schema.Boolean),
  event: CalendarEventWrite,
});

export type CalendarWrite = typeof CalendarWrite.Type;

export const calendarWriteSchema = {
  ...CalendarWrite,
  parse: (input: unknown): CalendarWrite => Schema.decodeUnknownSync(CalendarWrite)(input),
  safeParse: (input: unknown) => {
    try {
      const data = Schema.decodeUnknownSync(CalendarWrite)(input);
      return { success: true as const, data };
    } catch (error) {
      return { success: false as const, error };
    }
  },
};

export type CalendarMutationAction = "create" | "update" | "delete" | "rsvp" | "move" | "duplicate";

export function validateEventInterval(event: { start?: EventTime; end?: EventTime }) {
  if (!event.start || !event.end || "date" in event.start !== "date" in event.end) {
    throw new Error("Start and end must have matching date types.");
  }
  const start = "date" in event.start ? event.start.date : event.start.dateTime;
  const end = "date" in event.end ? event.end.date : event.end.dateTime;
  if (Date.parse(end) <= Date.parse(start)) {
    throw new Error("End must be after start.");
  }
}

export function providerEventPatch(input: CalendarWrite) {
  const { title, ...fields } = input.event;
  return { ...fields, ...(title === undefined ? {} : { summary: title }) };
}
